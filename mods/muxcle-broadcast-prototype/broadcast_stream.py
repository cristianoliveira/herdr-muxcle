"""Bounded, session-bound Core framed transport for broadcast input."""
import json
import os
import select
import struct
import subprocess
import threading
import time


HEADER = struct.Struct("<IBI")
DATA, CREDIT, CLOSE = 0, 1, 2
MAX_FRAME = 16 << 20
MAX_REPLY = 64 << 10
WRITE_TIMEOUT = 1.0
READ_TIMEOUT = 5.0


def frame(channel, kind, payload):
    if len(payload) > MAX_FRAME:
        raise ValueError("Core frame is too large; broadcast stopped.")
    return HEADER.pack(channel, kind, len(payload)) + payload


class Streams:
    def __init__(self, expected_core_id, popen=subprocess.Popen):
        self.process = popen(["hc", "connect"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, bufsize=0)
        self.lock = threading.Lock()
        self.channels = {}
        self.closed = False
        self.error = None
        self._next_request = 1
        try:
            self._handshake(expected_core_id)
            os.set_blocking(self.process.stdin.fileno(), False)
        except Exception:
            self.close()
            raise

    def _handshake(self, expected_core_id):
        request = {"jsonrpc": "2.0", "id": 0, "method": "hello",
                   "params": {"generation": 1, "framed": True}}
        self.process.stdin.write(json.dumps(request, separators=(",", ":")).encode() + b"\n")
        reply = bytearray()
        deadline = time.monotonic() + READ_TIMEOUT
        while not reply.endswith(b"\n") and len(reply) < MAX_REPLY:
            if not self._readable(deadline):
                raise RuntimeError("Core handshake timed out; broadcast stopped.")
            piece = os.read(self.process.stdout.fileno(), MAX_REPLY - len(reply))
            if time.monotonic() >= deadline:
                raise RuntimeError("Core handshake timed out; broadcast stopped.")
            if not piece:
                raise RuntimeError("Core stream disconnected during handshake.")
            reply.extend(piece)
        try:
            result = json.loads(reply).get("result", {})
        except (json.JSONDecodeError, AttributeError):
            raise RuntimeError("Core returned an invalid stream handshake.") from None
        core = result.get("core") if isinstance(result, dict) else None
        if (not isinstance(core, dict) or core.get("id") != expected_core_id
                or result.get("generation") != 1 or result.get("framed") is not True
                or "terminal.attach" not in result.get("methods", [])):
            raise RuntimeError("Core identity or framed-stream protocol changed; broadcast stopped.")

    def _readable(self, deadline=None):
        if deadline is None:
            return bool(select.select([self.process.stdout], [], [], None)[0])
        now = time.monotonic()
        if now >= deadline:
            return False
        readable = bool(select.select([self.process.stdout], [], [], deadline - now)[0])
        return readable and time.monotonic() < deadline

    def _exact(self, size, deadline=None):
        if deadline is None:
            deadline = time.monotonic() + READ_TIMEOUT
        result = bytearray()
        while len(result) < size:
            if time.monotonic() >= deadline:
                raise RuntimeError("Core stream timed out; broadcast stopped.")
            if not self._readable(deadline):
                raise RuntimeError("Core stream timed out; broadcast stopped.")
            chunk = os.read(self.process.stdout.fileno(), size - len(result))
            if time.monotonic() >= deadline:
                raise RuntimeError("Core stream timed out; broadcast stopped.")
            if not chunk:
                raise RuntimeError("Core stream disconnected; broadcast stopped.")
            result.extend(chunk)
        return bytes(result)

    def _read_frame(self, deadline=None):
        if deadline is None:
            deadline = time.monotonic() + READ_TIMEOUT
        channel, kind, length = HEADER.unpack(self._exact(HEADER.size, deadline))
        if length > MAX_FRAME:
            raise RuntimeError("Core sent an oversized frame; broadcast stopped.")
        return channel, kind, self._exact(length, deadline)

    def _write(self, channel, kind, payload):
        with self.lock:
            if self.closed or self.error:
                raise RuntimeError("Core stream stopped; delivery may be partial. No retry.")
            data = memoryview(frame(channel, kind, payload))
            deadline = time.monotonic() + WRITE_TIMEOUT
            while data:
                remaining = max(0.0, deadline - time.monotonic())
                if not select.select([], [self.process.stdin], [], remaining)[1]:
                    raise RuntimeError("Core stream write timed out; delivery may be partial. No retry.")
                try:
                    count = os.write(self.process.stdin.fileno(), data)
                except BlockingIOError:
                    continue
                if count <= 0:
                    raise RuntimeError("Core stream write failed; delivery may be partial. No retry.")
                data = data[count:]

    def _rpc(self, method, params):
        request_id = self._next_request
        self._next_request += 1
        body = json.dumps({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params},
                          separators=(",", ":")).encode()
        deadline = time.monotonic() + READ_TIMEOUT
        self._write(0, DATA, body)
        while True:
            if time.monotonic() >= deadline:
                raise RuntimeError("Core RPC timed out; broadcast stopped.")
            channel, kind, payload = self._read_frame(deadline)
            if channel == 0 and kind == DATA:
                try:
                    reply = json.loads(payload)
                except json.JSONDecodeError:
                    raise RuntimeError("Core returned an invalid attach response.") from None
                if isinstance(reply, dict) and reply.get("id") == request_id:
                    if "error" in reply:
                        raise RuntimeError("Core refused a broadcast target stream.")
                    return reply.get("result")
            self._consume(channel, kind, payload)

    def attach(self, records):
        for record in records:
            address = record.get("address")
            cols, rows = record.get("cols"), record.get("rows")
            if (not isinstance(address, str) or not isinstance(cols, int) or isinstance(cols, bool)
                    or not 0 < cols <= 0xFFFF or not isinstance(rows, int) or isinstance(rows, bool)
                    or not 0 < rows <= 0xFFFF):
                raise RuntimeError("Captured terminal geometry is invalid; broadcast stopped.")
            result = self._rpc("terminal.attach", {
                "terminal": address, "cols": cols, "rows": rows, "history": 0, "resumed": True,
            })
            terminal = result.get("terminal") if isinstance(result, dict) else None
            channel = result.get("channel") if isinstance(result, dict) else None
            if (not isinstance(terminal, dict) or terminal.get("address") != address
                    or terminal.get("cols") != cols or terminal.get("rows") != rows
                    or not isinstance(channel, int) or isinstance(channel, bool)
                    or not 0 < channel <= 0xFFFFFFFF or channel in self.channels.values()):
                raise RuntimeError("Core changed target geometry or returned an invalid stream; broadcast stopped.")
            self.channels[address] = channel
        self.reader = threading.Thread(target=self._drain, name="broadcast-core-stream", daemon=True)
        self.reader.start()

    def _consume(self, channel, kind, payload):
        if channel == 0:
            return
        if kind == DATA:
            self._write(channel, CREDIT, struct.pack("<I", len(payload)))
            return
        if kind == CLOSE:
            raise RuntimeError("A target stream closed; delivery may be partial. No retry.")
        if kind != CREDIT:
            raise RuntimeError("Core sent an unsupported frame; broadcast stopped.")

    def _drain(self):
        try:
            while not self.closed:
                if not self._readable():
                    continue
                channel, kind, payload = self._read_frame(time.monotonic() + READ_TIMEOUT)
                self._consume(channel, kind, payload)
        except Exception as error:
            if not self.closed:
                self.error = error

    def send(self, address, data):
        channel = self.channels.get(address)
        if channel is None:
            raise RuntimeError("Target stream is missing; delivery may be partial. No retry.")
        self._write(channel, DATA, data)

    def close(self):
        with self.lock:
            if self.closed:
                return
            self.closed = True
            for channel in self.channels.values():
                try:
                    self.process.stdin.write(frame(channel, CLOSE, b""))
                except (BrokenPipeError, OSError, ValueError):
                    break
            try:
                self.process.stdin.close()
            except (BrokenPipeError, OSError, ValueError):
                pass
        try:
            self.process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=1)
        try:
            self.process.stdout.close()
        except (OSError, ValueError):
            pass
