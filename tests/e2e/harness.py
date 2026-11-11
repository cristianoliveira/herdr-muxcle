"""Owned, isolated macOS session for interactive Herdr Term tests.

The harness starts only a scratch core and a copied Herdr.app bundle. It never
uses the installed bundle as the GUI process, and keeps run artifacts separate
from disposable app/core state.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import plistlib
import re
import secrets
import select
import shutil
import socket
import stat
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_SCRIPT = PROJECT_ROOT / "tests" / "e2e" / "fixture.py"
LAYOUT_NAME = "muxcle-fixture"
CORE_GENERATION = 1
MAX_RPC_LINE = 4 * 1024 * 1024
MAX_WAIT_SECONDS = 60.0
DEFAULT_TIMEOUT = 12.0
MACOS_SOCKET_PATH_LIMIT = 103
HOLDER_ID_LENGTH = 8
SCRATCH_PARENT = Path("/private/tmp")


class HarnessError(RuntimeError):
    """A precondition or owned test operation failed."""


class HarnessUnavailable(HarnessError):
    """The host cannot safely run the native GUI test."""


class OwnershipError(HarnessError):
    """The harness cannot prove that a process or path is still its own."""


def _bounded_timeout(timeout: float) -> float:
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)):
        raise ValueError("timeout must be a positive number")
    if not 0 < timeout <= MAX_WAIT_SECONDS:
        raise ValueError(f"timeout must be greater than 0 and at most {MAX_WAIT_SECONDS:g} seconds")
    return float(timeout)


def _create_output_directory(path: Path) -> Path:
    """Create one new artifact directory; existing paths are never reused."""
    path = Path(path).absolute()
    if path.exists() or path.is_symlink():
        raise HarnessError(f"artifact output must be a new directory: {path}")
    try:
        path.mkdir(mode=0o700, parents=False)
    except OSError as error:
        raise HarnessError(f"cannot create artifact output {path}: {error}") from error
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
        raise HarnessError(f"artifact output is not a private directory: {path}")
    return path


def _build_environment(
    *, root: Path, nonce: str, hc: Path, python: Path, releases_url: str
) -> dict[str, str]:
    """Build a strict allowlist. Nothing from the caller's environment is copied."""
    home = root / "home"
    app_home = root / "app-home"
    runtime = root / "run"
    paths = [
        str(root / "bin"),
        str(Path(hc).parent),
        str(Path(python).parent),
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]
    unique_paths = list(dict.fromkeys(paths))
    return {
        "HOME": str(home),
        "SHELL": "/bin/sh",
        "PATH": os.pathsep.join(unique_paths),
        "TMPDIR": str(root / "tmp"),
        "XDG_CACHE_HOME": str(root / "cache"),
        "XDG_CONFIG_HOME": str(root / "config"),
        "XDG_DATA_HOME": str(root / "data"),
        "XDG_RUNTIME_DIR": str(runtime),
        "XDG_STATE_HOME": str(root / "state"),
        "HC_SESSION": f"muxcle-e2e-{nonce}",
        "HERDR_APP_HOME": str(app_home),
        "HERDR_APP_ID": f"muxcle-e2e-{nonce}",
        "HERDR_RELEASES_URL": releases_url,
        "HERDR_TELEMETRY": "0",
        "DO_NOT_TRACK": "1",
    }


def _discover_app_bundle(app_launcher: Path, override: Path | None) -> Path:
    """Find a bundle beside the resolved launcher; never launch that bundle in place."""
    if override is not None:
        candidate = Path(override).expanduser().absolute()
        return _validate_app_bundle(candidate)
    launcher = Path(app_launcher).expanduser().resolve(strict=True)

    candidates: list[Path] = []
    if launcher.parent.name == "MacOS" and launcher.parent.parent.name == "Contents":
        candidates.append(launcher.parent.parent.parent)
    if launcher.parent.name == "bin":
        candidates.append(launcher.parent.parent / "Applications" / "Herdr.app")
    for parent in launcher.parents:
        if parent.name == "Herdr.app":
            candidates.append(parent)

    for candidate in candidates:
        try:
            return _validate_app_bundle(candidate)
        except HarnessError:
            continue
    raise HarnessUnavailable(
        f"cannot find a usable Herdr.app beside {launcher}; pass app_bundle explicitly"
    )


def _validate_app_bundle(bundle: Path) -> Path:
    bundle = Path(bundle).expanduser().absolute()
    executable = bundle / "Contents" / "MacOS" / "Herdr"
    info = bundle / "Contents" / "Info.plist"
    if bundle.name != "Herdr.app" or not bundle.is_dir() or bundle.is_symlink():
        raise HarnessError(f"not a Herdr.app bundle: {bundle}")
    if not executable.is_file() or not os.access(executable, os.X_OK):
        raise HarnessError(f"Herdr.app has no executable Contents/MacOS/Herdr: {bundle}")
    if not info.is_file() or info.is_symlink():
        raise HarnessError(f"Herdr.app has no regular Contents/Info.plist: {bundle}")
    return bundle


def _bundle_version(bundle: Path) -> str:
    info = Path(bundle) / "Contents" / "Info.plist"
    try:
        with info.open("rb") as source:
            value = plistlib.load(source).get("CFBundleShortVersionString")
    except (OSError, plistlib.InvalidFileException, AttributeError, TypeError, ValueError) as error:
        raise HarnessError(f"cannot read app version from {info}: {error}") from error
    if not isinstance(value, str) or not re.fullmatch(r"\d+\.\d+\.\d+", value):
        raise HarnessError(f"Herdr.app has no stable X.Y.Z version in {info}")
    return value


def _copy_app_bundle(source: Path, destination: Path) -> Path:
    if destination.exists() or destination.is_symlink():
        raise HarnessError(f"scratch app bundle path already exists: {destination}")
    try:
        shutil.copytree(source, destination, symlinks=True, copy_function=shutil.copy2)
    except OSError as error:
        raise HarnessError(f"cannot copy Herdr.app into scratch: {error}") from error
    executable = destination / "Contents" / "MacOS" / "Herdr"
    if not executable.is_file() or not os.access(executable, os.X_OK):
        raise HarnessError(f"copied app has no executable: {executable}")
    resolved = executable.resolve(strict=True)
    if not resolved.is_relative_to(destination.resolve(strict=True)):
        raise HarnessError("copied app executable resolves outside the scratch bundle")
    return executable


def _validate_package_payload(payload: Path, name: str, version: str) -> dict[str, Any]:
    payload = Path(payload)
    if payload.is_symlink() or not payload.is_dir():
        raise HarnessError(f"missing unpacked dist payload for {name}: {payload}")
    manifest_path = payload / "manifest.json"
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise HarnessError(f"missing package manifest: {manifest_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise HarnessError(f"invalid package manifest {manifest_path}: {error}") from error
    if not isinstance(manifest, dict) or manifest.get("name") != name or manifest.get("version") != version:
        raise HarnessError(f"dist manifest does not match {name} {version}")

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise HarnessError(f"dist manifest has no file list: {manifest_path}")
    seen: set[str] = set()
    base = payload.resolve(strict=True)
    for item in files:
        if not isinstance(item, str) or item in seen:
            raise HarnessError(f"invalid or duplicate path in {manifest_path}: {item!r}")
        seen.add(item)
        relative = PurePosixPath(item)
        if relative.is_absolute() or any(part in ("", ".", "..") for part in relative.parts):
            raise HarnessError(f"unsafe path in {manifest_path}: {item!r}")
        candidate = payload.joinpath(*relative.parts)
        if candidate.is_symlink() or not candidate.is_file():
            raise HarnessError(f"missing or linked package file: {candidate}")
        resolved = candidate.resolve(strict=True)
        if not resolved.is_relative_to(base):
            raise HarnessError(f"package file escapes its dist payload: {candidate}")
    if "manifest.json" not in seen:
        raise HarnessError(f"manifest does not list itself: {manifest_path}")
    _validate_dist_archive(payload, seen)
    for candidate in payload.rglob("*"):
        if candidate.is_symlink():
            raise HarnessError(f"linked entry in dist payload: {candidate}")
        if candidate.is_file() and candidate.relative_to(payload).as_posix() not in seen:
            raise HarnessError(f"unlisted file in dist payload: {candidate}")
    return manifest


def _validate_dist_archive(payload: Path, expected_files: set[str]) -> None:
    archive = payload.parent / f"{payload.name}.tar.gz"
    checksum = payload.parent / f"{archive.name}.sha256"
    if archive.is_symlink() or not archive.is_file() or checksum.is_symlink() or not checksum.is_file():
        raise HarnessError(f"dist archive or checksum is missing for {payload.name}")
    digest = hashlib.sha256()
    with archive.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    checksum_fields = checksum.read_text(encoding="ascii").strip().split()
    if len(checksum_fields) != 2 or checksum_fields[1] != archive.name or checksum_fields[0].lower() != digest.hexdigest():
        raise HarnessError(f"dist archive checksum mismatch: {archive}")

    found_files: set[str] = set()
    root_name = payload.name
    try:
        with tarfile.open(archive, "r:gz") as package:
            for member in package.getmembers():
                member_path = PurePosixPath(member.name)
                if member_path.is_absolute() or any(part in ("", ".", "..") for part in member_path.parts):
                    raise HarnessError(f"unsafe archive path in {archive}: {member.name!r}")
                if not member_path.parts or member_path.parts[0] != root_name:
                    raise HarnessError(f"unexpected archive root in {archive}: {member.name!r}")
                if member.isdir():
                    continue
                if not member.isfile():
                    raise HarnessError(f"non-regular entry in dist archive: {member.name!r}")
                relative = PurePosixPath(*member_path.parts[1:]).as_posix()
                if not relative or relative in found_files:
                    raise HarnessError(f"duplicate or empty archive file path: {member.name!r}")
                found_files.add(relative)
                if relative not in expected_files:
                    raise HarnessError(f"unlisted file in dist archive: {member.name!r}")
                archived = package.extractfile(member)
                if archived is None:
                    raise HarnessError(f"cannot read archived package file: {member.name!r}")
                archived_hash = hashlib.sha256()
                with archived:
                    for block in iter(lambda: archived.read(1024 * 1024), b""):
                        archived_hash.update(block)
                local_hash = hashlib.sha256((payload / relative).read_bytes()).hexdigest()
                if archived_hash.hexdigest() != local_hash:
                    raise HarnessError(f"dist archive differs from unpacked payload: {member.name!r}")
    except (OSError, tarfile.TarError) as error:
        raise HarnessError(f"invalid dist archive {archive}: {error}") from error
    if found_files != expected_files:
        raise HarnessError(f"dist archive contents do not match manifest: {archive}")


def _workspace_node(layout: dict[str, Any]) -> dict[str, Any]:
    pending = [layout]
    while pending:
        node = pending.pop()
        if isinstance(node, dict):
            if node.get("id") == "workspace":
                if node.get("type") != "column" or not isinstance(node.get("children"), list):
                    break
                return node
            pending.extend(node.get("children", []))
    raise HarnessError("base layout has no workspace column for package hosts")


def _deploy_packages(
    dist: Path, version: str, packages: Iterable[str], app_home: Path
) -> None:
    """Copy current unpacked dist mods and build a fixture layout with their hosts."""
    requested = list(packages)
    for name in requested:
        if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name):
            raise HarnessError(f"invalid package name: {name!r}")
    if len(set(requested)) != len(requested):
        raise HarnessError("package names must be unique")
    all_packages = ["herdr-muxcle", *[name for name in requested if name != "herdr-muxcle"]]
    payloads: dict[str, Path] = {}
    for name in all_packages:
        payload = Path(dist) / f"{name}-v{version}"
        _validate_package_payload(payload, name, version)
        payloads[name] = payload

    mods_dir = app_home / "mods"
    layouts_dir = app_home / "layouts"
    mods_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    layouts_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    installed_mods: set[str] = set()
    hosts: list[dict[str, Any]] = []
    merged_keys: dict[str, dict[str, str]] = {}

    for package_name, payload in payloads.items():
        mod_name = "muxcle-compat" if package_name == "herdr-muxcle" else package_name
        source_mod = payload / "mods" / mod_name
        if source_mod.exists():
            if source_mod.is_symlink() or not source_mod.is_dir() or not (source_mod / "mod.json").is_file():
                raise HarnessError(f"dist payload has no installable mod folder: {source_mod}")
            destination_mod = mods_dir / mod_name
            if destination_mod.exists() or destination_mod.is_symlink():
                raise HarnessError(f"duplicate mod install target: {destination_mod}")
            shutil.copytree(source_mod, destination_mod, symlinks=False)
            installed_mods.add(mod_name)
        elif package_name == "herdr-muxcle":
            raise HarnessError(f"base package has no installable mod folder: {source_mod}")

        keys_path = payload / "keys.json"
        if keys_path.exists():
            if keys_path.is_symlink() or not keys_path.is_file():
                raise HarnessError(f"invalid package key file: {keys_path}")
            try:
                package_keys = json.loads(keys_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise HarnessError(f"invalid package key file {keys_path}: {error}") from error
            if not isinstance(package_keys, dict):
                raise HarnessError(f"package key file must contain context maps: {keys_path}")
            for context, bindings in package_keys.items():
                if not isinstance(context, str) or not isinstance(bindings, dict):
                    raise HarnessError(f"invalid key binding context in {keys_path}")
                target_bindings = merged_keys.setdefault(context, {})
                for chord, command in bindings.items():
                    if not isinstance(chord, str) or not isinstance(command, str):
                        raise HarnessError(f"invalid key binding in {keys_path}")
                    existing = target_bindings.get(chord)
                    if existing is not None and existing != command:
                        raise HarnessError(f"conflicting key binding {context}/{chord}: {existing} vs {command}")
                    target_bindings[chord] = command

        for host_name in ("host.json", "observer.json"):
            host_path = payload / host_name
            if not host_path.exists():
                continue
            if host_path.is_symlink() or not host_path.is_file():
                raise HarnessError(f"invalid package host file: {host_path}")
            try:
                host = json.loads(host_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise HarnessError(f"invalid package host file {host_path}: {error}") from error
            content = host.get("content") if isinstance(host, dict) else None
            if (
                not isinstance(host, dict)
                or host.get("type") != "block"
                or not isinstance(host.get("id"), str)
                or not isinstance(content, dict)
                or content.get("mod") != mod_name
                or mod_name not in installed_mods
            ):
                raise HarnessError(f"host does not mount installed mod {mod_name}: {host_path}")
            hosts.append(host)

    if merged_keys:
        keys_target = app_home / "keys.json"
        with keys_target.open("x", encoding="utf-8") as output:
            json.dump(merged_keys, output, indent=2)
            output.write("\n")

    base_payload = payloads["herdr-muxcle"]
    layout_source = base_payload / "layouts" / "muxcle.json"
    try:
        layout = json.loads(layout_source.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise HarnessError(f"invalid base layout {layout_source}: {error}") from error
    if not isinstance(layout, dict):
        raise HarnessError(f"invalid base layout: {layout_source}")

    workspace = _workspace_node(layout)
    existing_ids = {node.get("id") for node in workspace["children"] if isinstance(node, dict)}
    for host in hosts:
        if host["id"] in existing_ids:
            raise HarnessError(f"duplicate fixture layout block id: {host['id']}")
        if host["content"]["mod"] not in installed_mods:
            raise HarnessError(f"fixture host points to an uninstalled mod: {host['content']['mod']}")
        workspace["children"].append(host)
        existing_ids.add(host["id"])

    layout_target = layouts_dir / f"{LAYOUT_NAME}.json"
    with layout_target.open("x", encoding="utf-8") as output:
        json.dump(layout, output, indent=2)
        output.write("\n")


def _make_owned_tree_removable(root: Path) -> None:
    if root.is_symlink():
        raise OwnershipError(f"refusing to walk symlinked scratch tree: {root}")
    for current, directories, _files in os.walk(root, topdown=True, followlinks=False):
        directory = Path(current)
        if directory.is_symlink():
            continue
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode):
            raise OwnershipError(f"unexpected non-directory in scratch tree: {directory}")
        os.chmod(directory, info.st_mode | stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
        directories[:] = [name for name in directories if not (directory / name).is_symlink()]


def _validate_socket_path_length(socket_path: Path) -> None:
    holder_socket = socket_path.with_suffix(".holder.sock")
    longest_socket = len(os.fsencode(str(holder_socket))) + 1 + HOLDER_ID_LENGTH
    if max(len(os.fsencode(str(socket_path))), longest_socket) > MACOS_SOCKET_PATH_LIMIT:
        raise HarnessUnavailable("scratch core socket path exceeds the macOS Unix-socket limit")


def _socket_identity(path: Path) -> tuple[int, int]:
    try:
        info = path.lstat()
    except OSError as error:
        raise OwnershipError(f"owned socket is unavailable: {path}: {error}") from error
    if not stat.S_ISSOCK(info.st_mode):
        raise OwnershipError(f"expected a Unix socket, found another file: {path}")
    return info.st_dev, info.st_ino


def _socket_owned_by(
    lsof: Path, pid: int, path: Path, env: dict[str, str], timeout: float = 3.0
) -> bool:
    try:
        result = subprocess.run(
            [str(lsof), "-a", "-p", str(pid), "-U", "-Fn"],
            env=env,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    lines = set(result.stdout.splitlines())
    socket_names = {f"n{path}", f"n{Path(os.path.realpath(path))}"}
    return result.returncode == 0 and f"p{pid}" in lines and bool(socket_names & lines)


def _read_json_result(result: subprocess.CompletedProcess[str], command: str) -> Any:
    if result.returncode != 0:
        raise HarnessError(f"{command} failed ({result.returncode}): {result.stderr.strip()}")
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise HarnessError(f"{command} returned invalid JSON: {error}") from error
    if isinstance(value, dict) and "error" in value:
        raise HarnessError(f"{command} returned an error: {value['error']}")
    return value


class CoreConnection:
    """One RPC stream plus a separate event subscriber; never multiplex them."""

    def __init__(
        self,
        hc: Path,
        env: dict[str, str],
        log_directory: Path,
        timeout: float = 10.0,
    ) -> None:
        self.hc = hc
        self.env = env
        self.timeout = _bounded_timeout(timeout)
        self.process: subprocess.Popen[bytes] | None = None
        self.event_process: subprocess.Popen[bytes] | None = None
        self._rpc_log = (log_directory / "core-rpc.log").open("ab", buffering=0)
        self._event_log = (log_directory / "core-events.log").open("ab", buffering=0)
        self._selector: Any = None
        self._event_selector: Any = None
        self._buffer = bytearray()
        self._event_buffer = bytearray()
        self._sequence = 0
        self.owned_terminals: dict[str, dict[str, Any]] = {}
        self._closed = False
        try:
            self.process = subprocess.Popen(
                [str(hc), "connect"],
                env=env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=self._rpc_log,
                bufsize=0,
                start_new_session=True,
            )
            if self.process.stdin is None or self.process.stdout is None:
                raise HarnessError("hc connect did not provide RPC pipes")
            import selectors

            self._selector = selectors.DefaultSelector()
            self._selector.register(self.process.stdout, selectors.EVENT_READ)
            self.call("hello", {"generation": CORE_GENERATION, "framed": False})
            status = self.call("server.status", {})
            self.status = status
            initial = self.call("terminal.list", {"all": True})
            if not isinstance(initial, dict) or initial.get("terminals") != []:
                raise OwnershipError("new scratch core was not empty before app startup")
            self.event_process = subprocess.Popen(
                [str(hc), "events"],
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=self._event_log,
                bufsize=0,
                start_new_session=True,
            )
            if self.event_process.stdout is None:
                raise HarnessError("hc events did not provide an event stream")
            self._event_selector = selectors.DefaultSelector()
            self._event_selector.register(self.event_process.stdout, selectors.EVENT_READ)
            self._read_event(self.timeout)  # Discard the subscription's initial snapshot.
        except BaseException:
            self.close()
            raise

    def _read_line(self, *, event: bool, timeout: float) -> dict[str, Any]:
        process = self.event_process if event else self.process
        selector = self._event_selector if event else self._selector
        buffer = self._event_buffer if event else self._buffer
        stream = process.stdout if process is not None else None
        if stream is None or selector is None:
            raise HarnessError("core stream is not available")
        deadline = time.monotonic() + _bounded_timeout(timeout)
        while b"\n" not in buffer:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not selector.select(remaining):
                raise TimeoutError("owned core response/event timed out")
            chunk = os.read(stream.fileno(), 65_536)
            if not chunk:
                raise HarnessError("owned core connection ended")
            buffer.extend(chunk)
            if len(buffer) > MAX_RPC_LINE:
                raise HarnessError("owned core returned an oversized JSON line")
        line, _, rest = buffer.partition(b"\n")
        buffer[:] = rest
        try:
            value = json.loads(line)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise HarnessError(f"owned core emitted invalid JSON: {error}") from error
        if not isinstance(value, dict):
            raise HarnessError("owned core emitted a non-object JSON message")
        return value

    def call(self, method: str, params: dict[str, Any] | None = None, timeout: float | None = None) -> Any:
        process = self.process
        if self._closed or process is None or process.stdin is None:
            raise HarnessError("owned core RPC connection is closed")
        duration = self.timeout if timeout is None else _bounded_timeout(timeout)
        if method == "terminal.run" and isinstance(params, dict) and params.get("on"):
            raise OwnershipError("E2E harness refuses terminals on another machine")
        request_id = self._sequence
        self._sequence += 1
        request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": {} if params is None else params,
        }
        encoded = (json.dumps(request, separators=(",", ":")) + "\n").encode()
        try:
            process.stdin.write(encoded)
            process.stdin.flush()
        except (BrokenPipeError, OSError) as error:
            raise HarnessError("owned core RPC input closed") from error
        deadline = time.monotonic() + duration
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"owned core RPC {method} timed out")
            response = self._read_line(event=False, timeout=remaining)
            if response.get("id") != request_id:
                continue
            if "error" in response:
                raise HarnessError(f"core {method} failed: {response['error']}")
            if "result" not in response:
                raise HarnessError(f"core {method} returned no result")
            result = response["result"]
            self._track_terminal_result(method, params or {}, result)
            return result

    def _track_terminal_result(self, method: str, params: dict[str, Any], result: Any) -> None:
        if method == "terminal.run":
            terminal = result.get("terminal", result) if isinstance(result, dict) else None
            address = terminal.get("address") if isinstance(terminal, dict) else None
            if not isinstance(address, str):
                raise OwnershipError("terminal.run succeeded without an address to track")
            record: dict[str, Any] = {}
            if isinstance(terminal.get("created_ms"), int):
                record["created_ms"] = terminal["created_ms"]
            if isinstance(terminal.get("argv"), list):
                record["argv"] = terminal["argv"]
            if isinstance(terminal.get("pid"), int):
                record["pid"] = terminal["pid"]
            self.track_terminal(address, record)
        elif method == "terminal.rm" and isinstance(result, dict):
            removed = result.get("removed")
            if isinstance(removed, str):
                self.owned_terminals.pop(removed, None)

    def track_terminal(self, address: str, identity: dict[str, Any] | None = None) -> None:
        if not re.fullmatch(r"t[0-9]+", address):
            raise OwnershipError(f"invalid local terminal address: {address!r}")
        record = {} if identity is None else dict(identity)
        existing = self.owned_terminals.get(address)
        if existing is not None and existing != record:
            raise OwnershipError(f"terminal identity changed for {address}")
        self.owned_terminals[address] = record

    def cleanup_terminals(self, timeout: float = 15.0) -> None:
        duration = _bounded_timeout(timeout)
        listing = self.call("terminal.list", {"all": True}, timeout=duration)
        terminals = listing.get("terminals") if isinstance(listing, dict) else None
        if not isinstance(terminals, list):
            raise OwnershipError("core terminal listing is malformed")
        by_address = {item.get("address"): item for item in terminals if isinstance(item, dict)}
        foreign = set(by_address) - self.owned_terminals.keys()
        if foreign:
            raise OwnershipError(f"refusing to stop core with untracked terminals: {sorted(foreign)}")

        deadline = time.monotonic() + duration
        for address, identity in list(self.owned_terminals.items()):
            terminal = by_address.get(address)
            if terminal is None:
                self.owned_terminals.pop(address, None)
                continue
            self._verify_terminal_identity(address, terminal, identity)
            if terminal.get("state") == "live":
                self.call("terminal.kill", {"terminal": address}, timeout=self._remaining(deadline))
            while True:
                terminal = self.call("terminal.get", {"terminal": address}, timeout=self._remaining(deadline))
                self._verify_terminal_identity(address, terminal, identity)
                if terminal.get("state") != "live":
                    break
            removed = self.call("terminal.rm", {"terminal": address}, timeout=self._remaining(deadline))
            if not isinstance(removed, dict) or removed.get("removed") != address:
                raise OwnershipError(f"core did not remove owned fixture terminal {address}")
            self.owned_terminals.pop(address, None)

        final_listing = self.call("terminal.list", {"all": True}, timeout=self._remaining(deadline))
        remaining = final_listing.get("terminals") if isinstance(final_listing, dict) else None
        if remaining != []:
            addresses = [item.get("address") for item in remaining or [] if isinstance(item, dict)]
            raise OwnershipError(f"terminals remain after fixture cleanup: {addresses}")

    @staticmethod
    def _verify_terminal_identity(address: str, terminal: Any, identity: dict[str, Any]) -> None:
        if not isinstance(terminal, dict) or terminal.get("address") != address:
            raise OwnershipError(f"terminal identity changed for {address}")
        for key in ("created_ms", "argv"):
            if key in identity and terminal.get(key) != identity[key]:
                raise OwnershipError(f"terminal {address} no longer matches its tracked {key}")

    @staticmethod
    def _remaining(deadline: float) -> float:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("fixture terminal cleanup timed out")
        return min(remaining, MAX_WAIT_SECONDS)

    def document(self, name: str = "herdr-app", timeout: float | None = None) -> dict[str, Any]:
        return self.call("doc.get", {"name": name}, timeout=timeout)

    def wait(
        self, predicate: Callable[[dict[str, Any]], bool], timeout: float = DEFAULT_TIMEOUT
    ) -> dict[str, Any]:
        duration = _bounded_timeout(timeout)
        deadline = time.monotonic() + duration
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("owned core document predicate timed out")
            document = self.document(timeout=min(self.timeout, remaining))
            if predicate(document):
                return document
            self._read_event(min(self.timeout, max(0.001, deadline - time.monotonic())))

    def _read_event(self, timeout: float) -> dict[str, Any]:
        return self._read_line(event=True, timeout=timeout)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        for selector in (self._event_selector, self._selector):
            if selector is not None:
                try:
                    selector.close()
                except OSError:
                    pass
        for process in (self.event_process, self.process):
            if process is None:
                continue
            if process.stdin is not None and process is self.process:
                try:
                    process.stdin.close()
                except OSError:
                    pass
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                # This is the exact hc client child created above, never the core.
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    pass
        self._rpc_log.close()
        self._event_log.close()


class NativeSession:
    """Start and own one isolated Herdr/core run for native UI scenarios.

    `artifacts` must be a new output directory. The harness preserves it, but
    removes its private scratch root only after all owned processes have stopped.
    """

    def __init__(
        self,
        artifacts: Path,
        packages: Iterable[str] = (),
        app_bundle: Path | None = None,
    ) -> None:
        if isinstance(packages, str):
            raise HarnessError("packages must be an iterable of package names, not one string")
        self.artifacts = Path(artifacts).absolute()
        self.packages = tuple(packages)
        self.app_bundle_override = Path(app_bundle) if app_bundle is not None else None
        self.root: Path | None = None
        self.nonce = ""
        self._env: dict[str, str] = {}
        self._expected_env: dict[str, str] = {}
        self.hc: Path | None = None
        self.python: Path | None = None
        self.lsof: Path | None = None
        self.app_bundle: Path | None = None
        self.app_binary: Path | None = None
        self.core: CoreConnection | None = None
        self.core_pid: int | None = None
        self.core_id: str | None = None
        self.core_socket: Path | None = None
        self.core_socket_identity: tuple[int, int] | None = None
        self.app_socket: Path | None = None
        self.app_socket_identity: tuple[int, int] | None = None
        self.app_process: subprocess.Popen[bytes] | None = None
        self.app_pid: int | None = None
        self._app_log: Any = None
        self._release_guard: socket.socket | None = None
        self._root_identity: tuple[int, int] | None = None
        self._closed = False
        self._ready = False
        self._core_start_attempted = False
        self._core_stopped = False
        self._core_exit_proven = False

    @property
    def env(self) -> dict[str, str]:
        """Return a copy so callers cannot redirect app commands to another home."""
        return self._env.copy()

    def __enter__(self) -> NativeSession:
        try:
            self._preflight()
            self._create_workspace()
            self._prepare_workspace()
            self._start_core()
            self._start_app()
            self._select_fixture_layout()
            self._ready = True
            self._assert_ready()
            return self
        except BaseException as error:
            try:
                self._cleanup()
            except BaseException as cleanup_error:
                error.add_note(f"native harness cleanup was incomplete: {cleanup_error}")
            raise

    def __exit__(self, error_type: Any, error: BaseException | None, traceback: Any) -> bool:
        try:
            self._cleanup()
        except BaseException as cleanup_error:
            if error is None:
                raise
            error.add_note(f"native harness cleanup was incomplete: {cleanup_error}")
        return False

    def _preflight(self) -> None:
        if platform.system() != "Darwin":
            raise HarnessUnavailable("native Herdr E2E requires macOS; refusing to skip or launch another app")
        if not hasattr(select, "kqueue"):
            raise HarnessUnavailable("macOS kqueue support is unavailable")
        system_path = os.pathsep.join(("/usr/bin", "/bin", "/usr/sbin", "/sbin"))
        launchctl = Path("/bin/launchctl")
        if not launchctl.is_file():
            raise HarnessUnavailable("launchctl is unavailable; no GUI session can be proven")
        gui = subprocess.run(
            [str(launchctl), "print", f"gui/{os.getuid()}"],
            env={"PATH": system_path},
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if gui.returncode != 0:
            raise HarnessUnavailable("no accessible macOS GUI user session; refusing to launch Herdr")

        tools: dict[str, Path] = {}
        for name in ("hc", "herdr-app", "python3"):
            found = shutil.which(name)
            if not found:
                raise HarnessUnavailable(f"required native test tool is missing: {name}")
            tool = Path(found).resolve(strict=True)
            if not tool.is_file() or not os.access(tool, os.X_OK):
                raise HarnessUnavailable(f"required native test tool is not executable: {tool}")
            tools[name] = tool
        lsof = Path("/usr/sbin/lsof")
        if not lsof.is_file() or not os.access(lsof, os.X_OK):
            found = shutil.which("lsof")
            if not found:
                raise HarnessUnavailable("lsof is required to prove owned core/app sockets")
            lsof = Path(found).resolve(strict=True)
        self.hc = tools["hc"]
        self.python = tools["python3"]
        self.lsof = lsof
        self.app_bundle = _discover_app_bundle(tools["herdr-app"], self.app_bundle_override)
        self.app_version = _bundle_version(self.app_bundle)
        package_json = PROJECT_ROOT / "package.json"
        try:
            version = json.loads(package_json.read_text(encoding="utf-8"))["version"]
        except (OSError, KeyError, json.JSONDecodeError) as error:
            raise HarnessError(f"cannot read project package version: {error}") from error
        if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version):
            raise HarnessError("project package version is not a stable X.Y.Z version")
        self.version = version
        self.dist = PROJECT_ROOT / "dist"
        # Validate all packages before creating output, copying bundles, or starting processes.
        names = ["herdr-muxcle", *[name for name in self.packages if name != "herdr-muxcle"]]
        for name in names:
            if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name):
                raise HarnessError(f"invalid package name: {name!r}")
            manifest = _validate_package_payload(self.dist / f"{name}-v{version}", name, version)
            tested_version = manifest.get("testedHerdrAppVersion")
            if not isinstance(tested_version, str) or tested_version != self.app_version:
                raise HarnessUnavailable(
                    f"{name} was tested with Herdr {tested_version!r}, but the copied app is {self.app_version}"
                )

    def _create_workspace(self) -> None:
        self.artifacts = _create_output_directory(self.artifacts)
        self.nonce = secrets.token_hex(8)
        if not SCRATCH_PARENT.is_dir() or not os.access(SCRATCH_PARENT, os.W_OK | os.X_OK):
            raise HarnessUnavailable(f"private short-path scratch parent is unavailable: {SCRATCH_PARENT}")
        root = Path(tempfile.mkdtemp(prefix="mx-e2e-", dir=SCRATCH_PARENT))
        root.chmod(0o700)
        self.root = root
        info = root.lstat()
        self._root_identity = (info.st_dev, info.st_ino)
        marker = root / ".muxcle-native-owner"
        with marker.open("x", encoding="ascii") as output:
            output.write(self.nonce)
        marker.chmod(0o600)
        for name in ("home", "app-home", "bin", "cache", "config", "data", "run", "state", "tmp"):
            (root / name).mkdir(mode=0o700)
        for name, target in (("hc", self.hc), ("python3", self.python)):
            (root / "bin" / name).symlink_to(target)

        self._release_guard = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._release_guard.bind(("127.0.0.1", 0))
        port = self._release_guard.getsockname()[1]
        if not port:
            raise HarnessError("could not reserve a loopback update endpoint")
        assert self.hc is not None and self.python is not None
        self._env = _build_environment(
            root=root,
            nonce=self.nonce,
            hc=self.hc,
            python=self.python,
            releases_url=f"http://127.0.0.1:{port}",
        )
        self._expected_env = self._env.copy()
        self.core_socket = Path(self._env["XDG_RUNTIME_DIR"]) / "herdr-core" / f"{self._env['HC_SESSION']}.sock"
        self.app_socket = Path(self._env["HERDR_APP_HOME"]) / "herdr-app.sock"
        _validate_socket_path_length(self.core_socket)

    def _prepare_workspace(self) -> None:
        assert self.root is not None and self.app_bundle is not None and self.hc is not None
        self.app_binary = _copy_app_bundle(self.app_bundle, self.root / "Herdr.app")
        app_home = Path(self._env["HERDR_APP_HOME"])
        settings = {
            "core": str(self.hc),
            "telemetry": False,
            "clipboard_write": False,
            "font_size": 12.0,
        }
        settings_path = app_home / "settings.json"
        with settings_path.open("x", encoding="utf-8") as output:
            json.dump(settings, output, indent=2)
            output.write("\n")
        settings_path.chmod(0o600)
        with (app_home / "shared.json").open("x", encoding="utf-8") as output:
            json.dump({"frame.welcomed": self.app_version}, output)
            output.write("\n")
        with (app_home / "update-notes.json").open("x", encoding="utf-8") as output:
            json.dump({"last_run": self.app_version, "presented": []}, output)
            output.write("\n")
        with (app_home / "window.json").open("x", encoding="utf-8") as output:
            json.dump({"state": "windowed", "bounds": [0, 0, 1280, 960]}, output)
            output.write("\n")
        _deploy_packages(self.dist, self.version, self.packages, app_home)

    def _run_hc_json(self, *arguments: str, timeout: float = 25.0) -> Any:
        self._assert_environment()
        assert self.hc is not None
        result = subprocess.run(
            [str(self.hc), *arguments, "--json"],
            env=self.env,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return _read_json_result(result, "hc " + " ".join(arguments))

    def _start_core(self) -> None:
        assert self.core_socket is not None and self.hc is not None and self.root is not None
        if self.core_socket.exists() or self.core_socket.is_symlink():
            raise OwnershipError(f"scratch core socket unexpectedly exists before start: {self.core_socket}")
        self._core_start_attempted = True
        status = self._run_hc_json("server", "start")
        self._record_core_identity(status)
        self.core_socket_identity = _socket_identity(self.core_socket)
        assert self.core_pid is not None and self.lsof is not None
        if not _socket_owned_by(self.lsof, self.core_pid, self.core_socket, self.env):
            raise OwnershipError("started core does not own the expected scratch socket")
        self.core = CoreConnection(self.hc, self.env, self.artifacts)
        self._assert_core_identity(self.core.status)

    def _record_core_identity(self, status: Any) -> None:
        if not isinstance(status, dict):
            raise HarnessError("hc server start returned an invalid status")
        core = status.get("core")
        pid = status.get("pid")
        core_id = core.get("id") if isinstance(core, dict) else None
        if not isinstance(pid, int) or pid <= 1 or not isinstance(core_id, str) or not core_id:
            raise HarnessError("hc server start did not report a usable core PID and id")
        self.core_pid = pid
        self.core_id = core_id

    def _assert_core_identity(self, status: Any) -> None:
        self._assert_root_identity()
        self._assert_environment()
        if not isinstance(status, dict):
            raise OwnershipError("core identity check returned invalid status")
        actual_core = status.get("core")
        if (
            status.get("pid") != self.core_pid
            or not isinstance(actual_core, dict)
            or actual_core.get("id") != self.core_id
        ):
            raise OwnershipError("scratch core PID or identity changed")
        if self.core_socket is None or self.core_socket_identity != _socket_identity(self.core_socket):
            raise OwnershipError("scratch core socket inode changed")
        assert self.lsof is not None and self.core_pid is not None
        if not _socket_owned_by(self.lsof, self.core_pid, self.core_socket, self.env):
            raise OwnershipError("scratch core no longer owns its recorded socket")

    def _start_app(self) -> None:
        assert self.app_binary is not None and self.app_socket is not None and self.artifacts is not None
        self._assert_ready_core()
        if self.app_socket.exists() or self.app_socket.is_symlink():
            raise OwnershipError(f"scratch app socket unexpectedly exists before launch: {self.app_socket}")
        self._app_log = (self.artifacts / "app.log").open("xb", buffering=0)
        self.app_process = subprocess.Popen(
            [str(self.app_binary)],
            env=self.env,
            stdin=subprocess.DEVNULL,
            stdout=self._app_log,
            stderr=self._app_log,
            start_new_session=True,
        )
        self.app_pid = self.app_process.pid
        self._wait_for_app_socket()
        self.app_socket_identity = _socket_identity(self.app_socket)
        assert self.lsof is not None
        if not _socket_owned_by(self.lsof, self.app_process.pid, self.app_socket, self.env):
            raise OwnershipError("launched app does not own the expected scratch socket")

    def _assert_ready_core(self) -> None:
        self._assert_root_identity()
        if self.core is None:
            raise OwnershipError("owned core RPC connection is unavailable")
        self._assert_core_identity(self.core.call("server.status", {}))

    def _wait_for_app_socket(self, timeout: float = 25.0) -> None:
        duration = _bounded_timeout(timeout)
        if self.app_socket is None or self.app_process is None:
            raise HarnessError("app startup was not initialized")
        if not hasattr(select, "kqueue"):
            raise HarnessUnavailable("kqueue is required for event-driven app socket readiness")
        directory_fd = os.open(self.app_socket.parent, os.O_RDONLY)
        queue = select.kqueue()
        try:
            queue.control(
                [
                    select.kevent(
                        directory_fd,
                        filter=select.KQ_FILTER_VNODE,
                        flags=select.KQ_EV_ADD | select.KQ_EV_CLEAR,
                        fflags=select.KQ_NOTE_WRITE,
                    ),
                    select.kevent(
                        self.app_process.pid,
                        filter=select.KQ_FILTER_PROC,
                        flags=select.KQ_EV_ADD | select.KQ_EV_ONESHOT,
                        fflags=select.KQ_NOTE_EXIT,
                    ),
                ],
                0,
            )
            deadline = time.monotonic() + duration
            while True:
                if self.app_process.poll() is not None:
                    raise HarnessError(f"scratch Herdr.app exited during startup ({self.app_process.returncode})")
                if self.app_socket.exists():
                    _socket_identity(self.app_socket)
                    return
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("scratch app socket did not appear before the startup deadline")
                queue.control(None, 8, remaining)
        finally:
            queue.close()
            os.close(directory_fd)

    def _select_fixture_layout(self) -> None:
        self._assert_ready_core()
        self.app("do", "layout.switch", json.dumps({"name": LAYOUT_NAME}))
        status = self.wait_status(
            lambda value: value.get("layout") == LAYOUT_NAME and not value.get("errors"),
            timeout=DEFAULT_TIMEOUT,
        )
        if status.get("layout") != LAYOUT_NAME:
            raise HarnessError("scratch app did not select its fixture layout")

    def app(self, verb: str, *arguments: str, timeout: float = 15.0) -> Any:
        if self.root is not None:
            self._assert_root_identity()
            self._assert_environment()
        if self.app_binary is None:
            raise HarnessError("scratch app binary is not ready")
        if not isinstance(verb, str) or not verb or any(not isinstance(arg, str) for arg in arguments):
            raise ValueError("app command and arguments must be strings")
        result = subprocess.run(
            [str(self.app_binary), verb, *arguments],
            env=self.env,
            capture_output=True,
            text=True,
            timeout=_bounded_timeout(timeout),
            check=False,
        )
        if result.returncode != 0:
            raise HarnessError(f"scratch app {verb} failed: {result.stderr.strip()} {result.stdout.strip()}")
        if verb == "shot":
            return {"path": result.stdout.strip()}
        try:
            value = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise HarnessError(f"scratch app {verb} returned invalid JSON: {error}") from error
        if isinstance(value, dict) and "error" in value:
            raise HarnessError(f"scratch app {verb} returned an error: {value['error']}")
        return value

    def command(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        if not isinstance(name, str) or not name:
            raise ValueError("command name must be a non-empty string")
        payload = json.dumps({} if arguments is None else arguments, separators=(",", ":"))
        return self.app("do", name, payload)

    def track_terminal(self, address: str, identity: dict[str, Any] | None = None) -> None:
        self._assert_ready()
        if self.core is None:
            raise OwnershipError("owned core is unavailable")
        self.core.track_terminal(address, identity)

    def wait_status(
        self,
        predicate: Callable[[dict[str, Any]], bool],
        timeout: float = DEFAULT_TIMEOUT,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + _bounded_timeout(timeout)
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("scratch app status predicate timed out")
            status = self.app("status", timeout=min(15.0, remaining))
            if not isinstance(status, dict):
                raise HarnessError("scratch app status is not a JSON object")
            if predicate(status):
                return status

    def _assert_ready(self) -> None:
        if not self._ready or self.root is None or self._root_identity is None:
            raise OwnershipError("native session is not ready")
        self._assert_root_identity()
        self._assert_ready_core()
        if self.app_process is None or self.app_process.poll() is not None:
            raise OwnershipError("owned app process is not running")
        if self.app_socket is None or self.app_socket_identity != _socket_identity(self.app_socket):
            raise OwnershipError("scratch app socket inode changed")
        assert self.lsof is not None
        if not _socket_owned_by(self.lsof, self.app_process.pid, self.app_socket, self.env):
            raise OwnershipError("owned app no longer owns its recorded socket")

    def fixture_argv(self, label: str) -> list[str]:
        self._assert_ready()
        if not isinstance(label, str) or not label or len(label) > 80 or any(ord(char) < 32 for char in label):
            raise ValueError("fixture label must be 1-80 printable characters")
        if not FIXTURE_SCRIPT.is_file() or FIXTURE_SCRIPT.is_symlink():
            raise HarnessUnavailable(f"E2E fixture script is missing: {FIXTURE_SCRIPT}")
        assert self.python is not None
        return [str(self.python), "-I", "-B", "-u", str(FIXTURE_SCRIPT), label]

    def snapshot(self, name: str) -> dict[str, Any]:
        self._assert_ready()
        target = self._artifact_path(name, ".json")
        value = {
            "document": self.core.document(),
            "status": self.app("status"),
            "world": self.app("ls"),
        }
        with target.open("x", encoding="utf-8") as output:
            json.dump(value, output, indent=2)
            output.write("\n")
        return value

    def screenshot(self, name: str) -> Path:
        self._assert_ready()
        target = self._artifact_path(name, ".png")
        result = self.app("shot", str(target))
        if not isinstance(result, dict) or result.get("path") != str(target) or not target.is_file():
            raise HarnessError(f"scratch app did not create the requested screenshot: {target}")
        return target

    def _artifact_path(self, name: str, suffix: str) -> Path:
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", name):
            raise ValueError("artifact name must use letters, digits, hyphens, or underscores")
        assert self.artifacts is not None
        path = self.artifacts / f"{name}{suffix}"
        if path.exists() or path.is_symlink():
            raise HarnessError(f"refusing to overwrite artifact: {path}")
        return path

    def _assert_environment(self) -> None:
        if self.root is None or not self._expected_env or self._env != self._expected_env:
            raise OwnershipError("scratch process environment changed")
        expected = {
            "HOME": self.root / "home",
            "TMPDIR": self.root / "tmp",
            "XDG_CACHE_HOME": self.root / "cache",
            "XDG_CONFIG_HOME": self.root / "config",
            "XDG_DATA_HOME": self.root / "data",
            "XDG_RUNTIME_DIR": self.root / "run",
            "XDG_STATE_HOME": self.root / "state",
            "HERDR_APP_HOME": self.root / "app-home",
        }
        if any(Path(self._env.get(key, "")) != value for key, value in expected.items()):
            raise OwnershipError("scratch process environment points outside its owned root")
        if self._env.get("HC_SESSION") != f"muxcle-e2e-{self.nonce}" or self._env.get("HERDR_APP_ID") != f"muxcle-e2e-{self.nonce}":
            raise OwnershipError("scratch session nonce changed")
        if self.core_socket != Path(self._env["XDG_RUNTIME_DIR"]) / "herdr-core" / f"{self._env['HC_SESSION']}.sock":
            raise OwnershipError("core socket selector changed")
        if self.app_socket != Path(self._env["HERDR_APP_HOME"]) / "herdr-app.sock":
            raise OwnershipError("app socket selector changed")

    def _assert_root_identity(self) -> None:
        if self.root is None or self._root_identity is None:
            raise OwnershipError("scratch root identity was not recorded")
        if self.root.is_symlink():
            raise OwnershipError("scratch root was replaced with a symlink")
        info = self.root.lstat()
        marker = self.root / ".muxcle-native-owner"
        if (
            (info.st_dev, info.st_ino) != self._root_identity
            or info.st_mode & 0o077
            or not marker.is_file()
            or marker.is_symlink()
            or marker.read_text(encoding="ascii") != self.nonce
        ):
            raise OwnershipError("scratch root inode or nonce changed")

    def _stop_owned_app(self) -> None:
        process = self.app_process
        if process is None:
            if self._app_log is not None:
                self._app_log.close()
                self._app_log = None
            return
        if process.poll() is None:
            self._assert_root_identity()
            self._assert_environment()
        if process.poll() is None and self.app_socket is not None and self.app_socket_identity is not None:
            try:
                socket_is_owned = (
                    self.app_socket.exists()
                    and _socket_identity(self.app_socket) == self.app_socket_identity
                    and self.lsof is not None
                    and _socket_owned_by(self.lsof, process.pid, self.app_socket, self.env)
                )
            except OwnershipError:
                socket_is_owned = False
            if socket_is_owned:
                try:
                    self.app("do", "app.quit", timeout=5)
                except (HarnessError, OSError, subprocess.TimeoutExpired):
                    pass
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            if process.poll() is None:
                # Popen tracks the exact child; the nonce-protected root prevents PID/path reuse.
                self._assert_root_identity()
                if process.pid != self.app_pid or self.env.get("HERDR_APP_ID") != f"muxcle-e2e-{self.nonce}":
                    raise OwnershipError("refusing to signal an app without its tracked PID and nonce")
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired as error:
                    raise OwnershipError("owned app did not exit after exact-child SIGTERM") from error
        self.app_process = None
        if self._app_log is not None:
            self._app_log.close()
            self._app_log = None

    def _stop_owned_core(self) -> None:
        if self._core_stopped:
            return
        if self.core is None or self.core_pid is None or self.core_id is None:
            if self._core_start_attempted or (
                self.core_socket is not None and (self.core_socket.exists() or self.core_socket.is_symlink())
            ):
                raise OwnershipError(
                    "core startup ownership cannot be proven; retained scratch root "
                    f"{self.root}, PID {self.core_pid!r}, core id {self.core_id!r}, socket {self.core_socket}"
                )
            self._core_stopped = True
            self._core_exit_proven = True
            return
        self._assert_root_identity()
        status = self.core.call("server.status", {}, timeout=5)
        self._assert_core_identity(status)
        self.core.cleanup_terminals()
        self._assert_core_identity(self.core.call("server.status", {}, timeout=5))
        exit_watch = self._watch_core_exit()
        try:
            result = self.core.call("server.stop", {}, timeout=8)
            if not isinstance(result, dict) or result.get("stopped") is not True:
                raise OwnershipError("owned core did not confirm shutdown")
            self._await_core_exit(exit_watch, timeout=8)
            self._wait_for_core_socket_removal(timeout=8)
            self._core_exit_proven = True
            self._core_stopped = True
        finally:
            exit_watch.close()

    def _watch_core_exit(self) -> Any:
        if self.core_pid is None:
            raise OwnershipError("cannot watch an untracked core PID")
        queue = select.kqueue()
        try:
            queue.control(
                [select.kevent(
                    self.core_pid,
                    filter=select.KQ_FILTER_PROC,
                    flags=select.KQ_EV_ADD | select.KQ_EV_ONESHOT,
                    fflags=select.KQ_NOTE_EXIT,
                )],
                0,
            )
        except OSError as error:
            queue.close()
            raise OwnershipError(f"cannot watch owned core PID {self.core_pid} exit: {error}") from error
        return queue

    @staticmethod
    def _await_core_exit(queue: Any, timeout: float) -> None:
        if not 0 < timeout <= MAX_WAIT_SECONDS:
            raise ValueError("core exit timeout must be positive and bounded")
        events = queue.control(None, 1, timeout)
        if not events or not any(event.fflags & select.KQ_NOTE_EXIT for event in events):
            raise TimeoutError("owned core PID did not exit before the cleanup deadline")

    def _wait_for_core_socket_removal(self, timeout: float) -> None:
        assert self.core_socket is not None and self.core_socket_identity is not None
        if not self.core_socket.exists() and not self.core_socket.is_symlink():
            return
        directory_fd = os.open(self.core_socket.parent, os.O_RDONLY)
        queue = select.kqueue()
        try:
            queue.control(
                [select.kevent(
                    directory_fd,
                    filter=select.KQ_FILTER_VNODE,
                    flags=select.KQ_EV_ADD | select.KQ_EV_CLEAR,
                    fflags=select.KQ_NOTE_WRITE,
                )],
                0,
            )
            deadline = time.monotonic() + _bounded_timeout(timeout)
            while self.core_socket.exists() or self.core_socket.is_symlink():
                if _socket_identity(self.core_socket) != self.core_socket_identity:
                    raise OwnershipError("core socket was replaced during shutdown")
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("owned core socket did not close before the cleanup deadline")
                queue.control(None, 8, remaining)
        finally:
            queue.close()
            os.close(directory_fd)

    def _remove_owned_root(self) -> None:
        if self.root is None:
            return
        self._assert_root_identity()
        if self.app_process is not None and self.app_process.poll() is None:
            raise OwnershipError("refusing to delete scratch root while app is alive")
        if self.app_socket is not None and (self.app_socket.exists() or self.app_socket.is_symlink()):
            if self.app_socket_identity is None or _socket_identity(self.app_socket) != self.app_socket_identity:
                raise OwnershipError("refusing to delete scratch root after app socket replacement")
        if self.core_socket is not None and (self.core_socket.exists() or self.core_socket.is_symlink()):
            raise OwnershipError("refusing to delete scratch root while a core socket remains")
        if self._core_start_attempted and not self._core_exit_proven:
            raise OwnershipError("refusing to delete scratch root without proof that the owned core PID exited")
        _make_owned_tree_removable(self.root)
        shutil.rmtree(self.root)
        self.root = None

    def _cleanup(self) -> None:
        if self._closed:
            return
        errors: list[BaseException] = []
        self._ready = False
        for cleanup in (self._stop_owned_app, self._stop_owned_core):
            try:
                cleanup()
            except BaseException as error:
                errors.append(error)
        if self.core is not None:
            try:
                self.core.close()
                self.core = None
            except BaseException as error:
                errors.append(error)
        if not errors:
            try:
                self._remove_owned_root()
            except BaseException as error:
                errors.append(error)
        if not errors and self._release_guard is not None:
            self._release_guard.close()
            self._release_guard = None
        self._closed = not errors
        if errors:
            raise OwnershipError("native session cleanup incomplete: " + "; ".join(map(str, errors)))

if __name__ == "__main__":
    raise SystemExit("Import NativeSession from an E2E runner; the harness is not a standalone test.")
