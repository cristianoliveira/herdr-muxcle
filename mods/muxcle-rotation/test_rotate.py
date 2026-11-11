import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("rotation_document", Path(__file__).with_name("rotate.py"))
rotation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rotation)


def leaf(name, size=None):
    result = {"type": "block", "id": name, "content": {"terminal": "t-" + name}}
    if size is not None:
        result["size"] = {"weight": size}
    return result


def document():
    return {"spaces": [{"id": "space", "tabs": [
        {"id": "tab", "root": {"type": "row", "id": "root", "children": [
            leaf("a", 0.7), {"id": "stack", "type": "column", "size": {"weight": 0.3},
            "children": [dict(leaf("b"), min=50, resizable=False), leaf("c")]},
        ]}},
        {"id": "other", "root": leaf("other")},
    ]}], "future": {"preserve": True}}


def context(machine=None):
    prefix = machine + "/" if machine else ""
    return {"space": prefix + "space", "tab": prefix + "tab", "pane": prefix + "b",
            "panes": [prefix + name for name in ["a", "b", "c"]],
            "terminals": [prefix + "t-" + name for name in ["a", "b", "c"]], "machine": machine}


def two_terminal_context(machine=None):
    scope = context(machine)
    scope["panes"] = scope["panes"][:2]
    scope["terminals"] = scope["terminals"][:2]
    return scope


def two_terminal_document():
    value = document()
    first = leaf("a", 0.7)
    first.update({"min": 60, "max": 900, "resizable": False, "unknown": "left"})
    second = leaf("b", 0.3)
    second.update({"min": 30, "unknown": "right"})
    value["spaces"][0]["tabs"][0]["root"] = {
        "type": "row", "id": "root", "children": [first, second],
    }
    return value


class RotationDocumentTests(unittest.TestCase):
    def test_nested_rotation_preserves_slots_containers_other_tabs_and_input(self):
        original = document()
        before = copy.deepcopy(original)

        result, target = rotation.rotate_document(original, rotation.normalize_context(context()))

        left, stack = result["spaces"][0]["tabs"][0]["root"]["children"]
        self.assertEqual([left["id"], *[node["id"] for node in stack["children"]]], ["c", "a", "b"])
        self.assertEqual(target, "a")
        self.assertEqual(left["size"], {"weight": 0.7})
        self.assertEqual(stack["id"], "stack")
        self.assertEqual(stack["size"], {"weight": 0.3})
        self.assertEqual(stack["children"][0]["min"], 50)
        self.assertFalse(stack["children"][0]["resizable"])
        self.assertNotIn("min", stack["children"][1])
        self.assertEqual(result["spaces"][0]["tabs"][1], original["spaces"][0]["tabs"][1])
        self.assertEqual(result["future"], original["future"])
        self.assertEqual(original, before)

    def test_grid_rotation_returns_to_the_original_document_after_a_full_cycle(self):
        value = document()
        value["spaces"][0]["tabs"][0]["root"] = {
            "type": "row", "id": "grid", "children": [
                {"id": "left", "type": "column", "size": {"weight": 0.8}, "children": [leaf("a"), leaf("b")]},
                {"id": "right", "type": "column", "size": {"weight": 0.2}, "children": [leaf("c"), leaf("d")]},
            ],
        }
        original = copy.deepcopy(value)
        focus = "c"
        for turn in range(4):
            grid = value["spaces"][0]["tabs"][0]["root"]
            nodes = [node for column in grid["children"] for node in column["children"]]
            scope = {**context(), "pane": focus, "panes": [node["id"] for node in nodes],
                     "terminals": [node["content"]["terminal"] for node in nodes]}
            value, focus = rotation.rotate_document(value, rotation.normalize_context(scope))
            if turn == 0:
                grid = value["spaces"][0]["tabs"][0]["root"]
                self.assertEqual([node["id"] for column in grid["children"] for node in column["children"]], ["d", "a", "b", "c"])
                self.assertEqual(focus, "b")
        self.assertEqual(value, original)
        self.assertEqual(focus, "c")

    def test_stale_identity_terminal_replacement_and_unsupported_tree_do_not_mutate(self):
        cases = []
        stale = context()
        stale["panes"].reverse()
        cases.append((document(), stale))
        replaced = context()
        replaced["terminals"][0] = "new-terminal"
        cases.append((document(), replaced))
        mod = document()
        mod["spaces"][0]["tabs"][0]["root"]["children"][0]["content"] = {"mod": "editor"}
        cases.append((mod, context()))
        hidden = document()
        hidden["spaces"][0]["tabs"][0]["root"]["hidden"] = True
        cases.append((hidden, context()))
        unsupported = document()
        unsupported["spaces"][0]["tabs"][0]["root"]["type"] = "stack"
        cases.append((unsupported, context()))
        for original, scope in cases:
            with self.subTest(scope=scope):
                before = copy.deepcopy(original)
                with self.assertRaises(ValueError):
                    rotation.rotate_document(original, rotation.normalize_context(scope))
                self.assertEqual(original, before)

    def test_two_terminal_cas_rotates_once_and_preserves_slot_geometry_and_qualified_scope(self):
        original = two_terminal_document()
        calls = []

        def request(method, params):
            calls.append((method, params))
            return {"version": 12, "value": original} if method == "doc.get" else {"version": 13}

        result = rotation.rotate(two_terminal_context("server"), request)

        self.assertEqual(result, {"changed": True, "pane": "server/a"})
        self.assertEqual([method for method, _ in calls], ["doc.get", "doc.set"])
        self.assertEqual(calls[0][1], {"name": "herdr-app", "on": "server"})
        self.assertEqual(calls[1][1]["version"], 12)
        self.assertEqual(calls[1][1]["on"], "server")
        children = calls[1][1]["value"]["spaces"][0]["tabs"][0]["root"]["children"]
        self.assertEqual([node["id"] for node in children], ["b", "a"])
        self.assertEqual([node["content"]["terminal"] for node in children], ["t-b", "t-a"])
        self.assertEqual(children[0]["size"], {"weight": 0.7})
        self.assertEqual(children[0]["min"], 60)
        self.assertEqual(children[0]["max"], 900)
        self.assertFalse(children[0]["resizable"])
        self.assertEqual(children[0]["unknown"], "right")
        self.assertEqual(children[1]["size"], {"weight": 0.3})
        self.assertEqual(children[1]["min"], 30)
        self.assertEqual(children[1]["unknown"], "left")

    def test_two_terminal_cas_rejects_stale_order_and_never_retries_conflict_or_uncertain_ack(self):
        original = two_terminal_document()
        stale = two_terminal_context()
        stale["panes"].reverse()
        calls = []

        def read_stale(method, _params):
            calls.append(method)
            return {"version": 12, "value": original}

        with self.assertRaisesRegex(ValueError, "Pane order"):
            rotation.rotate(stale, read_stale)
        self.assertEqual(calls, ["doc.get"])

        for response, message in [(RuntimeError("conflict"), "conflict"), ({"version": 12}, "uncertain")]:
            calls = []

            def fail_once(method, _params):
                calls.append(method)
                if method == "doc.get":
                    return {"version": 12, "value": original}
                if isinstance(response, Exception):
                    raise response
                return response

            with self.subTest(message=message), self.assertRaisesRegex(RuntimeError, message):
                rotation.rotate(two_terminal_context(), fail_once)
            self.assertEqual(calls, ["doc.get", "doc.set"])

    def test_remote_write_is_versioned_and_scoped_once(self):
        calls = []
        original = document()
        def request(method, params):
            calls.append((method, params))
            return {"version": 12, "value": original} if method == "doc.get" else {"version": 13}

        result = rotation.rotate(context("server"), request)

        self.assertEqual(result, {"changed": True, "pane": "server/a"})
        self.assertEqual([method for method, _ in calls], ["doc.get", "doc.set"])
        self.assertEqual(calls[0][1], {"name": "herdr-app", "on": "server"})
        self.assertEqual(calls[1][1]["on"], "server")
        self.assertEqual(calls[1][1]["version"], 12)
        self.assertEqual(original, document())

    def test_invalid_context_and_versions_fail_before_any_write(self):
        bad = [None, {}, {**context(), "panes": ["a", "a", "c"]},
               {**context("server"), "pane": "other/b"}]
        for scope in bad:
            with self.subTest(scope=scope), self.assertRaises(ValueError):
                rotation.rotate(scope, lambda *_: self.fail("must not contact core"))
        for version in [None, True, -1]:
            calls = []
            def request(method, _params):
                calls.append(method)
                return {"value": document(), "version": version}
            with self.assertRaises(ValueError):
                rotation.rotate(context(), request)
            self.assertEqual(calls, ["doc.get"])

    def test_size_depth_and_pane_limits_refuse_without_a_write(self):
        oversized = {**context(), "panes": ["x"] * 65, "terminals": ["tx"] * 65}
        with self.assertRaises(ValueError):
            rotation.rotate(oversized, lambda *_: self.fail("must not contact core"))
        large = document()
        large["future"] = "x" * rotation.MAX_DOCUMENT_BYTES
        deep = document()
        root = deep["spaces"][0]["tabs"][0]["root"]
        for _ in range(34):
            root = {"type": "row", "children": [root]}
        deep["spaces"][0]["tabs"][0]["root"] = root
        for value in [large, deep]:
            calls = []
            def request(method, _params):
                calls.append(method)
                return {"version": 12, "value": value}
            with self.assertRaises(ValueError):
                rotation.rotate(context(), request)
            self.assertEqual(calls, ["doc.get"])

    def test_conflict_is_not_retried_and_invalid_ack_is_uncertain(self):
        calls = []
        def conflict(method, _params):
            calls.append(method)
            if method == "doc.set":
                raise RuntimeError("conflict")
            return {"version": 12, "value": document()}
        with self.assertRaises(RuntimeError):
            rotation.rotate(context(), conflict)
        self.assertEqual(calls, ["doc.get", "doc.set"])
        with self.assertRaisesRegex(RuntimeError, "confirm"):
            rotation.rotate(context(), lambda method, _: {"version": 12, "value": document()} if method == "doc.get" else {})

    def test_helper_cli_rotates_through_a_fake_core_without_touching_the_real_core(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            state_file = root / "document.json"
            log_file = root / "requests.jsonl"
            state_file.write_text(json.dumps({"value": document(), "version": 12}))
            fake_core = root / "hc"
            fake_core.write_text(f"#!{sys.executable}\n" + '''import json, os, sys
from pathlib import Path
state_file = Path(os.environ["MOCK_DOCUMENT"])
for line in sys.stdin:
    request = json.loads(line)
    with open(os.environ["MOCK_REQUESTS"], "a") as log:
        log.write(json.dumps(request) + "\\n")
    state = json.loads(state_file.read_text())
    if request["method"] == "hello":
        result = {}
    elif request["method"] == "doc.get":
        result = state
    else:
        assert request["method"] == "doc.set"
        assert request["params"]["version"] == state["version"]
        state = {"value": request["params"]["value"], "version": state["version"] + 1}
        state_file.write_text(json.dumps(state))
        result = {"version": state["version"]}
    print(json.dumps({"id": request["id"], "result": result}))
''')
            fake_core.chmod(0o700)
            environment = {**os.environ, "PATH": str(root) + os.pathsep + os.environ["PATH"],
                           "MOCK_DOCUMENT": str(state_file), "MOCK_REQUESTS": str(log_file)}

            result = subprocess.run([sys.executable, "-I", "-B", str(Path(__file__).with_name("rotate.py")),
                                     json.dumps(context("server"))], env=environment, text=True,
                                    capture_output=True, timeout=10)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), {"changed": True, "pane": "server/a"})
            self.assertEqual(json.loads(state_file.read_text())["version"], 13)
            requests = [json.loads(line) for line in log_file.read_text().splitlines()]
            writes = [request for request in requests if request["method"] == "doc.set"]
            self.assertEqual(len(writes), 1)
            self.assertEqual(writes[0]["params"]["on"], "server")
            self.assertEqual(writes[0]["params"]["version"], 12)

    def test_rpc_uses_json_argv_and_timeout_without_shell_or_retry(self):
        process = subprocess.CompletedProcess([], 0, '{"id":1,"result":{"version":13}}\n', "")
        with patch.object(rotation.subprocess, "run", return_value=process) as run:
            self.assertEqual(rotation.rpc("doc.set", {"name": "herdr-app"}), {"version": 13})
        self.assertEqual(run.call_args.args[0], ["hc", "connect"])
        self.assertEqual(run.call_args.kwargs["timeout"], 5)
        self.assertNotIn("shell", run.call_args.kwargs)
        messages = [json.loads(line) for line in run.call_args.kwargs["input"].splitlines()]
        self.assertFalse(messages[0]["params"]["framed"])
        self.assertEqual(messages[1]["method"], "doc.set")
        with patch.object(rotation.subprocess, "run", side_effect=subprocess.TimeoutExpired("hc", 5)) as run:
            with self.assertRaisesRegex(RuntimeError, "uncertain"):
                rotation.rpc("doc.set", {})
            self.assertEqual(run.call_count, 1)
        with patch.object(rotation.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, '{"id":1,"error":{"data":{"kind":"conflict"}}}\n', "")):
            with self.assertRaisesRegex(RuntimeError, "conflict"):
                rotation.rpc("doc.set", {})
        for output in ["not-json", "[]", '{"id":1,"result":null}', '{"id":true,"result":{"version":13}}']:
            with patch.object(rotation.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, output, "")) as run:
                with self.assertRaises(RuntimeError):
                    rotation.rpc("doc.set", {})
                self.assertEqual(run.call_count, 1)
