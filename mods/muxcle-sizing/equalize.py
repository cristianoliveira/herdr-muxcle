#!/usr/bin/env python3
"""Equalize every split in one explicitly scoped Herdr tab."""

import copy
import json
import math
import subprocess
import sys

MAX_PANES = 64
MAX_INPUT_BYTES = 96 * 1024
MAX_DOCUMENT_BYTES = 1024 * 1024
MAX_RESPONSE_BYTES = 2 * MAX_DOCUMENT_BYTES
MAX_NODES = 512
MAX_DEPTH = 32


def normalize_context(value):
    if not isinstance(value, dict):
        raise ValueError("Equalizing needs an explicit tab context.")
    machine = value.get("machine")
    if machine is not None and (
        not isinstance(machine, str) or not machine or len(machine) > 256 or "/" in machine or "\0" in machine
    ):
        raise ValueError("Invalid sizing machine.")
    prefix = machine + "/" if machine else ""

    def local_id(raw):
        if not isinstance(raw, str) or not raw or len(raw) > 512 or "\0" in raw:
            raise ValueError("Invalid sizing identity.")
        if prefix and not raw.startswith(prefix):
            raise ValueError("Sizing identities belong to different machines.")
        result = raw[len(prefix):]
        if not result or "/" in result:
            raise ValueError("Invalid machine-qualified sizing identity.")
        return result

    panes = value.get("panes")
    terminals = value.get("terminals")
    if (
        not isinstance(panes, list)
        or not 1 <= len(panes) <= MAX_PANES
        or not isinstance(terminals, list)
        or len(terminals) != len(panes)
    ):
        raise ValueError("Equalizing supports at most 64 explicit terminal panes.")
    result = {
        "space": local_id(value.get("space")),
        "tab": local_id(value.get("tab")),
        "pane": local_id(value.get("pane")),
        "panes": [local_id(item) for item in panes],
        "terminals": [local_id(item) for item in terminals],
        "machine": machine,
    }
    if (
        len(set(result["panes"])) != len(result["panes"])
        or len(set(result["terminals"])) != len(result["terminals"])
        or result["pane"] not in result["panes"]
    ):
        raise ValueError("Sizing pane identities are inconsistent.")
    return result


def equalize_document(value, context):
    if not isinstance(context, dict):
        raise ValueError("Invalid sizing context.")
    panes = context.get("panes")
    terminals = context.get("terminals")
    if (
        not isinstance(panes, list)
        or not 1 <= len(panes) <= MAX_PANES
        or not all(isinstance(pane, str) and pane for pane in panes)
        or not isinstance(terminals, list)
        or len(terminals) != len(panes)
        or not all(isinstance(terminal, str) and terminal for terminal in terminals)
        or len(set(panes)) != len(panes)
        or len(set(terminals)) != len(terminals)
        or context.get("pane") not in panes
    ):
        raise ValueError("Sizing pane identities are inconsistent.")
    if not isinstance(value, dict) or not isinstance(value.get("spaces"), list):
        raise ValueError("Unsupported Herdr document.")
    json_bytes(value)

    spaces = [space for space in value["spaces"] if isinstance(space, dict) and space.get("id") == context["space"]]
    if len(spaces) != 1 or not isinstance(spaces[0].get("tabs"), list):
        raise ValueError("The original space is no longer available.")
    tabs = [tab for tab in spaces[0]["tabs"] if isinstance(tab, dict) and tab.get("id") == context["tab"]]
    if len(tabs) != 1:
        raise ValueError("The original tab is no longer available.")

    visited = 0
    leaves = []

    def inspect(node, depth=0):
        nonlocal visited
        visited += 1
        if visited > MAX_NODES or depth > MAX_DEPTH:
            raise ValueError("Pane layout exceeds the safe equalizing bounds.")
        if not isinstance(node, dict) or node.get("hidden"):
            raise ValueError("Hidden or unsupported pane layout; no sizing change was sent.")

        kind = node.get("type")
        if kind in ("row", "column"):
            children = node.get("children")
            if not isinstance(children, list) or not children:
                raise ValueError("Unsupported pane container; no sizing change was sent.")
            for child in children:
                inspect(child, depth + 1)
            return

        content = node.get("content")
        if (
            kind != "block"
            or not isinstance(node.get("id"), str)
            or not node["id"]
            or not isinstance(content, dict)
            or not isinstance(content.get("terminal"), str)
            or not content["terminal"]
            or content.get("mod") is not None
            or "children" in node
        ):
            raise ValueError("Equalizing requires ordinary terminal panes; no sizing change was sent.")
        leaves.append(node)

    inspect(tabs[0].get("root"))
    if (
        [node["id"] for node in leaves] != context["panes"]
        or [node["content"]["terminal"] for node in leaves] != context["terminals"]
    ):
        raise ValueError("Pane order or terminal identity changed; no sizing write was sent.")

    result = copy.deepcopy(value)
    result_tab = next(
        tab
        for space in result["spaces"]
        if isinstance(space, dict) and space.get("id") == context["space"]
        for tab in space["tabs"]
        if isinstance(tab, dict) and tab.get("id") == context["tab"]
    )
    changed_splits = equalize_splits(result_tab["root"])
    return result, changed_splits


def node_share(node):
    if "size" not in node:
        return "weight", 1
    size = node["size"]
    if not isinstance(size, dict):
        raise ValueError("Unknown pane sizing semantics; no sizing change was sent.")
    if "px" in size:
        if set(size) != {"px"}:
            raise ValueError("Ambiguous pixel and weighted sizing; no sizing change was sent.")
        value = size["px"]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError("Invalid fixed-pixel pane size; no sizing change was sent.")
        return "px", value
    if set(size) != {"weight"}:
        raise ValueError("Unknown pane sizing semantics; no sizing change was sent.")
    weight = size["weight"]
    if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not math.isfinite(weight) or weight <= 0:
        raise ValueError("Invalid pane weight; no sizing change was sent.")
    return "weight", weight


def can_resize(node):
    if "min" in node or "max" in node or node.get("resizable") is False:
        raise ValueError("Pane constraints prevent safe equalizing; no sizing change was sent.")
    if "resizable" in node and not isinstance(node["resizable"], bool):
        raise ValueError("Unknown pane resize constraint; no sizing change was sent.")


def set_equal_weight(node):
    size = node.get("size")
    if size is None:
        node["size"] = {"weight": 1}
    else:
        node["size"] = {**size, "weight": 1}


def equalize_splits(node, depth=0, counter=None):
    if counter is None:
        counter = [0]
    counter[0] += 1
    if counter[0] > MAX_NODES or depth > MAX_DEPTH:
        raise ValueError("Pane layout exceeds the safe equalizing bounds.")
    if node.get("type") not in ("row", "column"):
        return 0

    children = node["children"]
    changed = 0
    if len(children) > 1:
        shares = [node_share(child) for child in children]
        unit = shares[0][0]
        equal = all(
            other_unit == unit and math.isclose(value, shares[0][1], rel_tol=1e-9, abs_tol=1e-9)
            for other_unit, value in shares[1:]
        )
        if not equal:
            if unit != "weight" or any(other_unit != "weight" for other_unit, _ in shares):
                raise ValueError("Fixed-pixel sizing prevents safe equalizing; no sizing change was sent.")
            for child in children:
                can_resize(child)
            for child in children:
                set_equal_weight(child)
            changed += 1
    for child in children:
        changed += equalize_splits(child, depth + 1, counter)
    return changed


def json_bytes(value):
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    if len(raw) > MAX_DOCUMENT_BYTES:
        raise ValueError("Herdr document exceeds the core's 1 MiB limit.")
    return raw


def equalize(raw_context, request=None):
    scope = normalize_context(raw_context)
    request = request or rpc
    params = {"name": "herdr-app"}
    if scope["machine"]:
        params["on"] = scope["machine"]
    current = request("doc.get", params)
    if (
        not isinstance(current, dict)
        or type(current.get("version")) is not int
        or not 0 <= current["version"] < (1 << 64) - 1
    ):
        raise ValueError("Core returned an invalid document version.")

    value, changed = equalize_document(current.get("value"), scope)
    if changed:
        json_bytes(value)
        acknowledged = request("doc.set", {**params, "value": value, "version": current["version"]})
        if (
            not isinstance(acknowledged, dict)
            or type(acknowledged.get("version")) is not int
            or acknowledged["version"] != current["version"] + 1
        ):
            raise RuntimeError("Could not confirm the write; outcome is uncertain. Inspect pane sizes before repeating.")
    return {"changed": changed > 0, "splits": changed}


def rpc(method, params):
    messages = [
        {"jsonrpc": "2.0", "id": 0, "method": "hello", "params": {"generation": 1, "framed": False}},
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
    ]
    suffix = "Write outcome is uncertain; inspect pane sizes before repeating." if method == "doc.set" else "No sizing write was sent."
    try:
        process = subprocess.run(
            ["hc", "connect"],
            input="".join(
                json.dumps(message, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n"
                for message in messages
            ),
            text=True,
            encoding="utf-8",
            capture_output=True,
            timeout=5,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Core {method} timed out. {suffix}") from None
    if process.returncode or len(process.stdout.encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise RuntimeError(f"Core {method} could not be confirmed. {suffix}")

    for line in process.stdout.splitlines():
        try:
            response = json.loads(line)
        except ValueError:
            raise RuntimeError(f"Core returned invalid JSON. {suffix}") from None
        if not isinstance(response, dict):
            raise RuntimeError(f"Core returned an invalid response. {suffix}")
        if type(response.get("id")) is not int or response["id"] not in (0, 1):
            continue
        if response.get("id") == 0:
            if "error" in response:
                raise RuntimeError(f"Core handshake failed. {suffix}")
            continue
        if "error" in response:
            error = response["error"]
            data = error.get("data") if isinstance(error, dict) else None
            if isinstance(data, dict) and data.get("kind") == "conflict":
                raise RuntimeError("Layout conflict: the document changed; no equalize write applied.")
            raise RuntimeError(f"Core rejected {method}. {suffix}")
        if isinstance(response.get("result"), dict):
            return response["result"]
    raise RuntimeError(f"Core returned no result. {suffix}")


def main(arguments):
    if len(arguments) != 1:
        print("Equalizing requires one bounded JSON context.", file=sys.stderr)
        return 1
    try:
        if len(arguments[0].encode("utf-8")) > MAX_INPUT_BYTES:
            raise ValueError("Equalizing requires one bounded JSON context.")
        result = equalize(json.loads(arguments[0]))
        print(json.dumps(result, separators=(",", ":")))
        return 0
    except (UnicodeError, ValueError, RuntimeError, OSError, RecursionError) as error:
        print(str(error)[:512], file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
