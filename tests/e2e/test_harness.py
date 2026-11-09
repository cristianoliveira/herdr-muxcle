import hashlib
import json
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, call, patch

import harness


class HarnessUnitTests(unittest.TestCase):
    def test_fails_closed_before_creating_outputs_off_macos(self):
        with tempfile.TemporaryDirectory() as temporary:
            artifacts = Path(temporary) / "run"
            session = harness.NativeSession(artifacts)

            with patch.object(harness.platform, "system", return_value="Linux"):
                with self.assertRaises(harness.HarnessUnavailable):
                    session.__enter__()

            self.assertFalse(artifacts.exists())

    def test_environment_is_allowlisted_and_uses_only_scratch_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            env = harness._build_environment(
                root=root,
                nonce="e2e-test-123",
                hc=Path("/nix/store/hc/bin/hc"),
                python=Path("/usr/bin/python3"),
                releases_url="http://127.0.0.1:54321",
            )

        self.assertEqual(env["HOME"], str(root / "home"))
        self.assertEqual(env["HERDR_APP_HOME"], str(root / "app-home"))
        self.assertEqual(env["XDG_RUNTIME_DIR"], str(root / "run"))
        self.assertEqual(env["TMPDIR"], str(root / "tmp"))
        self.assertEqual(env["HC_SESSION"], "muxcle-e2e-e2e-test-123")
        self.assertEqual(env["HERDR_APP_ID"], "muxcle-e2e-e2e-test-123")
        self.assertEqual(env["HERDR_RELEASES_URL"], "http://127.0.0.1:54321")
        self.assertEqual(env["HERDR_TELEMETRY"], "0")
        self.assertEqual(env["DO_NOT_TRACK"], "1")
        self.assertEqual(env["PATH"].split(os.pathsep)[0], "/nix/store/hc/bin")
        self.assertFalse({"SSH_AUTH_SOCK", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "HC_TERMINAL_ID"} & env.keys())

    def test_app_commands_cannot_be_redirected_by_mutating_returned_environment(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "scratch"
            root.mkdir(mode=0o700)
            nonce = "owned-nonce"
            (root / ".muxcle-native-owner").write_text(nonce)
            session = object.__new__(harness.NativeSession)
            session.root = root
            session._root_identity = (root.stat().st_dev, root.stat().st_ino)
            session.nonce = nonce
            session._env = _owned_environment(root, nonce)
            session._expected_env = session._env.copy()
            session.core_socket = Path(session._env["XDG_RUNTIME_DIR"]) / "herdr-core" / f"{session._env['HC_SESSION']}.sock"
            session.app_socket = Path(session._env["HERDR_APP_HOME"]) / "herdr-app.sock"
            session.app_binary = Path("/scratch/Herdr.app/Contents/MacOS/Herdr")

            with patch.object(
                harness.subprocess,
                "run",
                return_value=harness.subprocess.CompletedProcess(args=[], returncode=0, stdout="{}", stderr=""),
            ) as run:
                exposed = session.env
                exposed["HERDR_APP_HOME"] = "/Users/person/.config/herdr-app"
                session.app("status")

            self.assertEqual(run.call_args.kwargs["env"]["HERDR_APP_HOME"], str(root / "app-home"))
            session._env["HERDR_APP_HOME"] = "/Users/person/.config/herdr-app"
            with patch.object(harness.subprocess, "run") as redirected_run:
                with self.assertRaises(harness.OwnershipError):
                    session.app("do", "app.quit")
            redirected_run.assert_not_called()

    def test_output_directory_must_be_new_and_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            existing = Path(temporary) / "existing"
            existing.mkdir()
            sentinel = existing / "evidence.json"
            sentinel.write_text("keep")

            with self.assertRaises(harness.HarnessError):
                harness._create_output_directory(existing)

            self.assertEqual(sentinel.read_text(), "keep")

    def test_discovers_bundle_next_to_real_nix_wrapper(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = Path(temporary) / "nix-store-herdr"
            wrapper = store / "bin" / "herdr-app"
            wrapper.parent.mkdir(parents=True)
            wrapper.write_text("#!/bin/sh\n")
            bundle = store / "Applications" / "Herdr.app"
            executable = bundle / "Contents" / "MacOS" / "Herdr"
            executable.parent.mkdir(parents=True)
            executable.write_text("binary")
            executable.chmod(0o755)
            info = bundle / "Contents" / "Info.plist"
            info.write_bytes(harness.plistlib.dumps({"CFBundleShortVersionString": "0.1.13"}))

            self.assertEqual(harness._discover_app_bundle(wrapper, None), bundle.resolve())
            self.assertEqual(harness._bundle_version(bundle), "0.1.13")

    def test_explicit_bundle_must_contain_executable(self):
        with tempfile.TemporaryDirectory() as temporary:
            invalid = Path(temporary) / "Herdr.app"
            invalid.mkdir()

            with self.assertRaises(harness.HarnessError):
                harness._discover_app_bundle(Path("/does/not/exist/herdr-app"), invalid)

    def test_rpc_deadline_expires_despite_continuous_unmatched_responses(self):
        class Input:
            def write(self, _data):
                pass

            def flush(self):
                pass

        connection = object.__new__(harness.CoreConnection)
        connection._closed = False
        connection.process = type("Process", (), {"stdin": Input()})()
        connection.timeout = 1.0
        connection._sequence = 0
        connection._read_line = Mock(return_value={"id": 99, "result": {}})

        with patch.object(harness.time, "monotonic", side_effect=[0.0, 0.0, 1.0]):
            with self.assertRaises(TimeoutError):
                connection.call("server.status", {}, timeout=1.0)

        connection._read_line.assert_called_once()

    def test_terminal_cleanup_refuses_untracked_terminals(self):
        connection = object.__new__(harness.CoreConnection)
        connection.owned_terminals = {}
        connection.call = Mock(return_value={"terminals": [{"address": "t4", "state": "live"}]})

        with self.assertRaises(harness.OwnershipError):
            connection.cleanup_terminals()

        connection.call.assert_called_once_with("terminal.list", {"all": True}, timeout=15.0)

    def test_terminal_cleanup_kills_waits_and_removes_only_tracked_fixture(self):
        terminal = {"address": "t4", "state": "finished", "created_ms": 7, "argv": ["fixture.py"]}
        connection = object.__new__(harness.CoreConnection)
        connection.owned_terminals = {"t4": {"created_ms": 7, "argv": ["fixture.py"]}}
        connection.call = Mock(side_effect=[
            {"terminals": [{**terminal, "state": "live"}]},
            {**terminal, "state": "finished"},
            terminal,
            {"removed": "t4"},
            {"terminals": []},
        ])

        connection.cleanup_terminals()

        self.assertEqual(connection.owned_terminals, {})
        self.assertEqual(
            [call.args[0] for call in connection.call.call_args_list],
            ["terminal.list", "terminal.kill", "terminal.get", "terminal.rm", "terminal.list"],
        )

    def test_socket_paths_fit_macos_limit_and_reject_long_temporary_roots(self):
        harness._validate_socket_path_length(Path("/private/tmp/mx-e2e-1234567890/run/herdr-core/session.sock"))

        with self.assertRaises(harness.HarnessUnavailable):
            harness._validate_socket_path_length(Path("/private/tmp/" + "x" * 100 + "/session.sock"))

    def test_socket_ownership_requires_matching_pid_and_socket_path(self):
        socket_path = Path("/scratch/session.sock")
        result = harness.subprocess.CompletedProcess(
            args=[], returncode=0, stdout="p42\nf3\nn/scratch/session.sock\n", stderr=""
        )
        with patch.object(harness.subprocess, "run", return_value=result):
            self.assertTrue(harness._socket_owned_by(Path("/usr/sbin/lsof"), 42, socket_path, {}))
            self.assertFalse(harness._socket_owned_by(Path("/usr/sbin/lsof"), 43, socket_path, {}))

    def test_payload_deployment_copies_requested_mod_and_mounts_its_host(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dist = root / "dist"
            base = _payload(dist, "herdr-muxcle", {"layouts/muxcle.json": _layout()})
            base_mod = base / "mods" / "muxcle-compat"
            base_mod.mkdir(parents=True)
            (base_mod / "mod.json").write_text("{}")
            sizing = _payload(dist, "muxcle-sizing", {"host.json": json.dumps(_host())})
            sizing_mod = sizing / "mods" / "muxcle-sizing"
            sizing_mod.mkdir(parents=True)
            (sizing_mod / "mod.json").write_text("{}")
            (sizing_mod / "main.js").write_text("export default class {}")
            history_host = _host()
            history_host["id"] = "muxcle-history-observer"
            history_host["content"]["mod"] = "muxcle-history"
            history = _payload(dist, "muxcle-history", {"observer.json": json.dumps(history_host)})
            history_mod = history / "mods" / "muxcle-history"
            history_mod.mkdir(parents=True)
            (history_mod / "mod.json").write_text("{}")
            _rewrite_manifest(base, "herdr-muxcle", ["layouts/muxcle.json", "mods/muxcle-compat/mod.json"])
            _rewrite_manifest(sizing, "muxcle-sizing", ["host.json", "mods/muxcle-sizing/mod.json", "mods/muxcle-sizing/main.js"])
            _rewrite_manifest(history, "muxcle-history", ["observer.json", "mods/muxcle-history/mod.json"])

            app_home = root / "app-home"
            app_home.mkdir()
            harness._deploy_packages(
                dist=dist,
                version="0.1.0",
                packages=["muxcle-sizing", "muxcle-history"],
                app_home=app_home,
            )

            self.assertTrue((app_home / "mods/muxcle-compat/mod.json").is_file())
            self.assertTrue((app_home / "mods/muxcle-sizing/main.js").is_file())
            layout = json.loads((app_home / "layouts/muxcle-fixture.json").read_text())
            workspace = next(node for node in layout["children"] if node["id"] == "workspace")
            self.assertIn(_host(), workspace["children"])
            self.assertIn(history_host, workspace["children"])

    def test_key_only_dist_package_is_deployed_to_scratch_keys(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dist = root / "dist"
            base = _payload(dist, "herdr-muxcle", {"layouts/muxcle.json": _layout()})
            base_mod = base / "mods" / "muxcle-compat"
            base_mod.mkdir(parents=True)
            (base_mod / "mod.json").write_text("{}")
            _rewrite_manifest(base, "herdr-muxcle", ["layouts/muxcle.json", "mods/muxcle-compat/mod.json"])
            keys = _payload(
                dist,
                "muxcle-tmux-keys",
                {"keys.json": json.dumps({"global": {"ctrl-a ctrl-j": "muxcle.test"}})},
            )
            _rewrite_manifest(keys, "muxcle-tmux-keys", ["keys.json"])
            app_home = root / "app-home"
            app_home.mkdir()

            harness._deploy_packages(dist, "0.1.0", ["muxcle-tmux-keys"], app_home)

            self.assertEqual(
                json.loads((app_home / "keys.json").read_text()),
                {"global": {"ctrl-a ctrl-j": "muxcle.test"}},
            )

    def test_payload_manifest_mismatch_fails_before_copy(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dist = root / "dist"
            base = _payload(dist, "herdr-muxcle", {"layouts/muxcle.json": _layout()})
            (base / "mods/muxcle-compat").mkdir(parents=True)
            (base / "mods/muxcle-compat/mod.json").write_text("{}")
            _rewrite_manifest(base, "wrong-package", ["layouts/muxcle.json", "mods/muxcle-compat/mod.json"])
            app_home = root / "app-home"
            app_home.mkdir()

            with self.assertRaises(harness.HarnessError):
                harness._deploy_packages(dist, "0.1.0", [], app_home)

            self.assertFalse((app_home / "mods").exists())

    def test_payload_archive_checksum_mismatch_fails_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dist = root / "dist"
            payload = _payload(dist, "muxcle-sizing", {"mods/muxcle-sizing/mod.json": "{}"})
            _rewrite_manifest(payload, "muxcle-sizing", ["mods/muxcle-sizing/mod.json"])
            archive = dist / f"{payload.name}.tar.gz"
            archive.write_bytes(archive.read_bytes() + b"tampered")

            with self.assertRaises(harness.HarnessError):
                harness._validate_package_payload(payload, "muxcle-sizing", "0.1.0")

    def test_package_names_cannot_escape_dist_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(harness.HarnessError):
                harness._deploy_packages(root, "0.1.0", ["../outside"], root / "app-home")

    def test_core_cleanup_refuses_changed_identity_without_stop_call(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            nonce = "owned-nonce"
            (root / ".muxcle-native-owner").write_text(nonce)
            session = object.__new__(harness.NativeSession)
            session.root = root
            session._root_identity = (root.stat().st_dev, root.stat().st_ino)
            session.nonce = nonce
            session.core = Mock()
            session.core.call.return_value = {"pid": 456, "core": {"id": "owned-core-id"}}
            session.core_pid = 123
            session.core_id = "owned-core-id"
            session._env = _owned_environment(root, nonce)
            session._expected_env = session._env.copy()
            session.core_socket = Path(session._env["XDG_RUNTIME_DIR"]) / "herdr-core" / f"{session._env['HC_SESSION']}.sock"
            session.app_socket = Path(session._env["HERDR_APP_HOME"]) / "herdr-app.sock"
            session.core_socket_identity = (1, 2)
            session._core_stopped = False

            with self.assertRaises(harness.OwnershipError):
                session._stop_owned_core()

            session.core.call.assert_called_once_with("server.status", {}, timeout=5)

    def test_core_exit_watch_registers_owned_pid_for_exit_notification(self):
        queue = Mock()
        session = object.__new__(harness.NativeSession)
        session.core_pid = 123
        constants = {
            "KQ_FILTER_PROC": 1,
            "KQ_EV_ADD": 2,
            "KQ_EV_ONESHOT": 4,
            "KQ_NOTE_EXIT": 8,
        }
        with patch.object(harness.select, "kqueue", return_value=queue, create=True), patch.object(
            harness.select, "kevent", return_value="event", create=True
        ):
            for name, value in constants.items():
                patcher = patch.object(harness.select, name, value, create=True)
                patcher.start()
                self.addCleanup(patcher.stop)
            self.assertIs(session._watch_core_exit(), queue)

        queue.control.assert_called_once_with(["event"], 0)

    def test_core_exit_wait_requires_note_exit_before_success(self):
        queue = Mock()
        queue.control.return_value = [type("Event", (), {"fflags": 8})()]
        with patch.object(harness.select, "KQ_NOTE_EXIT", 8, create=True):
            harness.NativeSession._await_core_exit(queue, timeout=2)
            queue.control.assert_called_once_with(None, 1, 2)
            queue.control.return_value = []
            with self.assertRaises(TimeoutError):
                harness.NativeSession._await_core_exit(queue, timeout=2)

    def test_core_cleanup_watches_pid_exit_before_removing_root(self):
        session = object.__new__(harness.NativeSession)
        session._core_stopped = False
        session._core_exit_proven = False
        session._core_start_attempted = True
        session.core_pid = 123
        session.core_id = "owned-core-id"
        session.core_socket = Path("/private/tmp/owned/core.sock")
        session.core_socket_identity = (1, 2)
        session.core = Mock()
        owned_status = {"pid": 123, "core": {"id": "owned-core-id"}}
        session.core.call.side_effect = [owned_status, owned_status, {"stopped": True}]
        watcher = Mock()
        session._watch_core_exit = Mock(return_value=watcher)
        session._await_core_exit = Mock()
        session._wait_for_core_socket_removal = Mock()
        session._assert_root_identity = Mock()
        session._assert_core_identity = Mock()
        events = Mock()
        events.attach_mock(session._watch_core_exit, "watch")
        events.attach_mock(session.core.call, "rpc")

        session._stop_owned_core()

        stop_index = events.mock_calls.index(call.rpc("server.stop", {}, timeout=8))
        watch_index = events.mock_calls.index(call.watch())
        self.assertLess(watch_index, stop_index)
        session._await_core_exit.assert_called_once_with(watcher, timeout=8)
        session._wait_for_core_socket_removal.assert_called_once_with(timeout=8)
        self.assertTrue(session._core_exit_proven)
        self.assertTrue(session._core_stopped)
        watcher.close.assert_called_once()

    def test_core_cleanup_refuses_replaced_socket_without_stop_call(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            nonce = "owned-nonce"
            (root / ".muxcle-native-owner").write_text(nonce)
            env = _owned_environment(root, nonce)
            socket_path = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / f"{env['HC_SESSION']}.sock"
            socket_path.parent.mkdir(parents=True)
            socket_path.write_text("not a socket")
            session = object.__new__(harness.NativeSession)
            session.root = root
            session._root_identity = (root.stat().st_dev, root.stat().st_ino)
            session.nonce = nonce
            session.core = Mock()
            session.core.call.return_value = {"pid": 123, "core": {"id": "owned-core-id"}}
            session.core_pid = 123
            session.core_id = "owned-core-id"
            session.core_socket = socket_path
            session.core_socket_identity = (socket_path.stat().st_dev, socket_path.stat().st_ino)
            session._core_stopped = False
            session._env = env
            session._expected_env = env.copy()
            session.app_socket = Path(env["HERDR_APP_HOME"]) / "herdr-app.sock"

            with self.assertRaises(harness.OwnershipError):
                session._stop_owned_core()

            session.core.call.assert_called_once_with("server.status", {}, timeout=5)

    def test_readonly_bundle_cleanup_does_not_chmod_symlink_targets(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            tree = base / "scratch" / "Herdr.app"
            resources = tree / "Contents" / "Resources"
            resources.mkdir(parents=True)
            external = base / "external"
            external.mkdir()
            link = resources / "external-link"
            link.symlink_to(external, target_is_directory=True)
            resources.chmod(0o555)
            (tree / "Contents").chmod(0o555)
            tree.chmod(0o555)
            external.chmod(0o555)

            harness._make_owned_tree_removable(tree)

            self.assertTrue(resources.stat().st_mode & 0o200)
            self.assertFalse(external.stat().st_mode & 0o200)
            shutil = harness.shutil
            shutil.rmtree(tree)
            external.chmod(0o700)

    def test_root_cleanup_requires_proven_core_pid_exit(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "scratch"
            root.mkdir(mode=0o700)
            nonce = "owned-nonce"
            (root / ".muxcle-native-owner").write_text(nonce)
            session = object.__new__(harness.NativeSession)
            session.root = root
            session._root_identity = (root.stat().st_dev, root.stat().st_ino)
            session.nonce = nonce
            session.app_process = None
            session.app_socket = None
            session.core_socket = None
            session._core_start_attempted = True
            session._core_exit_proven = False

            with self.assertRaisesRegex(harness.OwnershipError, "without proof"):
                session._remove_owned_root()

            self.assertTrue(root.is_dir())

    def test_successful_cleanup_removes_only_private_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            artifacts = harness._create_output_directory(base / "artifacts")
            evidence = artifacts / "result.json"
            evidence.write_text("keep")
            root = base / "scratch"
            root.mkdir(mode=0o700)
            nonce = "owned-nonce"
            (root / ".muxcle-native-owner").write_text(nonce)

            session = object.__new__(harness.NativeSession)
            session.root = root
            session._root_identity = (root.stat().st_dev, root.stat().st_ino)
            session.nonce = nonce
            session.core = None
            session.core_socket = None
            session.app_socket = None
            session._core_start_attempted = False
            session._core_stopped = False
            session.app_process = None
            session._app_log = None
            session._release_guard = None
            session._closed = False
            session._ready = False

            session._cleanup()

            self.assertFalse(root.exists())
            self.assertEqual(evidence.read_text(), "keep")

    def test_root_cleanup_refuses_changed_inode_or_nonce_and_keeps_artifacts(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "scratch"
            root.mkdir()
            marker = root / ".muxcle-native-owner"
            marker.write_text("expected-nonce")
            artifacts = Path(temporary) / "artifacts"
            artifacts.mkdir()
            evidence = artifacts / "screenshot.png"
            evidence.write_bytes(b"evidence")

            session = object.__new__(harness.NativeSession)
            session.root = root
            session._root_identity = (root.stat().st_dev, root.stat().st_ino)
            session.nonce = "different-nonce"

            with self.assertRaises(harness.OwnershipError):
                session._remove_owned_root()

            self.assertTrue(root.exists())
            self.assertEqual(evidence.read_bytes(), b"evidence")

    def test_pre_socket_app_failure_terminates_only_tracked_child(self):
        class Child:
            pid = 77
            returncode = None

            def __init__(self):
                self.terminated = False

            def poll(self):
                return self.returncode

            def wait(self, timeout):
                if not self.terminated:
                    raise harness.subprocess.TimeoutExpired("Herdr", timeout)
                self.returncode = -15
                return self.returncode

            def terminate(self):
                self.terminated = True

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "scratch"
            root.mkdir(mode=0o700)
            nonce = "owned-nonce"
            (root / ".muxcle-native-owner").write_text(nonce)
            session = object.__new__(harness.NativeSession)
            session.root = root
            session._root_identity = (root.stat().st_dev, root.stat().st_ino)
            session.nonce = nonce
            session._env = _owned_environment(root, nonce)
            session._expected_env = session._env.copy()
            session.core_socket = Path(session._env["XDG_RUNTIME_DIR"]) / "herdr-core" / f"{session._env['HC_SESSION']}.sock"
            session.app_socket = Path(session._env["HERDR_APP_HOME"]) / "herdr-app.sock"
            session.app_socket_identity = None
            session.app_process = Child()
            session.app_pid = 77
            session._app_log = None

            session._stop_owned_app()

            self.assertTrue(session.app_process is None)

    def test_successful_enter_orders_preflight_through_readiness_before_yield(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "scratch"
            root.mkdir(mode=0o700)
            nonce = "ready-nonce"
            (root / ".muxcle-native-owner").write_text(nonce)
            session = harness.NativeSession(Path(temporary) / "artifacts")
            session.root = root
            session._root_identity = (root.stat().st_dev, root.stat().st_ino)
            session.nonce = nonce
            session._env = _owned_environment(root, nonce)
            session._expected_env = session._env.copy()
            session.core = Mock()
            session._assert_ready_core = Mock()
            session.app_process = Mock(pid=77)
            session.app_process.poll.return_value = None
            session.app_socket = Path(session._env["HERDR_APP_HOME"]) / "herdr-app.sock"
            session.app_socket_identity = (1, 2)
            session.lsof = Path("/usr/sbin/lsof")
            sequence = []
            for name in ("_preflight", "_create_workspace", "_prepare_workspace", "_start_core", "_start_app", "_select_fixture_layout"):
                setattr(session, name, Mock(side_effect=lambda name=name: sequence.append(name)))
            original_assert_ready = session._assert_ready

            def assert_ready():
                sequence.append("_assert_ready")
                original_assert_ready()

            session._assert_ready = assert_ready
            session._cleanup = Mock()

            with patch.object(harness, "_socket_identity", return_value=(1, 2)), patch.object(
                harness, "_socket_owned_by", return_value=True
            ):
                self.assertIs(session.__enter__(), session)

            self.assertTrue(session._ready)
            self.assertEqual(
                sequence,
                ["_preflight", "_create_workspace", "_prepare_workspace", "_start_core", "_start_app", "_select_fixture_layout", "_assert_ready"],
            )
            session.__exit__(None, None, None)
            session._cleanup.assert_called_once()

    def test_failed_enter_runs_cleanup_without_deleting_artifact_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            artifacts = Path(temporary) / "run"
            session = harness.NativeSession(artifacts)
            session._preflight = Mock()
            session._create_workspace = Mock()
            session._prepare_workspace = Mock()
            session._start_core = Mock(side_effect=RuntimeError("core startup failed"))
            session._cleanup = Mock()

            with self.assertRaisesRegex(RuntimeError, "core startup failed"):
                session.__enter__()

            session._cleanup.assert_called_once()


def _owned_environment(root, nonce):
    return {
        "HOME": str(root / "home"),
        "PATH": "/usr/bin:/bin",
        "TMPDIR": str(root / "tmp"),
        "XDG_CACHE_HOME": str(root / "cache"),
        "XDG_CONFIG_HOME": str(root / "config"),
        "XDG_DATA_HOME": str(root / "data"),
        "XDG_RUNTIME_DIR": str(root / "run"),
        "XDG_STATE_HOME": str(root / "state"),
        "HC_SESSION": f"muxcle-e2e-{nonce}",
        "HERDR_APP_HOME": str(root / "app-home"),
        "HERDR_APP_ID": f"muxcle-e2e-{nonce}",
        "HERDR_RELEASES_URL": "http://127.0.0.1:54321",
        "HERDR_TELEMETRY": "0",
        "DO_NOT_TRACK": "1",
    }


def _layout():
    return {
        "id": "root",
        "type": "row",
        "children": [
            {"id": "workspace", "type": "column", "children": []},
        ],
    }


def _host():
    return {
        "id": "sizing-host",
        "type": "block",
        "size": {"px": 1},
        "min": 1,
        "max": 1,
        "resizable": False,
        "content": {"mod": "muxcle-sizing"},
    }


def _payload(dist, name, files):
    path = dist / f"{name}-v0.1.0"
    path.mkdir(parents=True)
    for relative, contents in files.items():
        target = path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(contents if isinstance(contents, str) else json.dumps(contents))
    manifest = {"name": name, "version": "0.1.0", "files": [*files, "manifest.json"]}
    (path / "manifest.json").write_text(json.dumps(manifest))
    _write_archive(path)
    return path


def _rewrite_manifest(path, name, files):
    (path / "manifest.json").write_text(
        json.dumps({"name": name, "version": "0.1.0", "files": [*files, "manifest.json"]})
    )
    _write_archive(path)


def _write_archive(path):
    archive = path.parent / f"{path.name}.tar.gz"
    with tarfile.open(archive, "w:gz") as package:
        package.add(path, arcname=path.name)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (path.parent / f"{archive.name}.sha256").write_text(f"{digest}  {archive.name}\n")


if __name__ == "__main__":
    unittest.main()
