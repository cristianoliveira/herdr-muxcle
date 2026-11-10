import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  capturePaneTarget,
  formatLocalClock,
  paneAction,
  panePresentation,
  roleFor,
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
  working: "working-tone",
};

function element() {
  const node = { handlers: {}, styles: {} };
  const builder = new Proxy(node, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === "child")
        return (child) => {
          target.children ??= [];
          target.children.push(child);
          return builder;
        };
      if (name === "children")
        return (children) => {
          target.children ??= [];
          target.children.push(...children);
          return builder;
        };
      if (name === "on_click" || name === "on_hover" || name === "hover")
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
    home: () => "/Users/example",
    image: element,
    svg: element,
    capturePaneTarget,
    formatLocalClock,
    paneAction,
    panePresentation,
    roleFor,
    panes: () => paneSnapshot,
    props: () => ({ role, ...props }),
    run: (...args) => calls.push(args),
    spaces: () => spaceSnapshot,
    theme: () => palette,
  };
  vm.runInNewContext(source, scope, { filename: path.pathname });

  return {
    calls,
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
  return Array.isArray(node?.children) ? node.children.map((child) => findById(child, id)).find(Boolean) : undefined;
}

function renderedText(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return Array.isArray(node?.children) ? node.children.map(renderedText).join("") : "";
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
