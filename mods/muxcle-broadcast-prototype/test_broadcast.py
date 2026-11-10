import contextlib
import io
import json
import os
import pty
import queue
import struct
import tempfile
import termios
import threading
import tty
import unittest
from unittest.mock import patch
import broadcast
import broadcast_stream


TARGETS = [{"pane": "p1", "terminal": "t1"}, {"pane": "p2", "terminal": "t2"}]
CORE_ID = "a" * 32
READY_TOKEN = "test-token-123456"
READY_FILE = f"/tmp/.muxcle-broadcast-{READY_TOKEN}/ready"
SPACE, TAB = "local", "tab1"


def identity(address, pid=10, created_ms=100):
    return {"address": address, "state": "live", "pid": pid, "created_ms": created_ms,
            "argv": ["zsh"], "cols": 80, "rows": 24, "keep": False}


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.status = {"space": SPACE, "tab": TAB, "overlays": ["layout"]}
        self.layout = {"spaces": [{"id": SPACE, "machine": None, "tabs": [
            {"id": TAB, "terminals": [dict(target) for target in TARGETS]}]}]}
        self.records = {address: identity(address, pid=index + 10)
                        for index, address in enumerate(("t1", "t2"))}
        self.sent = []
        self.calls = []

        def run(args):
            self.calls.append(args)
            if args[:3] == ["hc", "server", "status"]:
                return {"core": {"id": CORE_ID}}
            if args[:2] == ["herdr-app", "status"]:
                return self.status
            if args[:2] == ["herdr-app", "ls"]:
                return self.layout
            if args[:3] == ["hc", "get", "--json"]:
                return self.records[args[3]]
            raise AssertionError(f"unexpected command: {args}")

        self.relay = broadcast.Relay(TARGETS, SPACE, TAB, CORE_ID, run,
                                     lambda address, data: self.sent.append((address, data)))

    def test_startup_waits_for_its_layout_and_rejects_another_dialog(self):
        overlays = iter([["muxcle-broadcast-prototype"],
                         ["muxcle-broadcast-prototype", "layout"], ["layout"], ["layout"], ["layout"]])
        original = self.relay.run

        def run(args):
            if args[:2] == ["herdr-app", "status"]:
                return {"space": SPACE, "tab": TAB, "overlays": next(overlays)}
            return original(args)

        self.relay.run = run
        self.relay.prepare(wait=lambda _seconds: None)
        self.assertTrue(self.relay.active)
        self.assertEqual(len(self.relay.pins), 2)

        self.setUp()
        self.status["overlays"] = ["another-dialog"]
        with self.assertRaisesRegex(RuntimeError, "overlay"):
            self.relay.prepare(wait=lambda _seconds: None)

    def test_delivers_each_batch_once_to_frozen_targets_in_order(self):
        self.relay.prepare()
        self.relay.deliver(b"hello")

        self.assertEqual(self.sent, [("t1", b"hello"), ("t2", b"hello")])
        self.assertEqual(len([call for call in self.calls if call[:3] == ["hc", "get", "--json"]]), 6)

    def test_refuses_invalid_or_duplicate_targets(self):
        for targets in [[], TARGETS[:1], TARGETS * 2,
                        [{"pane": "p1", "terminal": "t1"}, {"pane": "p1", "terminal": "t2"}],
                        [{"pane": "p1", "terminal": "remote/t1"}, TARGETS[1]]]:
            with self.subTest(targets=targets), self.assertRaises(ValueError):
                broadcast.Relay(targets, SPACE, TAB, CORE_ID, lambda _: {}, lambda *_: None)

    def test_context_overlay_membership_core_and_process_changes_stop_before_delivery(self):
        mutations = [
            lambda: self.status.update(space="other"),
            lambda: self.status.update(overlays=["layout", "dialog"]),
            lambda: self.layout["spaces"][0]["tabs"][0]["terminals"].pop(),
            lambda: self.records["t1"].update(pid=99),
            lambda: self.records["t1"].update(cols=81),
            lambda: self.records["t2"].update(state="finished"),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                self.setUp()
                self.relay.prepare()
                mutate()
                with self.assertRaises(RuntimeError):
                    self.relay.deliver(b"not logged")
                self.assertEqual(self.sent, [])

    def test_geometry_changed_during_stream_attach_stops_before_input(self):
        self.relay.prepare()
        self.records["t1"].update(cols=81)

        with self.assertRaisesRegex(RuntimeError, "during stream setup"):
            self.relay.verify_targets("A captured terminal changed during stream setup.")
        self.assertEqual(self.sent, [])

    def test_core_identity_change_stops_before_delivery(self):
        self.relay.prepare()
        original = self.relay.run
        self.relay.run = lambda args: {"core": {"id": "b" * 32}} if args[:3] == ["hc", "server", "status"] else original(args)

        with self.assertRaisesRegex(RuntimeError, "Core changed"):
            self.relay.deliver(b"secret input")
        self.assertEqual(self.sent, [])

    def test_in_flight_stream_failure_is_partial_and_never_retried(self):
        self.relay.prepare()
        stream_error = []

        def send(address, data):
            self.sent.append((address, data))
            stream_error.append(RuntimeError("lost"))

        self.relay.send = send
        with self.assertRaisesRegex(RuntimeError, "partial"):
            self.relay.deliver(b"x", stopped=lambda: bool(stream_error))
        self.assertEqual(self.sent, [("t1", b"x")])

    def test_terminal_process_identity_requires_actual_pid_created_time_argv_and_live_state(self):
        malformed = [
            {"address": "t1", "state": "live", "pid": None, "created_ms": 100, "argv": ["zsh"]},
            {"address": "t1", "state": "live", "pid": 1, "created_ms": None, "argv": ["zsh"]},
            {"address": "t1", "state": "live", "pid": 1, "created_ms": 100, "argv": []},
            {"address": "t1", "state": "finished", "pid": 1, "created_ms": 100, "argv": ["zsh"]},
        ]
        for record in malformed:
            with self.subTest(record=record), self.assertRaises(RuntimeError):
                broadcast.parse_identity(record, "t1")


class InputTests(unittest.TestCase):
    def test_broadcast_view_requires_geometry_that_displays_all_eight_target_rows(self):
        targets = [{"pane": f"p{index}", "terminal": f"t{index}"} for index in range(8)]
        self.assertTrue(broadcast.display_geometry_safe(22, 80, SPACE, TAB, targets))
        self.assertFalse(broadcast.display_geometry_safe(21, 80, SPACE, TAB, targets))
        self.assertFalse(broadcast.display_geometry_safe(22, 49, SPACE, TAB, targets))
        long_targets = [{"pane": "p" + "a" * 80, "terminal": "t1"}, *targets[1:]]
        self.assertFalse(broadcast.display_geometry_safe(22, 80, SPACE, TAB, long_targets))

    def test_utf8_basic_controls_navigation_and_escape(self):
        self.assertEqual(broadcast.key_bytes("é"), "é".encode())
        self.assertEqual(broadcast.key_bytes("\n"), b"\r")
        self.assertEqual(broadcast.key_bytes("\x08"), b"\x7f")
        self.assertEqual(broadcast.key_bytes("x"), b"x")
        self.assertEqual(broadcast.key_bytes("\x1b"), None)
        self.assertEqual(broadcast.key_bytes(broadcast.curses.KEY_LEFT), b"\x1b[D")

    def test_paste_escape_alt_and_function_keys_fail_safely_without_echoing_input(self):
        for value in ["\x16", broadcast.curses.KEY_F1, "\x00\x00"]:
            with self.subTest(value=repr(value)), self.assertRaises(ValueError) as raised:
                broadcast.key_bytes(value)
            self.assertNotIn(str(value), str(raised.exception))

    def test_pending_queue_is_bounded(self):
        pending = queue.Queue(maxsize=broadcast.PENDING_KEYS)
        for _ in range(broadcast.PENDING_KEYS):
            pending.put_nowait(b"a")
        with self.assertRaises(queue.Full):
            pending.put_nowait(b"b")

    def test_target_argument_parser_accepts_private_ready_marker_arguments(self):
        args = broadcast.parse_args([
            "--targets", json.dumps(TARGETS), "--space", SPACE, "--tab", TAB,
            "--core-id", CORE_ID, "--app-home", "/tmp/app",
            "--ready-file", READY_FILE, "--ready-token", READY_TOKEN,
        ])
        self.assertEqual(args.ready_file, READY_FILE)
        self.assertEqual(args.ready_token, READY_TOKEN)

    def test_target_argument_parser_rejects_nonlocal_or_unbounded_scope(self):
        with self.assertRaises(SystemExit):
            broadcast.parse_args(["--targets", json.dumps(TARGETS[:1]), "--space", SPACE,
                                  "--tab", TAB, "--core-id", CORE_ID, "--app-home", "/tmp/app",
                                  "--ready-file", READY_FILE, "--ready-token", READY_TOKEN])
        with self.assertRaises(SystemExit):
            broadcast.parse_args(["--targets", json.dumps(TARGETS), "--space", "host/space",
                                  "--tab", TAB, "--core-id", CORE_ID, "--app-home", "/tmp/app",
                                  "--ready-file", READY_FILE, "--ready-token", READY_TOKEN])


class InterfaceTests(unittest.TestCase):
    def run_interface(self, resize_after_ready=False):
        records = {target["terminal"]: identity(target["terminal"]) for target in TARGETS}
        streams = type("FakeStreams", (), {})()
        streams.error = None
        streams.closed = False
        streams.attach_gate = threading.Event()
        streams.sent = []
        streams.sent_event = threading.Event()

        def attach(_records):
            if not streams.attach_gate.wait(2):
                raise RuntimeError("fake attach gate timed out")

        def send(address, data):
            streams.sent.append((address, data))
            if len(streams.sent) == len(TARGETS):
                streams.sent_event.set()

        streams.attach = attach
        streams.send = send
        streams.close = lambda: setattr(streams, "closed", True)

        relay = type("FakeRelay", (), {})()
        relay.targets, relay.space, relay.tab = TARGETS, SPACE, TAB
        relay.active, relay.pins = True, {}
        relay.prepare = lambda: relay.pins.update({address: broadcast.parse_identity(record, address)
                                                   for address, record in records.items()})
        relay.verify_scope = lambda: None
        relay.verify_presence = lambda: None
        relay._identity = lambda address: broadcast.parse_identity(records[address], address)
        relay.verify_targets = lambda _message: None
        relay.stop = lambda: setattr(relay, "active", False)

        def deliver(data, stopped=None):
            for target in TARGETS:
                if not relay.active:
                    return
                if stopped and stopped():
                    raise RuntimeError("fake stream failure")
                streams.send(target["terminal"], data)

        relay.deliver = deliver

        commands = type("FakeCommands", (), {
            "__call__": lambda _self, args: records[args[-1]],
            "close": lambda _self: setattr(_self, "closed", True),
        })()

        class Screen:
            def __init__(self):
                self.geometry = (26, 80)
                self.lines = []
                self.ready_drawn = threading.Event()
                self.calls = 0
                self.resize_after_ready = resize_after_ready
                self.scope_was_visible = False

            def keypad(self, _enabled):
                pass

            def timeout(self, _milliseconds):
                pass

            def erase(self):
                self.lines = []

            def getmaxyx(self):
                return self.geometry

            def addnstr(self, _row, _column, value, _width):
                self.lines.append(str(value))

            def refresh(self):
                if any("BROADCAST ON" in line for line in self.lines):
                    self.ready_drawn.set()

            def get_wch(self):
                self.calls += 1
                if self.calls == 1:
                    streams.attach_gate.set()
                    return "p"
                if not self.ready_drawn.wait(.05):
                    raise broadcast.curses.error()
                if not self.scope_was_visible:
                    self.scope_was_visible = all(
                        any(address in line for line in self.lines)
                        for address in ("p1", "t1", "p2", "t2")
                    )
                    if self.resize_after_ready:
                        self.geometry = (4, 10)
                    return "§"
                if self.resize_after_ready:
                    return "\x1b"
                if streams.sent_event.wait(.5):
                    return "\x1b"
                return "\x1b"

        screen = Screen()
        events = []
        master, slave = pty.openpty()
        try:
            with tempfile.TemporaryDirectory() as temporary:
                ready_token = "fake-pty-token-123"
                ready_file = os.path.join(temporary, f".muxcle-broadcast-{ready_token}", "ready")
                publish = broadcast.publish_ready_marker
                marker_contents = []

                def raw_mode():
                    tty.setraw(slave)
                    events.append("raw")

                def no_echo():
                    settings = termios.tcgetattr(slave)
                    settings[3] &= ~termios.ECHO
                    termios.tcsetattr(slave, termios.TCSANOW, settings)
                    events.append("noecho")

                def publish_after_raw(path, token):
                    settings = termios.tcgetattr(slave)
                    self.assertFalse(settings[3] & termios.ECHO)
                    self.assertFalse(settings[3] & termios.ICANON)
                    events.append("ready-marker")
                    publish(path, token)
                    with open(path, encoding="utf-8") as marker:
                        marker_contents.append(marker.read())

                with patch.object(broadcast.curses, "raw", side_effect=raw_mode), \
                        patch.object(broadcast.curses, "noecho", side_effect=no_echo), \
                        patch.object(broadcast.curses, "set_escdelay"), \
                        patch.object(broadcast, "publish_ready_marker", side_effect=publish_after_raw), \
                        contextlib.redirect_stdout(io.StringIO()):
                    broadcast.interface(screen, relay, commands, streams, ready_file, ready_token)
                self.assertEqual(events, ["raw", "noecho", "ready-marker"])
                self.assertEqual(marker_contents, [f"{ready_token}:{os.getpid()}"])
                self.assertFalse(os.path.exists(ready_file))
        finally:
            os.close(master)
            os.close(slave)
        return screen, relay, commands, streams

    def test_pre_ready_key_is_ignored_until_full_scope_and_ready_are_rendered(self):
        screen, relay, commands, streams = self.run_interface()

        self.assertTrue(screen.scope_was_visible)
        self.assertEqual(streams.sent, [("t1", "§".encode()), ("t2", "§".encode())])
        self.assertFalse(any("§" in line for line in screen.lines))
        self.assertFalse(relay.active)
        self.assertTrue(streams.closed)
        self.assertTrue(commands.closed)

    def test_resize_between_ready_render_and_key_stops_before_delivery(self):
        screen, relay, _commands, streams = self.run_interface(resize_after_ready=True)

        self.assertTrue(screen.scope_was_visible)
        self.assertEqual(streams.sent, [])
        self.assertFalse(relay.active)
        self.assertTrue(streams.closed)


class StreamTests(unittest.TestCase):
    def test_frames_are_little_endian_and_oversized_payloads_are_refused(self):
        self.assertEqual(broadcast_stream.frame(7, broadcast_stream.DATA, b"xy"),
                         b"\x07\0\0\0\0\x02\0\0\0xy")
        with self.assertRaises(ValueError):
            broadcast_stream.frame(1, broadcast_stream.DATA, b"x" * (broadcast_stream.MAX_FRAME + 1))

    def test_attach_uses_one_framed_channel_per_target_and_discards_output(self):
        streams = broadcast_stream.Streams.__new__(broadcast_stream.Streams)
        streams.channels = {}
        requests = []
        writes = []
        streams._rpc = lambda method, params: requests.append((method, params)) or {
            "channel": len(requests), "terminal": {"address": params["terminal"],
                                                   "cols": params["cols"], "rows": params["rows"]}}
        streams._write = lambda channel, kind, payload: writes.append((channel, kind, payload))
        streams._drain = lambda: None
        records = [identity(target["terminal"]) for target in TARGETS]

        streams.attach(records)
        streams.send("t1", b"utf8")
        streams._consume(1, broadcast_stream.DATA, b"terminal output")

        self.assertEqual(list(streams.channels), ["t1", "t2"])
        self.assertEqual([method for method, _ in requests], ["terminal.attach", "terminal.attach"])
        self.assertEqual(requests[0][1]["cols"], 80)
        self.assertEqual(requests[0][1]["rows"], 24)
        self.assertIs(requests[0][1]["resumed"], True)
        self.assertEqual(writes[0], (1, broadcast_stream.DATA, b"utf8"))
        self.assertEqual(writes[1], (1, broadcast_stream.CREDIT, struct.pack("<I", len(b"terminal output"))))

    def test_attach_refuses_invalid_geometry_and_core_resize(self):
        streams = broadcast_stream.Streams.__new__(broadcast_stream.Streams)
        streams.channels = {}
        streams._rpc = lambda *_: self.fail("invalid geometry must be rejected before attach")
        streams._drain = lambda: None
        with self.assertRaisesRegex(RuntimeError, "geometry"):
            streams.attach([dict(identity("t1"), cols=0)])

        streams._rpc = lambda method, params: {
            "channel": 1, "terminal": {"address": params["terminal"],
                                         "cols": params["cols"] + 1, "rows": params["rows"]}}
        with self.assertRaisesRegex(RuntimeError, "changed target geometry"):
            streams.attach([identity("t1")])
        self.assertEqual(streams.channels, {})

    def test_frame_read_uses_one_deadline_for_header_and_payload(self):
        streams = broadcast_stream.Streams.__new__(broadcast_stream.Streams)
        deadlines = []
        responses = iter([broadcast_stream.HEADER.pack(0, broadcast_stream.DATA, 2), b"ok"])
        streams._exact = lambda size, deadline: (deadlines.append(deadline), next(responses))[1]

        with patch("broadcast_stream.time.monotonic", return_value=20.0):
            self.assertEqual(streams._read_frame(), (0, broadcast_stream.DATA, b"ok"))

        self.assertEqual(deadlines, [20.0 + broadcast_stream.READ_TIMEOUT] * 2)

    def test_exact_enforces_expired_deadline_even_when_always_readable(self):
        streams = broadcast_stream.Streams.__new__(broadcast_stream.Streams)
        output = type("Output", (), {"fileno": lambda _self: 1})()
        streams.process = type("Process", (), {"stdout": output})()
        streams._readable = lambda _deadline: True
        with patch("broadcast_stream.time.monotonic", side_effect=[100.0, 102.0]) as clock:
            with patch("broadcast_stream.os.read", return_value=b"x") as read:
                with self.assertRaisesRegex(RuntimeError, "stream timed out"):
                    streams._exact(1, 101.0)
        self.assertEqual(read.call_count, 1)
        self.assertEqual(clock.call_count, 2)

    def test_rpc_deadline_expires_while_unrelated_frames_remain_readable(self):
        streams = broadcast_stream.Streams.__new__(broadcast_stream.Streams)
        streams._next_request = 1
        streams.closed = False
        streams.error = None
        streams.lock = threading.Lock()
        streams.channels = {}
        streams._write = lambda *_args: None
        frames = iter([(7, broadcast_stream.DATA, b"noise"), (0, broadcast_stream.DATA, b"late reply")])
        reads = []
        streams._read_frame = lambda _deadline: (reads.append(True), next(frames))[1]
        streams._consume = lambda *_args: None

        with patch("broadcast_stream.time.monotonic", side_effect=[100.0, 100.0, 106.0]):
            with self.assertRaisesRegex(RuntimeError, "RPC timed out"):
                streams._rpc("terminal.attach", {})

        self.assertEqual(reads, [True])

    def test_rpc_has_one_deadline_across_unrelated_output_frames(self):
        streams = broadcast_stream.Streams.__new__(broadcast_stream.Streams)
        streams._next_request = 1
        streams.closed = False
        streams.error = None
        streams.lock = threading.Lock()
        streams.channels = {"t1": 7}
        writes, deadlines = [], []
        streams._write = lambda *args: writes.append(args)
        response = json.dumps({"jsonrpc": "2.0", "id": 1, "result": {"ok": True}}).encode()
        frames = iter([(7, broadcast_stream.DATA, b"discarded"), (0, broadcast_stream.DATA, response)])
        streams._read_frame = lambda deadline: (deadlines.append(deadline), next(frames))[1]

        with patch("broadcast_stream.time.monotonic", return_value=40.0):
            self.assertEqual(streams._rpc("terminal.attach", {}), {"ok": True})

        self.assertEqual(deadlines, [40.0 + broadcast_stream.READ_TIMEOUT] * 2)
        self.assertEqual(writes[1], (7, broadcast_stream.CREDIT, struct.pack("<I", len(b"discarded"))))

    def test_drain_waits_indefinitely_between_frames_but_stops_on_close(self):
        streams = broadcast_stream.Streams.__new__(broadcast_stream.Streams)
        streams.channels = {"t1": 7}
        streams.closed = False
        streams.error = None
        frames = iter([(7, broadcast_stream.DATA, b"not displayed"),
                       (7, broadcast_stream.CLOSE, b"")])
        readiness = iter([False, True, True])
        waits = []
        writes = []
        streams._readable = lambda deadline=None: (waits.append(deadline), next(readiness))[1]
        streams._read_frame = lambda _deadline: next(frames)
        streams._write = lambda channel, kind, payload: writes.append((channel, kind, payload))

        streams._drain()

        self.assertEqual(writes, [(7, broadcast_stream.CREDIT, struct.pack("<I", len(b"not displayed")))])
        self.assertEqual(waits, [None, None, None])
        self.assertIsInstance(streams.error, RuntimeError)
        self.assertNotIn(b"not displayed", writes[0][2])

    def test_close_detaches_its_streams_without_touching_target_processes(self):
        class Sink:
            def __init__(self):
                self.writes = []
                self.closed = False

            def write(self, value):
                self.writes.append(value)

            def close(self):
                self.closed = True

        class Process:
            def __init__(self):
                self.stdin = Sink()
                self.stdout = Sink()
                self.waited = False
                self.terminated = False
                self.killed = False

            def wait(self, timeout=None):
                self.waited = True
                return 0

            def terminate(self):
                self.terminated = True

            def kill(self):
                self.killed = True

        process = Process()
        streams = broadcast_stream.Streams.__new__(broadcast_stream.Streams)
        streams.process = process
        streams.lock = threading.Lock()
        streams.channels = {"t1": 7, "t2": 8}
        streams.closed = False
        streams.error = None

        streams.close()

        self.assertEqual(process.stdin.writes, [
            broadcast_stream.frame(7, broadcast_stream.CLOSE, b""),
            broadcast_stream.frame(8, broadcast_stream.CLOSE, b""),
        ])
        self.assertTrue(process.stdin.closed)
        self.assertTrue(process.waited)
        self.assertFalse(process.terminated)
        self.assertFalse(process.killed)

    def test_core_hello_must_match_expected_identity_and_framed_generation(self):
        class Process:
            def __init__(self, reply):
                read_fd, write_fd = os.pipe()
                os.write(write_fd, reply)
                os.close(write_fd)
                self.stdin = open(os.devnull, "wb", buffering=0)
                self.stdout = os.fdopen(read_fd, "rb", buffering=0)
                self.returncode = 0

            def wait(self, timeout=None):
                return 0

            def poll(self):
                return self.returncode

            def terminate(self):
                pass

            def kill(self):
                pass

        result = {"generation": 1, "version": "0.1.18", "core": {"id": CORE_ID},
                  "framed": True, "methods": ["terminal.attach"], "features": []}
        process = Process((json.dumps({"jsonrpc": "2.0", "id": 0, "result": result}) + "\n").encode())
        streams = broadcast_stream.Streams(CORE_ID, popen=lambda *_args, **_kwargs: process)
        streams.close()
        self.assertTrue(process.stdin.closed)

        bad_process = Process((json.dumps({"jsonrpc": "2.0", "id": 0, "result": {**result, "core": {"id": "b" * 32}}}) + "\n").encode())
        with self.assertRaisesRegex(RuntimeError, "identity"):
            broadcast_stream.Streams(CORE_ID, popen=lambda *_args, **_kwargs: bad_process)
        bad_process.stdout.close()


if __name__ == "__main__":
    unittest.main()
