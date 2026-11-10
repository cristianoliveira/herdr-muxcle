#!/usr/bin/env python3
"""Bounded input relay for a reviewed frozen set of local Herdr terminal panes."""
import argparse
import curses
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time

from broadcast_stream import Streams


TARGETS = re.compile(r"^t[a-z0-9]+$")
PANE = re.compile(r"^p[a-z0-9]+$")
CORE_ID = re.compile(r"^[a-f0-9]{32}$")
MIN_TARGETS, MAX_TARGETS = 2, 8
PENDING_KEYS, BATCH_KEYS = 64, 32
MINIMUM_COLUMNS = 50
STARTUP_TIMEOUT, COMMAND_TIMEOUT = 5.0, 5.0


def named_keys():
    values = {
        "KEY_LEFT": b"\x1b[D", "KEY_RIGHT": b"\x1b[C", "KEY_UP": b"\x1b[A",
        "KEY_DOWN": b"\x1b[B", "KEY_HOME": b"\x1b[H", "KEY_END": b"\x1b[F",
        "KEY_DC": b"\x1b[3~", "KEY_BACKSPACE": b"\x7f", "KEY_PPAGE": b"\x1b[5~",
        "KEY_NPAGE": b"\x1b[6~", "KEY_BTAB": b"\x1b[Z", "KEY_ENTER": b"\r",
    }
    return {getattr(curses, name): value for name, value in values.items() if hasattr(curses, name)}


NAMED_KEYS = named_keys()


def key_bytes(value):
    if value == "\x1b":
        return None
    if isinstance(value, int):
        if value in NAMED_KEYS:
            return NAMED_KEYS[value]
        raise ValueError("Unsupported key; broadcast stopped. Escape exits.")
    if not isinstance(value, str) or len(value) != 1:
        raise ValueError("Unsupported input; broadcast stopped. Escape exits.")
    if value in ("\b", "\x7f"):
        return b"\x7f"
    if value in ("\n", "\r"):
        return b"\r"
    if value == "\x16":
        raise ValueError("Paste is unsupported; broadcast stopped. Escape exits.")
    return value.encode("utf-8")


def validate_targets(targets):
    if not isinstance(targets, list) or not MIN_TARGETS <= len(targets) <= MAX_TARGETS:
        raise ValueError("Broadcast needs 2–8 distinct local terminal panes.")
    panes, terminals = [], []
    for target in targets:
        if not isinstance(target, dict):
            raise ValueError("Broadcast target is malformed.")
        pane, terminal = target.get("pane"), target.get("terminal")
        if not isinstance(pane, str) or not PANE.fullmatch(pane) or not isinstance(terminal, str) or not TARGETS.fullmatch(terminal):
            raise ValueError("Broadcast target is not an ordinary local pane.")
        panes.append(pane)
        terminals.append(terminal)
    if len(set(panes)) != len(panes) or len(set(terminals)) != len(terminals):
        raise ValueError("Broadcast target contains duplicate pane or terminal references.")
    return tuple((target["pane"], target["terminal"]) for target in targets)


def parse_identity(record, address):
    if not isinstance(record, dict) or record.get("address") != address or record.get("state") != "live":
        raise RuntimeError("A captured terminal is no longer live. Broadcast stopped.")
    pid, created_ms, argv = record.get("pid"), record.get("created_ms"), record.get("argv")
    cols, rows = record.get("cols"), record.get("rows")
    if (not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0
            or not isinstance(created_ms, int) or isinstance(created_ms, bool) or created_ms <= 0
            or not isinstance(argv, list) or not argv or any(not isinstance(arg, str) for arg in argv)
            or not isinstance(cols, int) or isinstance(cols, bool) or not 0 < cols <= 0xFFFF
            or not isinstance(rows, int) or isinstance(rows, bool) or not 0 < rows <= 0xFFFF):
        raise RuntimeError("Core returned incomplete terminal identity or geometry. Broadcast stopped.")
    return pid, created_ms, tuple(argv), cols, rows


class Commands:
    def __init__(self, app_home, popen=subprocess.Popen):
        self.env = dict(os.environ, HERDR_APP_HOME=app_home)
        self.popen = popen
        self.lock = threading.Lock()
        self.children = set()
        self.closed = False

    def __call__(self, args):
        with self.lock:
            if self.closed:
                raise RuntimeError("Broadcast closed.")
            process = self.popen(args, env=self.env, text=True, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE)
            self.children.add(process)
        try:
            out, _ = process.communicate(timeout=COMMAND_TIMEOUT)
            if process.returncode:
                raise RuntimeError("Target check failed. Broadcast stopped.")
            try:
                return json.loads(out)
            except json.JSONDecodeError:
                raise RuntimeError("Native target check returned invalid JSON. Broadcast stopped.") from None
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.communicate(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
            raise RuntimeError("Target check timed out. Broadcast stopped.") from None
        finally:
            with self.lock:
                self.children.discard(process)

    def close(self):
        with self.lock:
            self.closed = True
            for process in self.children:
                if process.poll() is None:
                    process.terminate()


class Relay:
    def __init__(self, targets, space, tab, core_id, run, send):
        self.target_pairs = validate_targets(targets)
        self.targets = targets
        self.space, self.tab, self.core_id = space, tab, core_id
        self.run, self.send = run, send
        self.active = True
        self.pins = {}

    def _core_identity(self):
        status = self.run(["hc", "server", "status", "--json"])
        core = status.get("core") if isinstance(status, dict) else None
        if not isinstance(core, dict) or core.get("id") != self.core_id:
            raise RuntimeError("Herdr Core changed. Broadcast stopped.")

    def _identity(self, address):
        record = self.run(["hc", "get", "--json", address])
        return parse_identity(record, address)

    def _status(self):
        status = self.run(["herdr-app", "status"])
        if not isinstance(status, dict) or (status.get("space"), status.get("tab")) != (self.space, self.tab):
            raise RuntimeError("Window context changed. Broadcast stopped.")
        overlays = status.get("overlays")
        if not isinstance(overlays, list) or overlays != ["layout"]:
            raise RuntimeError("Another overlay or dialog opened. Broadcast stopped.")
        return status

    def verify_presence(self):
        self._core_identity()
        self._status()

    def verify_scope(self):
        self.verify_presence()
        layout = self.run(["herdr-app", "ls"])
        current_tab = None
        for space in layout.get("spaces", []):
            if isinstance(space, dict) and space.get("id") == self.space and space.get("machine") is None:
                current_tab = next((tab for tab in space.get("tabs", [])
                                    if isinstance(tab, dict) and tab.get("id") == self.tab), None)
                break
        if not isinstance(current_tab, dict):
            raise RuntimeError("Captured local tab disappeared. Broadcast stopped.")
        current = []
        for item in current_tab.get("terminals", []):
            if not isinstance(item, dict):
                raise RuntimeError("Tab membership became invalid. Broadcast stopped.")
            terminal = item.get("terminal")
            if terminal is not None:
                current.append((item.get("pane"), terminal))
        if len(current) != len(self.target_pairs) or set(current) != set(self.target_pairs):
            raise RuntimeError("Tab terminal membership changed. Broadcast stopped; reopen to review targets.")

    def prepare(self, wait=time.sleep, now=time.monotonic):
        deadline = now() + STARTUP_TIMEOUT
        while self.active:
            self._core_identity()
            status = self.run(["herdr-app", "status"])
            if not isinstance(status, dict) or (status.get("space"), status.get("tab")) != (self.space, self.tab):
                raise RuntimeError("Window context changed before broadcast was ready.")
            overlays = status.get("overlays")
            if overlays == ["layout"]:
                break
            if overlays not in ([], ["muxcle-broadcast-prototype"], ["muxcle-broadcast-prototype", "layout"]):
                raise RuntimeError("Broadcast overlay did not become available.")
            if now() >= deadline:
                raise RuntimeError("Broadcast overlay did not become available.")
            wait(.05)
        if not self.active:
            raise RuntimeError("Broadcast closed during startup.")
        self.verify_scope()
        self.pins = {target["terminal"]: self._identity(target["terminal"]) for target in self.targets}
        self.verify_scope()
        self.verify_targets("A captured terminal restarted during setup.")

    def verify_targets(self, message="A captured terminal process changed."):
        for address, identity in self.pins.items():
            if self._identity(address) != identity:
                raise RuntimeError(f"{message} Broadcast stopped.")

    def stop(self):
        self.active = False

    def deliver(self, data, stopped=None):
        if not self.active:
            return
        self.verify_scope()
        for address, identity in self.pins.items():
            if self._identity(address) != identity:
                raise RuntimeError("A captured terminal process changed. Broadcast stopped.")
        for target in self.targets:
            if not self.active:
                return
            if stopped and stopped():
                raise RuntimeError("A target stream failed. Delivery may be partial; no retry.")
            self.send(target["terminal"], data)


def display_geometry_safe(height, width, space, tab, targets):
    lines = [
        "BROADCAST INPUT · PROTOTYPE",
        f"Space: {space}",
        f"Tab: {tab}",
        "Frozen targets · pane and terminal addresses",
        *(f"Pane: {target['pane']}" for target in targets),
        *(f"Term: {target['terminal']}" for target in targets),
        "READY · BROADCAST ON · UTF-8/basic keys · Esc exits",
        "Sequential · input is in target history · no rollback",
    ]
    required_width = max(MINIMUM_COLUMNS, max(len(line) + 1 for line in lines))
    return width >= required_width and height >= 6 + 2 * len(targets)


def status_line(active, ready, message):
    if not active:
        return message
    return message if not ready else "READY · BROADCAST ON · UTF-8/basic keys · Esc exits"


def interface(screen, relay, commands, streams, ready_file, ready_token):
    curses.raw()
    curses.noecho()
    curses.set_escdelay(25)
    screen.keypad(True)
    screen.timeout(50)
    publish_ready_marker(ready_file, ready_token)
    sys.stdout.write("\033[?2004h")
    sys.stdout.flush()
    pending = queue.Queue(maxsize=PENDING_KEYS)
    state = {
        "stream_ready": False,
        "display_ready": False,
        "message": "ARMING · Review the captured pane list; wait for READY.",
        "exit": False,
    }
    rendered_geometry = None

    def worker():
        try:
            relay.prepare()
            records = [commands(["hc", "get", "--json", target["terminal"]]) for target in relay.targets]
            for target, record in zip(relay.targets, records):
                if parse_identity(record, target["terminal"]) != relay.pins[target["terminal"]]:
                    raise RuntimeError("A captured terminal changed during stream setup. Broadcast stopped.")
            streams.attach(records)
            relay.verify_scope()
            relay.verify_targets("A captured terminal changed during stream setup.")
            state["stream_ready"] = True
            last_context_check = time.monotonic()
            while relay.active:
                try:
                    keys = [pending.get(timeout=.1)]
                except queue.Empty:
                    if streams.error:
                        raise RuntimeError("Core stream lost. Delivery may be partial; no retry.")
                    if time.monotonic() - last_context_check >= 1.0:
                        relay.verify_presence()
                        last_context_check = time.monotonic()
                    continue
                while len(keys) < BATCH_KEYS:
                    try:
                        keys.append(pending.get_nowait())
                    except queue.Empty:
                        break
                relay.deliver(b"".join(keys), stopped=lambda: streams.error is not None)
        except Exception as error:
            relay.stop()
            streams.close()
            state["stream_ready"] = False
            state["display_ready"] = False
            state["message"] = f"STOPPED · {error} · Delivery may be partial; no rollback or retry. Esc exits."
            try:
                status = commands(["herdr-app", "status"])
                if "layout" not in status.get("overlays", []):
                    state["exit"] = True
            except Exception:
                state["exit"] = True

    worker_thread = threading.Thread(target=worker, name="broadcast-relay", daemon=True)
    worker_thread.start()
    try:
        while True:
            if state["exit"]:
                return
            screen.erase()
            height, width = screen.getmaxyx()
            if rendered_geometry is not None and (height, width) != rendered_geometry and relay.active:
                relay.stop()
                state["stream_ready"] = False
                state["message"] = "STOPPED · Window resized; input may be partial. No rollback or retry."
                while True:
                    try:
                        pending.get_nowait()
                    except queue.Empty:
                        break
            state["display_ready"] = False
            rendered_geometry = None
            stream_ready = state["stream_ready"] and relay.active and streams.error is None
            displayable = display_geometry_safe(height, width, relay.space, relay.tab, relay.targets)
            if not displayable:
                if relay.active:
                    relay.stop()
                    state["stream_ready"] = False
                    state["message"] = "STOPPED · Window too small; input may be partial. No rollback or retry."
                    while True:
                        try:
                            pending.get_nowait()
                        except queue.Empty:
                            break
                screen.addnstr(0, 0, "Window too small · stopped · Esc exits", max(0, width - 1))
            else:
                screen.addnstr(0, 0, "BROADCAST INPUT · PROTOTYPE", max(0, width - 1))
                screen.addnstr(1, 0, f"Space: {relay.space}", max(0, width - 1))
                screen.addnstr(2, 0, f"Tab: {relay.tab}", max(0, width - 1))
                screen.addnstr(3, 0, "Frozen targets · pane and terminal addresses", max(0, width - 1))
                for index, target in enumerate(relay.targets):
                    row = 4 + 2 * index
                    screen.addnstr(row, 0, f"Pane: {target['pane']}", max(0, width - 1))
                    screen.addnstr(row + 1, 0, f"Term: {target['terminal']}", max(0, width - 1))
                status_row = 4 + 2 * len(relay.targets)
                screen.addnstr(status_row, 0, status_line(relay.active, stream_ready, state["message"]), max(0, width - 1))
                screen.addnstr(status_row + 1, 0, "Sequential · input is in target history · no rollback", max(0, width - 1))
            screen.refresh()
            if displayable and stream_ready and state["stream_ready"] and relay.active and streams.error is None:
                state["display_ready"] = True
                rendered_geometry = (height, width)
            try:
                value = screen.get_wch()
            except curses.error:
                continue
            if value == curses.KEY_RESIZE:
                continue
            try:
                key = key_bytes(value)
                if key is None:
                    return
                current_geometry = screen.getmaxyx()
                if state["display_ready"] and rendered_geometry == current_geometry:
                    if state["stream_ready"] and relay.active and streams.error is None:
                        pending.put_nowait(key)
                elif state["display_ready"]:
                    relay.stop()
                    state["stream_ready"] = False
                    state["display_ready"] = False
                    state["message"] = "STOPPED · Window resized; input may be partial. No rollback or retry."
                    while True:
                        try:
                            pending.get_nowait()
                        except queue.Empty:
                            break
            except (ValueError, queue.Full) as error:
                relay.stop()
                state["stream_ready"] = False
                state["display_ready"] = False
                while True:
                    try:
                        pending.get_nowait()
                    except queue.Empty:
                        break
                reason = str(error) if isinstance(error, ValueError) else "Input queue full; broadcast stopped"
                state["message"] = f"STOPPED · {reason} · Delivery may be partial; no rollback or retry. Esc exits."
    finally:
        clear_ready_marker(ready_file, f"{ready_token}:{os.getpid()}")
        relay.stop()
        while True:
            try:
                pending.get_nowait()
            except queue.Empty:
                break
        streams.close()
        commands.close()
        worker_thread.join(timeout=1)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog="Prototype: 2–8 live local ordinary panes only. No IME, paste, Alt, function or advanced key support.")
    parser.add_argument("--targets", required=True, type=json.loads)
    parser.add_argument("--space", required=True)
    parser.add_argument("--tab", required=True)
    parser.add_argument("--core-id", required=True)
    parser.add_argument("--app-home", required=True)
    parser.add_argument("--ready-file", required=True)
    parser.add_argument("--ready-token", required=True)
    args = parser.parse_args(argv)
    try:
        validate_targets(args.targets)
    except ValueError as error:
        parser.error(str(error))
    if not CORE_ID.fullmatch(args.core_id):
        parser.error("--core-id must be a verified Core identity")
    if not args.space or "/" in args.space or not args.tab or "/" in args.tab:
        parser.error("--space and --tab must name local app identifiers")
    if (not re.fullmatch(r"[a-z0-9-]{8,64}", args.ready_token)
            or not os.path.isabs(args.ready_file)
            or os.path.basename(args.ready_file) != "ready"
            or os.path.basename(os.path.dirname(args.ready_file)) != f".muxcle-broadcast-{args.ready_token}"):
        parser.error("--ready-file and --ready-token must identify this launch's private readiness marker")
    if not isinstance(args.targets, list):
        parser.error("--targets must be a JSON array")
    return args


def main(argv=None):
    args = parse_args(argv)
    commands = Commands(args.app_home)
    streams = None
    ready_content = f"{args.ready_token}:{os.getpid()}"
    try:
        streams = Streams(args.core_id)
        relay = Relay(args.targets, args.space, args.tab, args.core_id, commands, streams.send)
        os.environ["TERM"] = "xterm-256color"
        curses.wrapper(interface, relay, commands, streams, args.ready_file, args.ready_token)
    finally:
        if streams is not None:
            streams.close()
        clear_ready_marker(args.ready_file, ready_content)
        commands.close()
        sys.stdout.write("\033[?2004l")
        sys.stdout.flush()


def publish_ready_marker(path, token):
    directory = os.path.dirname(path)
    os.mkdir(directory, 0o700)
    created_file = False
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        created_file = True
        with os.fdopen(descriptor, "w", encoding="utf-8") as marker:
            marker.write(f"{token}:{os.getpid()}")
    except Exception:
        if created_file:
            try:
                os.unlink(path)
            except OSError:
                pass
        try:
            os.rmdir(directory)
        except OSError:
            pass
        raise


def clear_ready_marker(path, expected):
    try:
        with open(path, encoding="utf-8") as marker:
            if marker.read() != expected:
                return
        os.unlink(path)
        os.rmdir(os.path.dirname(path))
    except (FileNotFoundError, OSError):
        pass


if __name__ == "__main__":
    main()
