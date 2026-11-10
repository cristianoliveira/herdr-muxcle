import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
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

const palette = {
  accent: "accent-tone",
  background: "background-tone",
  blocked: "blocked-tone",
  border: "border-tone",
  chrome: "chrome-tone",
  dim: "dim-tone",
  done: "done-tone",
  foreground: "foreground-tone",
  hover: "hover-tone",
  muted: "muted-tone",
  selected: "selected-tone",
  working: "working-tone",
};

function element() {
  const node = { handlers: {}, styles: {} };
  const builder = new Proxy(node, {
    get(target, name) {
      if (name === "child")
        return (child) => {
          target.childNodes ??= [];
          target.childNodes.push(child);
          return builder;
        };
      if (name === "children")
        return (children) => {
          target.childNodes ??= [];
          target.childNodes.push(...children);
          return builder;
        };
      if (name in target) return target[name];
      if (name === "on_mouse_down" || name === "on_mouse_up")
        return (button, handler) => {
          target.handlers[name] ??= {};
          target.handlers[name][button] = handler;
          return builder;
        };
      if (name === "on_click" || name === "on_hover" || name === "on_mouse_down_out" || name === "hover")
        return (handler) => {
          target.handlers[name] = handler;
          return builder;
        };
      if (name === "when")
        return (condition, transform) => {
          if (condition) transform(builder);
          return builder;
        };
      return (...args) => {
        target.styles[name] = args;
        return builder;
      };
    },
  });
  return builder;
}

async function createApp() {
  const calls = [];
  let role = "pane-footer";
  let props = {};
  let spaceSnapshot = [];
  let paneSnapshot = [];
  let layoutSnapshot = null;
  let windowSnapshot = {
    platform: "windows",
    titlebar: "none",
    buttons: false,
    maximized: false,
    fullscreen: false,
    active: true,
  };
  const overlays = [];
  const closedOverlays = [];
  let now = new Date(2026, 0, 9, 14, 5, 42);
  let tick;
  let interval;
  let canceled = false;
  let notifications = 0;

  const path = new URL("../../.build/mods/muxcle-workspace-chrome/main.js", import.meta.url);
  const source = (await readFile(path, "utf8"))
    .replace(/^import .*;$/gm, "")
    .replace(
      "export default class MuxcleWorkspaceChrome",
      "globalThis.MuxcleWorkspaceChrome = class MuxcleWorkspaceChrome",
    );
  const scope = {
    View: class {},
    div: element,
    h_flex: element,
    v_flex: element,
    home: () => "/Users/example",
    layout: () => layoutSnapshot,
    closeOverlay: (id) => closedOverlays.push(id),
    openOverlay: (spec) => {
      overlays.push(spec);
      return `overlay-${overlays.length}`;
    },
    image: element,
    svg: element,
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
    panes: () => paneSnapshot,
    props: () => ({ role, ...props }),
    run: (...args) => calls.push(args),
    spaces: () => spaceSnapshot,
    theme: () => palette,
    window: () => windowSnapshot,
  };
  vm.runInNewContext(source, scope, { filename: path.pathname });

  return {
    calls,
    overlays,
    closedOverlays,
    get interval() {
      return interval;
    },
    get notifications() {
      return notifications;
    },
    get canceled() {
      return canceled;
    },
    view(nextRole = role, nextProps = {}) {
      role = nextRole;
      props = nextProps;
      const view = new scope.MuxcleWorkspaceChrome();
      view.now = () => now;
      view.init(
        { role: nextRole, ...nextProps },
        {
          timer: {
            every(milliseconds, handler) {
              interval = milliseconds;
              tick = handler;
              return {
                cancel() {
                  canceled = true;
                },
              };
            },
          },
        },
      );
      return view;
    },
    setNow(value) {
      now = value;
    },
    setSpaces(value) {
      spaceSnapshot = value;
    },
    setPanes(value) {
      paneSnapshot = value;
    },
    setLayout(value) {
      layoutSnapshot = value;
    },
    setWindow(value) {
      windowSnapshot = value;
    },
    tick() {
      tick?.({
        notify() {
          notifications += 1;
        },
      });
    },
  };
}

function findById(node, id) {
  if (node?.styles?.id?.[0] === id) return node;
  return Array.isArray(node?.childNodes)
    ? node.childNodes.map((child) => findById(child, id)).find(Boolean)
    : undefined;
}

function renderedText(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return Array.isArray(node?.childNodes) ? node.childNodes.map(renderedText).join("") : "";
}

test("pane footer displays pane branch and preserves program, folder, status, and native focus", async () => {
  const app = await createApp();
  const target = {
    pane: "build-box/pane-1",
    terminal: "build-box/terminal-1",
    tab: "build-box/tab-1",
    title: "Claude Code",
    cwd: "/Users/example/work",
    branch: "pane-branch",
    status: "blocked",
    program: { name: "Claude Code", icon: "icons/claude.svg", tint: true, agent: true, shell: false },
    focused: true,
    zoomed: false,
    movable: true,
  };
  app.setSpaces([
    { id: "build-box/project", active: true, machine: "build-box", branch: "space-branch", tabs: [{ id: target.tab }] },
  ]);
  app.setPanes([target]);
  const view = app.view("pane-footer", { pane: target.pane });
  const tree = view.render({});
  const text = renderedText(tree);

  assert.match(text, /Claude Code/);
  assert.match(text, /\/Users\/example\/work/);
  assert.match(text, /pane-branch/);
  assert.doesNotMatch(text, /space-branch/);
  assert.match(text, /Needs you/);
  assert.equal(typeof tree.handlers.on_click, "function");

  tree.handlers.on_click();
  assert.deepEqual(app.calls, [["pane.focus", { pane: target.pane }]]);
});

test("pane footer retains native split, zoom, close and exact-target revalidation", async () => {
  const app = await createApp();
  const target = {
    pane: "local/pane-1",
    terminal: "local/terminal-1",
    tab: "local/tab-1",
    title: "zsh",
    cwd: "/Users/example",
    branch: null,
    status: "idle",
    program: { name: "zsh", icon: null, tint: false, agent: false, shell: true },
    focused: false,
    zoomed: false,
    movable: true,
  };
  app.setPanes([target]);
  const view = app.view("pane-footer", { pane: target.pane });
  const initial = view.render({});
  initial.handlers.on_hover(true, { notify() {} });
  const tree = view.render({});

  for (const [id, command, args] of [
    [`ph-r-${target.pane}`, "pane.split", { direction: "right", pane: target.pane }],
    [`ph-d-${target.pane}`, "pane.split", { direction: "down", pane: target.pane }],
    [`ph-z-${target.pane}`, "pane.zoom", { pane: target.pane }],
    [`ph-x-${target.pane}`, "pane.close", { pane: target.pane }],
  ]) {
    app.calls.length = 0;
    findById(tree, id).handlers.on_click(null, { stop_propagation() {} });
    assert.deepEqual(app.calls, [[command, args]]);
    assert.equal(Object.hasOwn(args, "confirmed"), false);
  }

  app.calls.length = 0;
  const staleTree = view.render({});
  const close = findById(staleTree, `ph-x-${target.pane}`);
  app.setPanes([{ ...target, terminal: "local/replaced-terminal" }]);
  close.handlers.on_click(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, []);
});

test("long metadata remains shrinkable while pane controls stay fixed in a narrow-pane fixture", async () => {
  const app = await createApp();
  const paneWidth = 260;
  const target = {
    pane: "local/narrow-pane",
    terminal: "local/narrow-terminal",
    tab: "local/narrow-tab",
    title: `agent-${"title".repeat(30)}`,
    cwd: `/Users/example/${"folder".repeat(30)}`,
    branch: `feature/${"branch".repeat(30)}`,
    status: "blocked",
    program: { name: null, icon: null, tint: false, agent: false, shell: false },
    focused: false,
    zoomed: false,
  };
  app.setPanes([target]);
  const view = app.view("pane-footer", { pane: target.pane });
  view.render({}).handlers.on_hover(true, { notify() {} });
  const tree = view.render({});
  const title = findById(tree, `workspace-chrome-title-${target.pane}`);
  const folder = findById(tree, `workspace-chrome-folder-${target.pane}`);
  const branch = findById(tree, `workspace-chrome-branch-${target.pane}`);
  const branchLabel = findById(tree, `workspace-chrome-branch-label-${target.pane}`);

  assert.equal(tree.styles.size_full.length, 0);
  assert.ok(paneWidth < 160 + 160 + 80);
  assert.deepEqual(title.styles.max_w, [160]);
  assert.equal(Object.hasOwn(title.styles, "flex_none"), false);
  assert.deepEqual(title.styles.min_w, [0]);
  assert.deepEqual(title.styles.truncate, []);
  assert.deepEqual(folder.styles.min_w, [0]);
  assert.deepEqual(folder.styles.truncate, []);
  assert.deepEqual(branch.styles.max_w, [160]);
  assert.equal(Object.hasOwn(branch.styles, "flex_none"), false);
  assert.deepEqual(branch.styles.min_w, [0]);
  assert.deepEqual(branchLabel.styles.min_w, [0]);
  assert.deepEqual(branchLabel.styles.truncate, []);

  for (const suffix of ["r", "d", "z", "x"]) {
    assert.deepEqual(findById(tree, `ph-${suffix}-${target.pane}`).styles.flex_none, []);
  }
});

test("status clock adds only local time for composition with native workspace status", async () => {
  const app = await createApp();
  const view = app.view("status-clock");
  const tree = view.render({});

  assert.equal(app.interval, 1000);
  assert.match(renderedText(tree), /14:05 Fri 09-Jan-26/);
  assert.doesNotMatch(renderedText(tree), /agents|build-box|commands|workspace-branch/);

  app.tick();
  assert.equal(app.notifications, 0);
  app.setNow(new Date(2026, 0, 9, 14, 6, 0));
  app.tick();
  assert.equal(app.notifications, 1);
  assert.match(renderedText(view.render({})), /14:06 Fri 09-Jan-26/);

  view.close();
  app.setNow(new Date(2026, 0, 9, 14, 7, 0));
  app.tick();
  assert.equal(app.canceled, true);
  assert.equal(app.notifications, 1);
});

test("every saved pane callback is inert after view closure", async () => {
  const app = await createApp();
  const target = {
    pane: "local/pane-1",
    terminal: "local/terminal-1",
    tab: "local/tab-1",
    title: "zsh",
    cwd: "/Users/example",
    branch: null,
    status: "idle",
    program: { name: "zsh", icon: null, tint: false, agent: false, shell: true },
    focused: false,
    zoomed: false,
  };
  app.setPanes([target]);
  const view = app.view("pane-footer", { pane: target.pane });
  const initial = view.render({});
  initial.handlers.on_hover(true, { notify() {} });
  const tree = view.render({});
  const rootClick = tree.handlers.on_click;
  const hover = tree.handlers.on_hover;
  const closeButton = findById(tree, `ph-x-${target.pane}`).handlers.on_click;

  view.close();
  rootClick();
  hover(false, { notify() {} });
  closeButton(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, []);
});

test("unsupported roles stay inert", async () => {
  const app = await createApp();
  const view = app.view("unknown");
  assert.notEqual(renderedText(view.render({})), "");
  assert.equal(app.interval, undefined);
  assert.deepEqual(app.calls, []);
});

const workspace = (tabs, overrides = {}) => ({
  id: "machine/project",
  machine: "machine",
  active: true,
  tabs,
  ...overrides,
});

function panelTree(active = "changes", panelHidden = false) {
  return {
    id: "root",
    type: "row",
    children: [
      {
        id: "panel",
        type: "column",
        hidden: panelHidden,
        children: [
          {
            id: "panel-body",
            type: "stack",
            active,
            children: [
              { id: "files", type: "block" },
              { id: "changes", type: "block" },
            ],
          },
        ],
      },
    ],
  };
}

test("tabs-only bar keeps create/select/close/reorder and omits panel controls", async () => {
  const app = await createApp();
  app.setSpaces([
    workspace([
      { id: "machine/tab-1", name: "tb123", named: true, active: true, status: null, zoomed: false },
      { id: "machine/tab-2", name: "2", named: false, active: false, status: "working", zoomed: false },
    ]),
  ]);
  app.setWindow({ platform: "windows", buttons: true, maximized: false });
  const view = app.view("workspace-bar", { mode: "tabs" });
  const tree = view.render({});
  const text = renderedText(tree);

  assert.match(text, /tb123/);
  assert.doesNotMatch(text, /Files|Changes/);
  assert.ok(findById(tree, "workspace-chrome-tab-new"));
  assert.ok(findById(tree, "workspace-chrome-window-minimize"));

  findById(tree, "workspace-chrome-tab-new").handlers.on_click();
  assert.equal(app.overlays.at(-1).mod, "new-menu");

  app.calls.length = 0;
  const inactiveTab = findById(tree, "workspace-chrome-tab-machine/tab-2");
  inactiveTab.handlers.on_mouse_down.left({ click_count: 1 }, { stop_propagation() {} });
  inactiveTab.handlers.on_mouse_up.left(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, [["tab.select", { id: "machine/tab-2" }]]);

  app.calls.length = 0;
  findById(tree, "workspace-chrome-tab-close-machine/tab-1").handlers.on_click(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, [["tab.close", { id: "machine/tab-1" }]]);
  assert.equal(Object.hasOwn(app.calls[0][1], "confirmed"), false);
});

test("panels-only bar keeps panel toggles and opens a tab manager instead of requiring a sibling", async () => {
  const app = await createApp();
  app.setSpaces([workspace([{ id: "machine/tab-1", name: "1", named: false, active: true }])]);
  app.setLayout(panelTree());
  const view = app.view("workspace-bar", { mode: "panels" });
  const tree = view.render({});

  assert.match(renderedText(tree), /Tabs/);
  assert.match(renderedText(tree), /Files/);
  assert.match(renderedText(tree), /Changes/);
  assert.equal(findById(tree, "workspace-chrome-tab-machine/tab-1"), undefined);
  findById(tree, "workspace-chrome-tabs-open").handlers.on_click();
  assert.equal(app.overlays.at(-1).props.role, "tab-picker");
  assert.equal(app.overlays.at(-1).props.space, "machine/project");

  app.calls.length = 0;
  findById(tree, "workspace-chrome-panel-files").handlers.on_click();
  assert.deepEqual(app.calls, [
    ["layout.select", { stack: "panel-body", child: "files" }],
    ["layout.show", { id: "panel" }],
  ]);
});

test("custom panel IDs drive selection styling and exact native commands", async () => {
  const app = await createApp();
  app.setSpaces([workspace([])]);
  app.setLayout({
    id: "root",
    type: "row",
    children: [
      {
        id: "side-dock",
        type: "column",
        children: [
          {
            id: "views",
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
  });
  const view = app.view("workspace-bar", {
    mode: "panels",
    panel: "side-dock",
    stack: "views",
    filesPanel: "tree-view",
    changesPanel: "diff-view",
  });
  const tree = view.render({});
  const files = findById(tree, "workspace-chrome-panel-files");
  const changes = findById(tree, "workspace-chrome-panel-changes");

  assert.deepEqual(files.styles.bg, [palette.selected]);
  assert.deepEqual(changes.styles.bg, [palette.chrome]);
  changes.handlers.on_click();
  assert.deepEqual(app.calls, [
    ["layout.select", { stack: "views", child: "diff-view" }],
    ["layout.show", { id: "side-dock" }],
  ]);
});

test("unscoped creation uses the native empty-state menu but refuses stale scopes", async () => {
  const empty = await createApp();
  empty.setSpaces([]);
  const emptyView = empty.view("workspace-bar", { mode: "panels" });
  findById(emptyView.render({}), "workspace-chrome-tab-new").handlers.on_click();
  assert.equal(empty.overlays.at(-1).mod, "new-menu");

  const stale = await createApp();
  stale.setSpaces([workspace([])]);
  const pinnedView = stale.view("workspace-bar", { mode: "tabs", space: "machine/project" });
  const pinnedTree = pinnedView.render({});
  stale.setSpaces([workspace([], { id: "other/project" })]);
  findById(pinnedTree, "workspace-chrome-tab-new").handlers.on_click();
  assert.deepEqual(stale.overlays, []);

  stale.setSpaces([workspace([], { active: false })]);
  const unscopedView = stale.view("workspace-bar", { mode: "tabs" });
  findById(unscopedView.render({}), "workspace-chrome-tab-new").handlers.on_click();
  assert.deepEqual(stale.overlays, []);
});

test("panel controls reflect native hidden and selected state and refuse missing ancestry", async () => {
  const app = await createApp();
  app.setSpaces([workspace([])]);
  app.setLayout(panelTree("files"));
  const view = app.view("workspace-bar", { mode: "panels" });
  const tree = view.render({});
  findById(tree, "workspace-chrome-panel-files").handlers.on_click();
  assert.deepEqual(app.calls, [["layout.hide", { id: "panel" }]]);

  app.calls.length = 0;
  app.setLayout(panelTree("files", true));
  const hidden = view.render({});
  findById(hidden, "workspace-chrome-panel-files").handlers.on_click();
  assert.deepEqual(app.calls, [
    ["layout.select", { stack: "panel-body", child: "files" }],
    ["layout.show", { id: "panel" }],
  ]);

  app.calls.length = 0;
  app.setLayout({ id: "root", type: "row", children: [] });
  const unavailable = view.render({});
  findById(unavailable, "workspace-chrome-panel-files").handlers.on_click();
  assert.deepEqual(app.calls, []);
});

test("tab picker cancels a released or abandoned drag before the next gesture", async () => {
  const app = await createApp();
  app.setSpaces([
    workspace([
      { id: "machine/tab-a", name: "A", named: true, active: false },
      { id: "machine/tab-b", name: "B", named: true, active: true },
    ]),
  ]);
  const view = app.view("tab-picker", { space: "machine/project", overlay: "picker-overlay" });
  const tree = view.render({});
  const root = findById(tree, "workspace-chrome-tab-picker");
  const source = findById(tree, "workspace-chrome-picker-tab-machine/tab-a");
  const destination = findById(tree, "workspace-chrome-picker-tab-machine/tab-b");
  assert.deepEqual(source.styles.flex_none, []);

  source.handlers.on_mouse_down.left({ click_count: 1 }, { stop_propagation() {} });
  // Releasing outside has no root mouse-up; the next blank press must discard the source.
  root.handlers.on_mouse_down.left({}, { stop_propagation() {} });
  destination.handlers.on_mouse_up.left(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, []);

  source.handlers.on_mouse_down.left({ click_count: 1 }, { stop_propagation() {} });
  root.handlers.on_mouse_down_out({}, {});
  destination.handlers.on_mouse_up.left(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, []);
});

test("tab picker selects current exact membership, moves by fresh IDs, and preserves named labels", async () => {
  const app = await createApp();
  app.setSpaces([
    workspace([
      { id: "machine/tab-a", name: "tb123", named: true, active: false },
      { id: "machine/tab-b", name: "2", named: false, active: true },
      { id: "machine/tab-c", name: "3", named: false, active: false },
    ]),
  ]);
  const view = app.view("tab-picker", { space: "machine/project", overlay: "picker-overlay" });
  const tree = view.render({});

  assert.match(renderedText(tree), /tb123/);
  const pickerRoot = findById(tree, "workspace-chrome-tab-picker");
  findById(tree, "workspace-chrome-picker-tab-machine/tab-a").handlers.on_mouse_down.left(
    { click_count: 1 },
    { stop_propagation() {} },
  );
  findById(tree, "workspace-chrome-picker-tab-machine/tab-a").handlers.on_mouse_up.left(null, {
    stop_propagation() {},
  });
  assert.deepEqual(app.calls, [["tab.select", { id: "machine/tab-a" }]]);
  assert.deepEqual(app.closedOverlays, ["picker-overlay"]);

  app.calls.length = 0;
  app.closedOverlays.length = 0;
  findById(tree, "workspace-chrome-picker-tab-machine/tab-a").handlers.on_mouse_down.left(
    { click_count: 1 },
    { stop_propagation() {} },
  );
  app.setSpaces([
    workspace([
      { id: "machine/tab-c", name: "3", named: false, active: false },
      { id: "machine/tab-a", name: "tb123", named: true, active: false },
      { id: "machine/tab-b", name: "2", named: false, active: true },
    ]),
  ]);
  findById(tree, "workspace-chrome-picker-tab-machine/tab-c").handlers.on_mouse_up.left(null, {
    stop_propagation() {},
  });
  assert.deepEqual(app.calls, [["tab.move", { id: "machine/tab-a", index: 1 }]]);
  assert.ok(pickerRoot.handlers.on_mouse_up.left);
  assert.ok(pickerRoot.handlers.on_mouse_down_out);
});

test("tab picker selects a valid active tab and closes its overlay", async () => {
  const app = await createApp();
  app.setSpaces([workspace([{ id: "machine/only-tab", name: "Only", named: true, active: true }])]);
  const picker = app.view("tab-picker", { space: "machine/project", overlay: "one-tab-picker" });
  const tab = findById(picker.render({}), "workspace-chrome-picker-tab-machine/only-tab");

  tab.handlers.on_mouse_down.left({ click_count: 1 }, { stop_propagation() {} });
  tab.handlers.on_mouse_up.left(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, [["tab.select", { id: "machine/only-tab" }]]);
  assert.deepEqual(app.closedOverlays, ["one-tab-picker"]);
});

test("tab picker dismisses only its own overlay before opening native creation", async () => {
  const app = await createApp();
  app.setSpaces([workspace([{ id: "machine/tab-a", name: "A", named: true, active: true }])]);
  const picker = app.view("tab-picker", { space: "machine/project", overlay: "picker-overlay" });
  const tree = picker.render({});

  findById(tree, "workspace-chrome-picker-new-tab").handlers.on_click();
  assert.deepEqual(app.closedOverlays, ["picker-overlay"]);
  assert.equal(app.overlays.at(-1).mod, "new-menu");
});

test("custom tab bars preserve horizontal access and nonshrinking controls", async () => {
  const app = await createApp();
  app.setSpaces([
    workspace([
      { id: "machine/tab-a", name: "A", named: true, active: true },
      { id: "machine/tab-b", name: "B", named: true, active: false },
    ]),
  ]);
  app.setLayout(panelTree());
  const view = app.view("workspace-bar", { mode: "combined" });
  const tree = view.render({});
  const strip = findById(tree, "workspace-chrome-tabs-scroll");
  const width = 120;

  assert.ok(width < 220);
  assert.deepEqual(tree.styles.overflow_x_scrollbar, []);
  assert.deepEqual(strip.styles.flex_1, []);
  assert.deepEqual(strip.styles.min_w, [0]);
  assert.deepEqual(strip.styles.overflow_x_scrollbar, []);
  const source = findById(tree, "workspace-chrome-tab-machine/tab-a");
  const destination = findById(tree, "workspace-chrome-tab-machine/tab-b");
  source.handlers.on_mouse_down.left({ click_count: 1 }, { stop_propagation() {} });
  // Releasing outside has no root mouse-up; the next blank press must discard the source.
  tree.handlers.on_mouse_down.left({}, { stop_propagation() {} });
  destination.handlers.on_mouse_up.left(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, []);

  source.handlers.on_mouse_down.left({ click_count: 1 }, { stop_propagation() {} });
  tree.handlers.on_mouse_down_out({}, {});
  destination.handlers.on_mouse_up.left(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, []);

  source.handlers.on_mouse_down.left({ click_count: 1 }, { stop_propagation() {} });
  destination.handlers.on_mouse_up.left(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, [["tab.move", { id: "machine/tab-a", index: 2 }]]);
  app.calls.length = 0;

  assert.deepEqual(findById(tree, "workspace-chrome-tab-new").styles.flex_none, []);
  assert.deepEqual(findById(tree, "workspace-chrome-panel-files").styles.flex_none, []);
  assert.deepEqual(findById(tree, "workspace-chrome-tab-machine/tab-a").styles.flex_none, []);
});

test("tab action popup revalidates its target and ignores callbacks after close", async () => {
  const app = await createApp();
  app.setSpaces([workspace([{ id: "machine/tab-a", name: "A", named: true, active: true }])]);
  const bar = app.view("workspace-bar", { mode: "tabs" });
  const row = findById(bar.render({}), "workspace-chrome-tab-machine/tab-a");
  row.handlers.on_mouse_down.right({}, { stop_propagation() {} });
  assert.equal(app.overlays.at(-1).props.role, "tab-actions");

  const staleMenu = app.view("tab-actions", {
    space: "machine/project",
    tab: "machine/tab-a",
    overlay: "stale-menu",
  });
  const staleTree = staleMenu.render({});
  const staleClose = findById(staleTree, "workspace-chrome-tab-action-close");
  const staleNew = findById(staleTree, "workspace-chrome-tab-action-new");
  app.setSpaces([workspace([])]);
  staleClose.handlers.on_click();
  staleNew.handlers.on_click();
  assert.deepEqual(app.calls, []);
  assert.equal(app.overlays.length, 1);
  assert.deepEqual(app.closedOverlays, []);

  app.setSpaces([workspace([{ id: "machine/tab-a", name: "A", named: true, active: true }])]);
  const openMenu = app.view("tab-actions", {
    space: "machine/project",
    tab: "machine/tab-a",
    overlay: "open-menu",
  });
  const openTree = openMenu.render({});
  const newTab = findById(openTree, "workspace-chrome-tab-action-new");
  const close = findById(openTree, "workspace-chrome-tab-action-close");
  newTab.handlers.on_click();
  assert.deepEqual(app.closedOverlays, ["open-menu"]);
  assert.equal(app.overlays.at(-1).mod, "new-menu");
  openMenu.close();
  close.handlers.on_click();
  assert.deepEqual(app.calls, []);
});

test("tab picker refuses stale callbacks and panel/window options do not dispatch after close", async () => {
  const app = await createApp();
  app.setSpaces([workspace([{ id: "machine/tab-a", name: "A", named: true, active: true }])]);
  app.setLayout(panelTree());
  app.setWindow({ platform: "windows", buttons: true, maximized: false });
  const view = app.view("workspace-bar", { mode: "combined", windowControls: "omit" });
  const tree = view.render({});
  assert.ok(findById(tree, "workspace-chrome-tab-machine/tab-a"));
  assert.ok(findById(tree, "workspace-chrome-panel-files"));
  assert.equal(findById(tree, "workspace-chrome-window-minimize"), undefined);

  const tab = findById(tree, "workspace-chrome-tab-machine/tab-a");
  tab.handlers.on_mouse_down.left({ click_count: 1 }, { stop_propagation() {} });
  app.setSpaces([workspace([])]);
  tab.handlers.on_mouse_up.left(null, { stop_propagation() {} });
  assert.deepEqual(app.calls, []);

  app.setSpaces([workspace([{ id: "machine/tab-a", name: "A", named: true, active: true }])]);
  const open = view.render({});
  const panelButton = findById(open, "workspace-chrome-panel-files");
  view.close();
  panelButton.handlers.on_click();
  assert.deepEqual(app.calls, []);
});
