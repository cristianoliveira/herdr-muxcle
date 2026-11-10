import assert from "node:assert/strict";
import test from "node:test";
import {
  capturePaneTarget,
  formatLocalClock,
  modeFor,
  panelAction,
  panelState,
  paneAction,
  panePresentation,
  roleFor,
  tabAction,
  tabLabel,
  tabMove,
  windowControlsAllowed,
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

test("pane, clock, bar, and tab-picker roles are explicit", () => {
  assert.equal(roleFor("pane-footer"), "pane-footer");
  assert.equal(roleFor("status-clock"), "status-clock");
  assert.equal(roleFor("workspace-bar"), "workspace-bar");
  assert.equal(roleFor("tab-picker"), "tab-picker");
  assert.equal(roleFor("tab-actions"), "tab-actions");
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

test("bar modes are explicit and custom tab labels honor native named metadata", () => {
  assert.equal(modeFor("tabs"), "tabs");
  assert.equal(modeFor("panels"), "panels");
  assert.equal(modeFor("combined"), "combined");
  assert.equal(modeFor("unknown"), null);
  assert.equal(tabLabel({ name: "tb123", named: true }, "Agent"), "tb123");
  assert.equal(tabLabel({ name: "2", named: false }, "Agent"), "Agent");
  assert.equal(tabLabel({ name: "3", named: false }, null), "3");
});

test("tab select and close require the captured tab to remain in its exact space", () => {
  const spaces = [{ id: "host/project", active: true, tabs: [{ id: "host/tab-1" }, { id: "host/tab-2" }] }];
  const target = { space: "host/project", tab: "host/tab-2" };
  assert.deepEqual(tabAction("select", target, spaces), {
    command: "tab.select",
    args: { id: "host/tab-2" },
  });
  assert.deepEqual(tabAction("close", target, spaces), {
    command: "tab.close",
    args: { id: "host/tab-2" },
  });
  assert.deepEqual(tabAction("select", target, [{ ...spaces[0], tabs: [{ id: "host/tab-2", active: true }] }]), {
    command: "tab.select",
    args: { id: "host/tab-2" },
  });
  assert.equal(tabAction("select", target, []), null);
  assert.equal(tabAction("close", target, [{ ...spaces[0], id: "host/other" }]), null);
  assert.equal(
    tabAction("close", target, [{ ...spaces[0], tabs: [{ id: "host/tab-2" }, { id: "host/tab-2" }] }]),
    null,
  );
  assert.equal(
    tabAction("close", target, [...spaces, { id: "host/other", active: false, tabs: [{ id: "host/tab-2" }] }]),
    null,
  );
});

test("tab move resolves exact captured IDs to a fresh one-based native destination", () => {
  const initial = [{ id: "host/project", active: true, tabs: [{ id: "host/a" }, { id: "host/b" }, { id: "host/c" }] }];
  const source = { space: "host/project", tab: "host/a" };
  const destination = { space: "host/project", tab: "host/c" };
  const fresh = [{ id: "host/project", active: true, tabs: [{ id: "host/c" }, { id: "host/a" }, { id: "host/b" }] }];

  assert.deepEqual(tabMove(source, destination, fresh), {
    command: "tab.move",
    args: { id: "host/a", index: 1 },
  });
  assert.equal(tabMove(source, { ...destination, tab: "host/gone" }, initial), null);
  assert.equal(tabMove(source, { ...destination, space: "host/other" }, initial), null);
  assert.equal(tabMove(source, source, initial), null);
  assert.equal(tabMove(source, destination, [{ ...initial[0], active: false }]), null);
});

function panelLayout(overrides = {}) {
  return {
    id: "root",
    type: "row",
    children: [
      {
        id: "panel",
        type: "column",
        hidden: false,
        children: [
          {
            id: "panel-body",
            type: "stack",
            active: "missing",
            children: [
              { id: "files", type: "block" },
              { id: "changes", type: "block" },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

const panelTarget = { panel: "panel", stack: "panel-body", child: "files" };

test("panel status uses active-if-visible then first-visible fallback and checks ancestry", () => {
  assert.deepEqual(panelState(panelLayout(), panelTarget), {
    available: true,
    visible: true,
    activeChild: "files",
  });
  const hiddenActive = panelLayout();
  hiddenActive.children[0].children[0].active = "changes";
  hiddenActive.children[0].children[0].children[1].hidden = true;
  assert.equal(panelState(hiddenActive, panelTarget).activeChild, "files");
  const hiddenParent = {
    ...panelLayout(),
    children: [{ id: "workspace-root", type: "row", hidden: true, children: panelLayout().children }],
  };
  assert.equal(panelState(hiddenParent, panelTarget).available, false);
  const hiddenStackParent = panelLayout();
  hiddenStackParent.children[0].children = [
    { id: "hidden-stack-parent", type: "row", hidden: true, children: hiddenStackParent.children[0].children },
  ];
  assert.equal(panelState(hiddenStackParent, panelTarget).available, false);
  const hiddenPanel = panelLayout();
  hiddenPanel.children[0].hidden = true;
  assert.equal(panelState(hiddenPanel, panelTarget).available, true);
  assert.equal(panelState(hiddenPanel, panelTarget).visible, false);
  assert.equal(panelState(panelLayout({ children: [] }), panelTarget).available, false);
  assert.equal(
    panelState(
      panelLayout({
        children: [{ id: "panel", type: "column", children: [{ id: "other", children: [{ id: "files" }] }] }],
      }),
      panelTarget,
    ).available,
    false,
  );
});

test("ancestor stacks expose only their active-visible or first-visible branch", () => {
  const layout = {
    id: "root",
    type: "row",
    children: [
      {
        id: "workspace-stack",
        type: "stack",
        active: "other-workspace",
        children: [
          { id: "target-workspace", type: "column", children: panelLayout().children },
          { id: "other-workspace", type: "column" },
        ],
      },
    ],
  };

  assert.deepEqual(panelState(layout, panelTarget), {
    available: false,
    visible: false,
    activeChild: "files",
  });
  assert.equal(panelAction(panelTarget, layout), null);

  layout.children[0].active = "missing";
  assert.equal(panelState(layout, panelTarget).available, true);
  assert.equal(panelState(layout, panelTarget).visible, true);

  layout.children[0].active = "other-workspace";
  layout.children[0].children[1].hidden = true;
  assert.equal(panelState(layout, panelTarget).available, true);
  assert.equal(panelState(layout, panelTarget).visible, true);

  const nested = panelLayout();
  const panel = nested.children[0];
  const body = panel.children[0];
  panel.children = [
    {
      id: "panel-layout-stack",
      type: "stack",
      active: "side-view",
      children: [
        { id: "target-view", type: "row", children: [body] },
        { id: "side-view", type: "row" },
      ],
    },
  ];
  assert.equal(panelState(nested, panelTarget).available, false);
  panel.children[0].active = "missing";
  assert.equal(panelState(nested, panelTarget).available, true);
  panel.children[0].active = "side-view";
  panel.children[0].children[1].hidden = true;
  assert.equal(panelState(nested, panelTarget).available, true);
});

test("configured panel IDs resolve only direct children of the exact current stack", () => {
  const layout = {
    id: "root",
    type: "row",
    children: [
      {
        id: "dock",
        type: "row",
        children: [
          {
            id: "dock-stack",
            type: "stack",
            active: "tree-view",
            children: [
              { id: "tree-view", type: "block" },
              { id: "diff-view", type: "block" },
            ],
          },
        ],
      },
    ],
  };
  const targets = { panel: "dock", stack: "dock-stack", child: "diff-view" };
  assert.deepEqual(panelState(layout, targets), {
    available: true,
    visible: true,
    activeChild: "tree-view",
  });
  assert.equal(
    panelAction(
      { ...targets, child: "nested-diff" },
      {
        ...layout,
        children: [
          {
            ...layout.children[0],
            children: [
              {
                id: "dock-stack",
                type: "stack",
                children: [{ id: "wrapper", type: "column", children: [{ id: "nested-diff", type: "block" }] }],
              },
            ],
          },
        ],
      },
    ),
    null,
  );
});

test("panel actions select and show or hide the verified exact native targets", () => {
  const otherSelected = panelLayout();
  otherSelected.children[0].children[0].active = "changes";
  assert.deepEqual(panelAction(panelTarget, otherSelected), [
    { command: "layout.select", args: { stack: "panel-body", child: "files" } },
    { command: "layout.show", args: { id: "panel" } },
  ]);

  const selected = panelLayout();
  selected.children[0].children[0].active = "files";
  assert.deepEqual(panelAction(panelTarget, selected), [{ command: "layout.hide", args: { id: "panel" } }]);

  assert.equal(panelAction({ ...panelTarget, child: "unknown" }, panelLayout()), null);
  assert.equal(panelAction(panelTarget, panelLayout({ children: [] })), null);
});

test("window controls follow native metadata unless omission is explicit", () => {
  assert.equal(windowControlsAllowed({ buttons: true }, undefined), true);
  assert.equal(windowControlsAllowed({ buttons: false }, undefined), false);
  assert.equal(windowControlsAllowed({ buttons: true }, "omit"), false);
  assert.equal(windowControlsAllowed(null, undefined), false);
});
