import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equalize


def leaf(name, terminal, **fields):
    return {"type": "block", "id": name, "content": {"terminal": terminal}, **fields}


def document():
    return {
        "spaces": [
            {
                "id": "space",
                "tabs": [
                    {
                        "id": "tab",
                        "root": {
                            "id": "root",
                            "type": "row",
                            "size": {"px": 900},
                            "min": 700,
                            "resizable": False,
                            "extension": "preserve-root",
                            "children": [
                                leaf("a", "ta", size={"weight": 4}),
                                {
                                    "id": "nested",
                                    "type": "column",
                                    "size": {"weight": 2},
                                    "extension": "preserve",
                                    "children": [
                                        leaf("b", "tb", size={"weight": 3}),
                                        leaf("c", "tc"),
                                    ],
                                },
                            ],
                        },
                    },
                    {"id": "other-tab", "root": leaf("other", "other-terminal")},
                ],
            },
            {"id": "other-space", "tabs": [{"id": "other-tab", "root": leaf("elsewhere", "elsewhere-terminal")} ]},
        ],
        "extension": {"untouched": True},
    }


def context():
    return {
        "space": "space",
        "tab": "tab",
        "pane": "b",
        "panes": ["a", "b", "c"],
        "terminals": ["ta", "tb", "tc"],
        "machine": None,
    }


class EqualizeDocumentTests(unittest.TestCase):
    def test_equalizes_each_nested_split_and_preserves_unknown_fields_and_other_tabs(self):
        original = document()
        result, count = equalize.equalize_document(original, context())
        root = result["spaces"][0]["tabs"][0]["root"]
        nested = root["children"][1]

        self.assertEqual(count, 2)
        self.assertEqual([child["size"]["weight"] for child in root["children"]], [1, 1])
        self.assertEqual([child["size"]["weight"] for child in nested["children"]], [1, 1])
        self.assertEqual(nested["size"], {"weight": 1})
        self.assertEqual(nested["extension"], "preserve")
        self.assertEqual(root["size"], {"px": 900})
        self.assertEqual(root["min"], 700)
        self.assertFalse(root["resizable"])
        self.assertEqual(root["extension"], "preserve-root")
        self.assertEqual(root["children"][0]["content"], {"terminal": "ta"})
        self.assertEqual(result["spaces"][0]["tabs"][1], original["spaces"][0]["tabs"][1])
        self.assertEqual(result["spaces"][1], original["spaces"][1])
        self.assertEqual(result["extension"], original["extension"])
        self.assertEqual(original["spaces"][0]["tabs"][0]["root"]["children"][0]["size"]["weight"], 4)

    def test_equal_layout_is_unchanged_and_omitted_sizes_mean_weight_one(self):
        value = document()
        root = value["spaces"][0]["tabs"][0]["root"]
        root["children"][0]["size"] = {"weight": 2}
        root["children"][1]["size"] = {"weight": 2}
        root["children"][1]["children"][0].pop("size")
        root["children"][1]["children"][1]["size"] = {"weight": 1}

        result, count = equalize.equalize_document(value, context())

        self.assertEqual(result, value)
        self.assertEqual(count, 0)

    def test_equal_fixed_pixel_siblings_are_unchanged(self):
        value = document()
        root = value["spaces"][0]["tabs"][0]["root"]
        root["children"][0]["size"] = {"px": 120}
        root["children"][1]["size"] = {"px": 120}
        root["children"][1]["children"][0].pop("size")
        root["children"][1]["children"][1]["size"] = {"weight": 1}

        result, count = equalize.equalize_document(value, context())

        self.assertEqual(result, value)
        self.assertEqual(count, 0)

    def test_rejects_invalid_or_ambiguous_size_semantics(self):
        for size in (
            {"weight": True},
            {"weight": 0},
            {"weight": -1},
            {"weight": float("inf")},
            {"px": 100, "weight": 2},
            {"weight": 2, "distribution": "mystery"},
            {},
        ):
            value = document()
            value["spaces"][0]["tabs"][0]["root"]["children"][0]["size"] = size
            with self.subTest(size=size):
                with self.assertRaises(ValueError):
                    equalize.equalize_document(value, context())

    def test_one_pane_is_a_noop(self):
        value = document()
        value["spaces"][0]["tabs"][0]["root"] = leaf("a", "ta")
        scope = {**context(), "pane": "a", "panes": ["a"], "terminals": ["ta"]}

        result, count = equalize.equalize_document(value, scope)

        self.assertEqual(result, value)
        self.assertEqual(count, 0)

    def test_refuses_geometry_constraints_hidden_nodes_and_mods(self):
        cases = []
        for field, field_value in [
            ("size", {"px": 200}),
            ("min", 80),
            ("max", 400),
            ("resizable", False),
            ("hidden", True),
        ]:
            value = document()
            value["spaces"][0]["tabs"][0]["root"]["children"][0][field] = field_value
            cases.append(value)
        value = document()
        value["spaces"][0]["tabs"][0]["root"]["children"][0]["content"]["mod"] = "editor"
        cases.append(value)

        for value in cases:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    equalize.equalize_document(value, context())

    def test_refuses_stale_or_ambiguous_pane_identity(self):
        for changed in (
            {**context(), "panes": ["a", "wrong", "c"]},
            {**context(), "terminals": ["ta", "wrong", "tc"]},
            {**context(), "pane": "missing"},
            {**context(), "panes": ["a", "a", "c"]},
        ):
            with self.subTest(changed=changed):
                with self.assertRaises(ValueError):
                    equalize.equalize_document(document(), changed)

    def test_refuses_unsupported_nodes_and_tree_bounds(self):
        invalid = document()
        invalid["spaces"][0]["tabs"][0]["root"]["children"][1]["type"] = "stack"
        with self.assertRaisesRegex(ValueError, "no sizing change was sent"):
            equalize.equalize_document(invalid, context())

        deep = leaf("a", "ta")
        for index in range(34):
            deep = {"type": "row", "children": [deep, leaf(f"extra-{index}", f"extra-t-{index}")]}
        invalid = document()
        invalid["spaces"][0]["tabs"][0]["root"] = deep
        with self.assertRaises(ValueError):
            equalize.equalize_document(invalid, context())

    def test_doc_write_uses_exact_version_once_and_noops_without_a_write(self):
        calls = []
        value = document()

        def request(method, params):
            calls.append((method, params))
            if method == "doc.get":
                return {"version": 7, "value": value}
            return {"version": 8}

        result = equalize.equalize(context(), request)

        self.assertEqual(result, {"changed": True, "splits": 2})
        self.assertEqual([method for method, _ in calls], ["doc.get", "doc.set"])
        self.assertEqual(calls[1][1]["version"], 7)
        self.assertEqual(calls[1][1]["name"], "herdr-app")
        self.assertNotIn("on", calls[1][1])

        already_equal = document()
        root = already_equal["spaces"][0]["tabs"][0]["root"]
        root["children"][0]["size"] = {"weight": 1}
        root["children"][1]["size"] = {"weight": 1}
        root["children"][1]["children"][0]["size"] = {"weight": 1}
        root["children"][1]["children"][1]["size"] = {"weight": 1}
        no_write_calls = []
        no_op = equalize.equalize(context(), lambda method, params: no_write_calls.append(method) or {"version": 4, "value": already_equal})

        self.assertEqual(no_op, {"changed": False, "splits": 0})
        self.assertEqual(no_write_calls, ["doc.get"])

    def test_constraints_stop_before_doc_set_and_conflicts_are_not_retried(self):
        constrained = document()
        constrained["spaces"][0]["tabs"][0]["root"]["children"][0]["min"] = 120
        methods = []

        def read_constrained(method, params):
            methods.append(method)
            return {"version": 3, "value": constrained}

        with self.assertRaisesRegex(ValueError, "constraints prevent safe equalizing"):
            equalize.equalize(context(), read_constrained)
        self.assertEqual(methods, ["doc.get"])

        methods.clear()

        def conflict(method, params):
            methods.append(method)
            if method == "doc.get":
                return {"version": 3, "value": document()}
            raise RuntimeError("Layout conflict")

        with self.assertRaisesRegex(RuntimeError, "Layout conflict"):
            equalize.equalize(context(), conflict)
        self.assertEqual(methods, ["doc.get", "doc.set"])

    def test_invalid_machine_scope_is_rejected_before_core_read(self):
        scoped = {**context(), "machine": "build"}
        calls = []

        with self.assertRaisesRegex(ValueError, "different machines"):
            equalize.equalize(scoped, lambda method, params: calls.append(method))
        self.assertEqual(calls, [])

    def test_machine_scope_and_write_outcome_errors_are_explicit(self):
        scoped = {**context(), "space": "build/space", "tab": "build/tab", "pane": "build/b",
                  "panes": ["build/a", "build/b", "build/c"],
                  "terminals": ["build/ta", "build/tb", "build/tc"], "machine": "build"}
        calls = []

        def request(method, params):
            calls.append((method, params))
            return {"version": 9, "value": document()} if method == "doc.get" else {"version": 10}

        self.assertEqual(equalize.equalize(scoped, request), {"changed": True, "splits": 2})
        self.assertEqual([method for method, _ in calls], ["doc.get", "doc.set"])
        self.assertEqual(calls[0][1]["on"], "build")
        self.assertEqual(calls[1][1]["on"], "build")

        def invalid_ack(method, params):
            return {"version": 4, "value": document()} if method == "doc.get" else {"version": 99}

        with self.assertRaisesRegex(RuntimeError, "outcome is uncertain"):
            equalize.equalize(context(), invalid_ack)

    def test_rpc_uses_bounded_no_shell_json_argv_and_timeout_without_retry(self):
        with patch.object(equalize.subprocess, "run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = '{"id":1,"result":{"version":5}}\n'
            run.return_value.stderr = ""
            self.assertEqual(equalize.rpc("doc.get", {"name": "herdr-app"}), {"version": 5})

        command = run.call_args.args[0]
        self.assertEqual(command, ["hc", "connect"])
        self.assertFalse(run.call_args.kwargs["shell"] if "shell" in run.call_args.kwargs else False)
        self.assertEqual(run.call_args.kwargs["timeout"], 5)
        requests = [json.loads(line) for line in run.call_args.kwargs["input"].splitlines()]
        self.assertEqual([request["method"] for request in requests], ["hello", "doc.get"])

        with patch.object(equalize.subprocess, "run", side_effect=equalize.subprocess.TimeoutExpired("hc", 5)) as run:
            with self.assertRaisesRegex(RuntimeError, "outcome is uncertain"):
                equalize.rpc("doc.set", {"name": "herdr-app"})
        self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()
