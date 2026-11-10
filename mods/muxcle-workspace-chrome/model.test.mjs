import assert from "node:assert/strict";
import test from "node:test";
import {
  capturePaneTarget,
  formatLocalClock,
  paneAction,
  panePresentation,
  roleFor,
} from "../../.build/mods/muxcle-workspace-chrome/model.js";

function pane(overrides = {}) {
  return {
    pane: "machine/pane-1",
    terminal: "machine/terminal-1",
    mod: undefined,
    tab: "machine/tab-1",
    title: "Terminal",
    cwd: "/Users/example/project",
    branch: "feature/pane-work",
    status: "working",
    app: null,
    program: { name: "zsh", icon: null, tint: false, agent: false, shell: true },
    focused: true,
    zoomed: false,
    movable: true,
    ...overrides,
  };
}

test("only pane-footer and status-clock roles are supported", () => {
  assert.equal(roleFor("pane-footer"), "pane-footer");
  assert.equal(roleFor("status-clock"), "status-clock");
  assert.equal(roleFor("other"), null);
});

test("local clock uses an injected local date and an explicit English format", () => {
  const date = new Date(2026, 0, 9, 14, 5, 42);
  assert.equal(formatLocalClock(date), "14:05 Fri 09-Jan-26");
});

test("pane presentation prefers the pane branch over a conflicting workspace branch", () => {
  const result = panePresentation(
    pane({ branch: "pane-branch" }),
    { machine: null, branch: "workspace-branch" },
    "/Users/example",
  );

  assert.equal(result.branch, "pane-branch");
  assert.equal(result.folder, "~/project");
  assert.equal(result.title, "zsh");
});

test("pane presentation does not fall back to the workspace branch when pane branch is absent", () => {
  const result = panePresentation(
    pane({ branch: null }),
    { machine: null, branch: "workspace-branch" },
    "/Users/example",
  );

  assert.equal(result.branch, null);
});

test("only known local folders use the local home abbreviation", () => {
  const target = pane({ cwd: "/Users/example/work" });
  assert.equal(panePresentation(target, { machine: null }, "/Users/example").folder, "~/work");
  assert.equal(panePresentation(target, { machine: "build-box" }, "/Users/example").folder, "/Users/example/work");
  assert.equal(panePresentation(target, undefined, "/Users/example").folder, "/Users/example/work");
});

test("pane actions preserve exact native command targets and do not bypass close behavior", () => {
  const current = pane();
  const target = capturePaneTarget(current);

  assert.deepEqual(paneAction("focus", target, [current]), {
    command: "pane.focus",
    args: { pane: current.pane },
  });
  assert.deepEqual(paneAction("split-right", target, [current]), {
    command: "pane.split",
    args: { direction: "right", pane: current.pane },
  });
  assert.deepEqual(paneAction("split-down", target, [current]), {
    command: "pane.split",
    args: { direction: "down", pane: current.pane },
  });
  assert.deepEqual(paneAction("zoom", target, [current]), {
    command: "pane.zoom",
    args: { pane: current.pane },
  });
  assert.deepEqual(paneAction("close", target, [current]), {
    command: "pane.close",
    args: { pane: current.pane },
  });
});

test("pane actions refuse removed, reparented, or remapped native targets", () => {
  const captured = capturePaneTarget(pane());

  assert.equal(paneAction("focus", captured, []), null);
  assert.equal(paneAction("close", captured, [pane({ tab: "machine/other-tab" })]), null);
  assert.equal(paneAction("zoom", captured, [pane({ terminal: "machine/other-terminal" })]), null);
  assert.equal(paneAction("split-right", captured, [pane({ mod: "different-mod" })]), null);
  assert.equal(paneAction("focus", captured, [pane(), pane()]), null);
});

test("pane actions refuse incomplete targets and unknown actions", () => {
  assert.equal(capturePaneTarget({ pane: "", tab: "tab", terminal: null }), null);
  assert.equal(paneAction("focus", null, [pane()]), null);
  assert.equal(paneAction("execute-shell", capturePaneTarget(pane()), [pane()]), null);
});
