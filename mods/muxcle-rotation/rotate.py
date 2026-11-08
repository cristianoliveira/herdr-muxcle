#!/usr/bin/env python3
"""Rotate one tab through a scoped compare-and-set core document update."""

import copy
import json
import subprocess
import sys

MAX_PANES = 64
MAX_INPUT_BYTES = 96 * 1024
MAX_DOCUMENT_BYTES = 1024 * 1024
GEOMETRY = ("size", "min", "max", "resizable")


def normalize_context(value):
    if not isinstance(value, dict):
        raise ValueError("Rotation needs an explicit tab context.")
    machine = value.get("machine")
    if machine is not None and (not isinstance(machine, str) or not machine or len(machine) > 256 or "/" in machine or "\0" in machine):
        raise ValueError("Invalid rotation machine.")
    prefix = machine + "/" if machine else ""

    def local_id(raw):
        if not isinstance(raw, str) or not raw or len(raw) > 512 or "\0" in raw:
            raise ValueError("Invalid rotation identity.")
        if prefix and not raw.startswith(prefix):
            raise ValueError("Rotation identities belong to different machines.")
        result = raw[len(prefix):]
        if not result or "/" in result:
            raise ValueError("Invalid machine-qualified rotation identity.")
        return result

    panes = value.get("panes")
    terminals = value.get("terminals")
    if (not isinstance(panes, list) or not 1 <= len(panes) <= MAX_PANES
            or not isinstance(terminals, list) or len(terminals) != len(panes)):
        raise ValueError("Rotation supports at most 64 explicit terminal panes.")
    result = {"space": local_id(value.get("space")), "tab": local_id(value.get("tab")),
              "pane": local_id(value.get("pane")), "panes": [local_id(item) for item in panes],
              "terminals": [local_id(item) for item in terminals], "machine": machine}
    if len(set(result["panes"])) != len(result["panes"]) or result["pane"] not in result["panes"]:
        raise ValueError("Rotation pane identities are inconsistent.")
    return result


def rotate_document(value, context):
    if not isinstance(value, dict) or not isinstance(value.get("spaces"), list):
        raise ValueError("Unsupported Herdr document.")
    json_bytes(value)
    spaces = [space for space in value["spaces"] if isinstance(space, dict) and space.get("id") == context["space"]]
    if len(spaces) != 1 or not isinstance(spaces[0].get("tabs"), list):
        raise ValueError("The original space is no longer available.")
    tabs = [tab for tab in spaces[0]["tabs"] if isinstance(tab, dict) and tab.get("id") == context["tab"]]
    if len(tabs) != 1:
        raise ValueError("The original tab is no longer available.")

    root = tabs[0].get("root")
    visited = 0

    def leaves(node, depth=0):
        nonlocal visited
        visited += 1
        if visited > 512 or depth > 32 or not isinstance(node, dict) or node.get("hidden"):
            raise ValueError("Unsupported or hidden pane layout.")
        if node.get("type") in ("row", "column"):
            children = node.get("children")
            if not isinstance(children, list) or not children:
                raise ValueError("Unsupported pane container.")
            return [leaf for child in children for leaf in leaves(child, depth + 1)]
        content = node.get("content")
        if (node.get("type") != "block" or not isinstance(node.get("id"), str)
                or not isinstance(content, dict) or not isinstance(content.get("terminal"), str)
                or not content["terminal"] or content.get("mod") is not None or "children" in node):
            raise ValueError("Rotation requires ordinary terminal panes.")
        return [node]

    original_leaves = leaves(root)
    if ([node["id"] for node in original_leaves] != context["panes"]
            or [node["content"]["terminal"] for node in original_leaves] != context["terminals"]):
        raise ValueError("Pane order or terminal identity changed; no write was sent.")

    result = copy.deepcopy(value)
    result_tab = next(tab for space in result["spaces"] if isinstance(space, dict) and space.get("id") == context["space"]
                      for tab in space["tabs"] if isinstance(tab, dict) and tab.get("id") == context["tab"])
    visited = 0
    targets = leaves(result_tab["root"])
    payloads = copy.deepcopy(targets)
    position = context["panes"].index(context["pane"])
    for index, slot in enumerate(targets):
        geometry = {key: slot[key] for key in GEOMETRY if key in slot}
        incoming = payloads[(index - 1) % len(payloads)]
        for key in GEOMETRY:
            incoming.pop(key, None)
        incoming.update(geometry)
        slot.clear()
        slot.update(incoming)
    return result, targets[position]["id"]


def json_bytes(value):
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    if len(raw) > MAX_DOCUMENT_BYTES:
        raise ValueError("Herdr document exceeds the core's 1 MiB limit.")
    return raw


def rotate(raw_context, request=None):
    scope = normalize_context(raw_context)
    request = request or rpc
    params = {"name": "herdr-app"}
    if scope["machine"]:
        params["on"] = scope["machine"]
    current = request("doc.get", params)
    if (not isinstance(current, dict) or type(current.get("version")) is not int
            or not 0 <= current["version"] < (1 << 64) - 1):
        raise ValueError("Core returned an invalid document version.")
    value, target = rotate_document(current.get("value"), scope)
    changed = len(scope["panes"]) > 1
    if changed:
        json_bytes(value)
        acknowledged = request("doc.set", {**params, "value": value, "version": current["version"]})
        if (not isinstance(acknowledged, dict) or type(acknowledged.get("version")) is not int
                or acknowledged["version"] != current["version"] + 1):
            raise RuntimeError("Could not confirm the write; outcome is uncertain. Inspect panes before repeating.")
    prefix = scope["machine"] + "/" if scope["machine"] else ""
    return {"changed": changed, "pane": prefix + target}


def rpc(method, params):
    messages = [{"jsonrpc": "2.0", "id": 0, "method": "hello", "params": {"generation": 1, "framed": False}},
                {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}]
    suffix = "Write outcome is uncertain; inspect panes before repeating." if method == "doc.set" else "No rotation write was sent."
    try:
        process = subprocess.run(["hc", "connect"], input="".join(json.dumps(message, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n" for message in messages),
                                 text=True, encoding="utf-8", capture_output=True, timeout=5)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Core {method} timed out. {suffix}") from None
    if process.returncode or len(process.stdout.encode("utf-8")) > 2 * MAX_DOCUMENT_BYTES:
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
        if "error" in response:
            error = response["error"]
            data = error.get("data") if isinstance(error, dict) else None
            if isinstance(data, dict) and data.get("kind") == "conflict":
                raise RuntimeError("Layout conflict: the document changed; no rotation write applied.")
            raise RuntimeError(f"Core rejected {method}. {suffix}")
        if response.get("id") == 1 and isinstance(response.get("result"), dict):
            return response["result"]
    raise RuntimeError(f"Core returned no result. {suffix}")


def main(arguments):
    if len(arguments) != 1 or len(arguments[0].encode("utf-8")) > MAX_INPUT_BYTES:
        print("Rotation requires one bounded JSON context.", file=sys.stderr)
        return 1
    try:
        result = rotate(json.loads(arguments[0]))
        print(json.dumps(result))
        return 0
    except (ValueError, RuntimeError, OSError, RecursionError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
