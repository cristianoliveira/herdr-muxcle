"""Native IPC scenarios. No pointer or keyboard injection on the user's display."""
import copy
import json
import struct
import time

from vision import normalize_text


class ScenarioFailure(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise ScenarioFailure(message)


def fixture_invocation_matches(actual, expected):
    if not isinstance(actual, list) or not isinstance(expected, list) or not expected:
        return False
    # Herdr runs supplied argv inside its login-shell startup envelope.
    wrapped = ["/bin/sh", "-lic", '"$@"; exec "$0" -li', "/bin/sh", *expected]
    return actual == expected or actual == wrapped


def leaves(node):
    if node["type"] == "block":
        return [node]
    return [leaf for child in node["children"] for leaf in leaves(child)]


def tab_in(document, space_id, tab_id):
    return next(tab for space in document["value"]["spaces"] if space["id"] == space_id
                for tab in space["tabs"] if tab["id"] == tab_id)


def f32(value):
    return struct.unpack("f", struct.pack("f", value))[0]


class Scenarios:
    def __init__(self, session, observer):
        self.session = session
        self.observer = observer
        self.state = {}
        self.actions = []
        self.capture_index = 0

    def command(self, name, arguments=None):
        result = self.session.command(name, arguments)
        self.actions.append({"command": name, "arguments": copy.deepcopy(arguments or {}), "result": copy.deepcopy(result)})
        self.save_actions()
        if name in {"space.new", "tab.new", "pane.split"}:
            address = result.get("terminal") if isinstance(result, dict) else None
            require(isinstance(address, str), name + " did not identify its created terminal")
            terminal = self.terminal(address)
            identity = {key: terminal[key] for key in ("created_ms", "argv") if key in terminal}
            self.session.track_terminal(address, identity)
            self.actions[-1]["terminal_identity"] = identity
            self.save_actions()
            actual = terminal.get("argv")
            expected = (arguments or {}).get("argv")
            require(fixture_invocation_matches(actual, expected),
                    "Native app did not launch the requested harmless fixture: " + repr(actual))
        return result

    def save_actions(self):
        (self.session.artifacts / "actions.json").write_text(json.dumps(self.actions, indent=2) + "\n")

    def checkpoint(self, name):
        self.session.snapshot(name)
        self.session.screenshot(name)

    def visible(self, name, needles, timeout=15):
        deadline = time.monotonic() + timeout
        missing = needles
        while time.monotonic() < deadline:
            self.capture_index += 1
            capture = f"{name}-{self.capture_index:03d}"
            image = self.session.screenshot(capture)
            lines = self.observer.read(image)
            (self.session.artifacts / f"{capture}-text.json").write_text(json.dumps(lines, indent=2) + "\n")
            text = normalize_text(" ".join(lines))
            missing = [needle for needle in needles if normalize_text(needle) not in text]
            if not missing:
                self.session.snapshot(name)
                return
        raise ScenarioFailure(f"Expected visible text was missing: {missing}; inspect {name} captures")

    def sizing_command(self, operation):
        # A fresh toast acknowledges controller completion; old notices must not satisfy it.
        self.session.wait_status(lambda view: "toast" not in view["overlays"])
        return self.command("muxcle-sizing." + operation)

    def sizing_notice(self, name):
        self.session.wait_status(lambda view: "toast" in view["overlays"] and not view["errors"])
        self.checkpoint(name)

    def document(self):
        return self.session.core.document()

    def set_value(self, value):
        before = self.document()
        result = self.session.core.call("doc.set", {
            "name": "herdr-app", "version": before["version"], "value": value,
        })
        require(result["version"] == before["version"] + 1, "Fixture setup did not use one versioned write")
        document = self.session.core.wait(lambda doc: doc["value"] == value)
        # Settle native model synchronization after replacing fixture data.
        pane = self.session.app("status")["focused_pane"]
        if pane:
            self.command("pane.focus", {"pane": pane})
        return document

    def terminal(self, address):
        return self.session.core.call("terminal.get", {"terminal": address})

    def focused(self, pane):
        self.command("pane.focus", {"pane": pane})
        self.session.wait_status(lambda view: view["focused_pane"] == pane and not view["errors"])

    def selected(self, tab_id):
        self.command("tab.select", {"id": tab_id})
        self.session.wait_status(lambda view: view["tab"] == tab_id and not view["errors"])

    def wait_order(self, fixture, expected):
        def matches(_status):
            world = self.session.app("ls")
            tabs = [tab for space in world["spaces"] if space["id"] == fixture["space"]
                    for tab in space["tabs"] if tab["id"] == fixture["tab"]]
            return bool(tabs) and [item["terminal"] for item in tabs[0]["terminals"]] == expected
        self.session.wait_status(matches)

    def new_space(self, name, label):
        result = self.command("space.new", {
            "name": name, "tab": name + " tab", "folder": str(self.session.root),
            "argv": self.session.fixture_argv(label),
        })
        self.session.core.wait(lambda doc: any(space["id"] == result["space"] for space in doc["value"]["spaces"]))
        root = tab_in(self.document(), result["space"], result["tab"])["root"]
        result["pane"] = leaves(root)[0]["id"]
        self.session.wait_status(lambda view: view["space"] == result["space"] and view["tab"] == result["tab"])
        return result

    def create_pane_fixture(self):
        require(not self.session.app("ls")["spaces"], "Expected an empty isolated native world")
        fixture = self.new_space("Pane tools", "A")
        second = self.command("pane.split", {
            "direction": "right", "pane": fixture["pane"], "argv": self.session.fixture_argv("B"),
        })
        self.state.update(fixture=fixture, A={"pane": fixture["pane"], "terminal": fixture["terminal"]}, B=second)
        self.wait_order(fixture, [fixture["terminal"], second["terminal"]])
        self.session.wait_status(lambda _view: all(self.terminal(item["terminal"])["cols"] > 0
                                               for item in [self.state["A"], second]))
        self.checkpoint("01-two-panes")

    def rotate_two(self):
        fixture = self.state["fixture"]
        before = self.document()
        value = copy.deepcopy(before["value"])
        root = tab_in({"value": value}, fixture["space"], fixture["tab"])["root"]
        root["children"][0]["size"] = {"weight": 3.0}
        root["children"][1]["size"] = {"weight": 1.0}
        self.set_value(value)
        self.session.wait_status(lambda _view: self.terminal(self.state["A"]["terminal"])["cols"]
                              > self.terminal(self.state["B"]["terminal"])["cols"])
        self.focused(self.state["A"]["pane"])
        before = self.document()
        self.command("muxcle-rotation.rotate")
        after = self.session.core.wait(lambda doc: doc["version"] == before["version"] + 1)
        expected = copy.deepcopy(before["value"])
        expected_root = tab_in({"value": expected}, fixture["space"], fixture["tab"])["root"]
        first, second = expected_root["children"]
        expected_root["children"] = [second, first]
        second["size"], first["size"] = first["size"], second["size"]
        require(after["value"] == expected, "Two-pane rotation did not preserve screen-slot weights")
        self.wait_order(fixture, [self.state["B"]["terminal"], self.state["A"]["terminal"]])
        self.session.wait_status(lambda _view: self.terminal(self.state["A"]["terminal"])["cols"]
                              < self.terminal(self.state["B"]["terminal"])["cols"])
        self.session.wait_status(lambda view: view["focused_pane"] == self.state["B"]["pane"])
        self.checkpoint("02-native-rotation-settled")

    def create_nested_fixture(self):
        fixture = self.state["fixture"]
        value = copy.deepcopy(self.document()["value"])
        root = tab_in({"value": value}, fixture["space"], fixture["tab"])["root"]
        root["children"].sort(key=lambda leaf: leaf["id"] != self.state["A"]["pane"])
        for leaf, key in zip(root["children"], ["A", "B"]):
            leaf["content"] = {"terminal": self.state[key]["terminal"]}
            leaf["size"] = {"weight": 1.0}
        self.set_value(value)
        self.wait_order(fixture, [self.state["A"]["terminal"], self.state["B"]["terminal"]])
        third = self.command("pane.split", {
            "direction": "down", "pane": self.state["B"]["pane"], "argv": self.session.fixture_argv("C"),
        })
        self.state["C"] = third
        sentinel = self.command("tab.new", {
            "name": "Untouched sentinel", "argv": self.session.fixture_argv("sentinel"),
        })
        self.state["sentinel"] = sentinel
        self.selected(fixture["tab"])
        self.focused(self.state["B"]["pane"])
        value = copy.deepcopy(self.document()["value"])
        value["e2e_metadata"] = {"keep": ["opaque", 1]}
        root = tab_in({"value": value}, fixture["space"], fixture["tab"])["root"]
        require(root["type"] == "row" and root["children"][1]["type"] == "column", "Expected row/column fixture")
        root["e2e_metadata"] = {"keep": "container"}
        root["children"][0]["size"] = {"weight": 3.0}
        right = root["children"][1]
        right["size"] = {"weight": 1.0}
        right["children"][0]["size"] = {"weight": 1.0}
        right["children"][1]["size"] = {"weight": 3.0}
        tab_in({"value": value}, fixture["space"], sentinel["tab"])["e2e_metadata"] = "unrelated-tab"
        self.set_value(value)
        self.session.wait_status(lambda _view: self.terminal(self.state["B"]["terminal"])["rows"]
                              < self.terminal(self.state["C"]["terminal"])["rows"])
        self.checkpoint("03-nested-unequal")

    def equalize(self):
        fixture = self.state["fixture"]
        before = self.document()
        expected = copy.deepcopy(before["value"])
        root = tab_in({"value": expected}, fixture["space"], fixture["tab"])["root"]
        root["children"][0]["size"]["weight"] = 1.0
        root["children"][1]["children"][1]["size"]["weight"] = 1.0
        self.sizing_command("equalize")
        after = self.session.core.wait(lambda doc: doc["version"] == before["version"] + 1)
        require(after["value"] == expected, "Equalize changed more than the two flexible weights")
        self.session.wait_status(lambda _view: abs(self.terminal(self.state["A"]["terminal"])["cols"]
                              - self.terminal(self.state["B"]["terminal"])["cols"]) <= 1
                              and abs(self.terminal(self.state["B"]["terminal"])["rows"]
                              - self.terminal(self.state["C"]["terminal"])["rows"]) <= 1)
        self.sizing_notice("04-equalized")
        require(self.session.app("status")["focused_pane"] == self.state["B"]["pane"], "Equalize changed focus")

    def resize(self, operation):
        fixture = self.state["fixture"]
        before = self.document()
        old_geometry = self.terminal(self.state["B"]["terminal"])
        expected = copy.deepcopy(before["value"])
        root = tab_in({"value": expected}, fixture["space"], fixture["tab"])["root"]
        branch = root["children"][1]
        if operation.endswith("height"):
            branch = branch["children"][0]
        old = f32(branch["size"]["weight"])
        branch["size"]["weight"] = f32(old * f32(1.1) if operation.startswith("grow") else old / f32(1.1))
        self.sizing_command(operation)
        after = self.session.core.wait(lambda doc: doc["version"] == before["version"] + 1)
        require(after["value"] == expected, operation + " changed more than the nearest matching branch weight")
        axis = "cols" if operation.endswith("width") else "rows"
        sign = 1 if operation.startswith("grow") else -1
        self.session.wait_status(lambda _view: sign * (self.terminal(self.state["B"]["terminal"])[axis] - old_geometry[axis]) > 0)
        self.sizing_notice("05-" + operation)
        require(self.session.app("status")["focused_pane"] == self.state["B"]["pane"], operation + " changed focus")

    def refuse_constraint(self):
        fixture = self.state["fixture"]
        before = self.document()
        constrained = copy.deepcopy(before["value"])
        tab_in({"value": constrained}, fixture["space"], fixture["tab"])["root"]["children"][0]["min"] = 100
        self.set_value(constrained)
        baseline = self.document()
        self.sizing_command("grow-width")
        self.sizing_notice("06-constraint-refusal")
        require(self.document() == baseline, "A constrained resize wrote the document")
        self.set_value(before["value"])

    def refuse_zoom(self):
        self.command("pane.zoom", {"pane": self.state["B"]["pane"]})
        before = self.document()
        self.sizing_command("equalize")
        self.sizing_notice("07-zoom-refusal")
        require(self.document() == before, "Zoom refusal wrote the document")
        self.command("pane.zoom", {"pane": self.state["B"]["pane"]})

    def rotate_nested(self):
        fixture = self.state["fixture"]
        self.focused(self.state["A"]["pane"])
        before = self.document()
        expected = copy.deepcopy(before["value"])
        ordered = leaves(tab_in({"value": expected}, fixture["space"], fixture["tab"])["root"])
        payloads = copy.deepcopy(ordered)
        for leaf, payload in zip(ordered, payloads[-1:] + payloads[:-1]):
            size = copy.deepcopy(leaf["size"])
            leaf.clear()
            leaf.update(payload)
            leaf["size"] = size
        self.command("muxcle-rotation.rotate")
        after = self.session.core.wait(lambda doc: doc["version"] == before["version"] + 1)
        require(after["value"] == expected, "Nested rotation did not preserve slots, weights, or unrelated metadata")
        self.wait_order(fixture, [self.state[key]["terminal"] for key in ["C", "A", "B"]])
        self.session.wait_status(lambda _view: self.terminal(self.state["C"]["terminal"])["rows"]
                              > self.terminal(self.state["A"]["terminal"])["rows"])
        self.session.wait_status(lambda view: view["focused_pane"] == self.state["C"]["pane"])
        self.checkpoint("08-nested-rotation-settled")

    def sizing_help(self):
        before = self.document()
        focus = self.session.app("status")["focused_pane"]
        self.command("muxcle-sizing.help")
        self.session.wait_status(lambda view: "muxcle-sizing" in view["overlays"] and not view["errors"])
        commands = ["help", "equalize", "grow-width", "shrink-width", "grow-height", "shrink-height"]
        self.visible("09-sizing-help", ["muxcle-sizing." + name for name in commands] + ["Close", "Python 3", "hc"])
        require(self.document() == before, "Help changed the core document")
        self.command("overlay.close")
        self.session.wait_status(lambda view: "muxcle-sizing" not in view["overlays"] and view["focused_pane"] == focus)
        require(self.document() == before, "Dismissing help changed the core document")
        self.checkpoint("09-help-dismissed")

    def history(self):
        first = self.new_space("History garden", "history-one")
        self.checkpoint("10-history-first-tab")
        second = self.command("tab.new", {"name": "History second", "argv": self.session.fixture_argv("history-two")})
        self.session.wait_status(lambda view: view["tab"] == second["tab"])
        self.checkpoint("10-history-second-tab")
        self.command("muxcle-history.last-tab")
        self.session.wait_status(lambda view: view["tab"] == first["tab"])
        self.checkpoint("10-history-returned-first")
        self.command("muxcle-history.last-tab")
        self.session.wait_status(lambda view: view["tab"] == second["tab"])
        self.checkpoint("10-history-returned-second")
        other = self.new_space("Quiet orchard", "history-other-space")
        self.checkpoint("10-history-other-space")
        self.command("muxcle-history.last-space")
        self.session.wait_status(lambda view: view["space"] == first["space"] and view["tab"] == second["tab"])
        self.checkpoint("10-history-returned-space")
        self.command("muxcle-history.last-space")
        self.session.wait_status(lambda view: view["space"] == other["space"])
        self.checkpoint("10-history-toggled-space")

    def popup(self, name, needles):
        before = self.document()
        focus = self.session.app("status")["focused_pane"]
        self.command("mod.open", {"name": name})
        self.session.wait_status(lambda view: name in view["overlays"] and not view["errors"])
        self.visible("11-" + name, needles)
        require(self.document() == before, name + " mutated the document on open")
        self.command("overlay.close")
        self.session.wait_status(lambda view: name not in view["overlays"] and view["focused_pane"] == focus)
        require(self.document() == before, name + " mutated the document on dismiss")

    def picker(self):
        self.popup("muxcle-picker", ["Spaces and tabs", "History garden", "Quiet orchard", "5 results"])

    def sessionizer(self):
        projects = self.session.root / "projects"
        for name in ["ALPHA", "BRAVO"]:
            (projects / name).mkdir(parents=True)
        config = self.session.root / "app-home" / "data" / "muxcle-sessionizer" / "config.json"
        config.parent.mkdir(parents=True, exist_ok=True)
        config.write_text(json.dumps({"roots": [str(projects)]}) + "\n")
        self.popup("muxcle-sessionizer", ["Sessionizer", "ALPHA", "BRAVO", "2 projects"])

    def cases(self):
        return [
            ("create-pane-fixture", self.create_pane_fixture),
            ("rotate-two-native", self.rotate_two),
            ("create-nested-fixture", self.create_nested_fixture),
            ("equalize-recursive", self.equalize),
            *[(operation, lambda operation=operation: self.resize(operation)) for operation in
              ["grow-width", "grow-height", "shrink-height", "shrink-width"]],
            ("refuse-constrained-sizing", self.refuse_constraint),
            ("refuse-zoomed-sizing", self.refuse_zoom),
            ("rotate-nested-document", self.rotate_nested),
            ("help-visible-and-native-dismissal", self.sizing_help),
            ("history-tab-and-space-toggles", self.history),
            ("picker-popup-content-smoke", self.picker),
            ("sessionizer-discovery-popup-smoke", self.sessionizer),
        ]
