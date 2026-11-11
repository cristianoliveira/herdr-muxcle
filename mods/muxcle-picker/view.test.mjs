import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  closeTargetIsCurrent,
  connectedPeerIsCurrent,
  hasVisibleHistoryBlock,
  parseConnectedPeers,
  parsePickerConfig,
  parsePickerOrder,
  pickerManagementActions,
  pickerRows,
  selectedRowKey,
  selectionAction,
} from "../../.build/mods/muxcle-picker/model.js";

function element() {
  const node = { children: [], handlers: {}, styles: {} };
  const builder = new Proxy(node, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === "child")
        return (child) => {
          target.children.push(child);
          return builder;
        };
      if (name === "children")
        return (children) => {
          target.children.push(...children);
          return builder;
        };
      if (name === "when") return (condition, apply) => (condition ? apply(builder) : builder);
      if (name === "id")
        return (value) => {
          target.id = value;
          return builder;
        };
      if (name === "on_key_down" || name === "on_item_click" || name === "on_click")
        return (...args) => {
          target.handlers[name] = args;
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

async function createPicker(config, options = {}) {
  const calls = [];
  const tasks = [];
  let terminalReads = 0;
  let machineReads = 0;
  let spaceSnapshot = [];
  let paneSnapshot = [];
  let focusSnapshot = null;
  let machineResponses = options.machineResponses ?? [];
  const machineLoader = options.machineLoader;
  let agentSnapshot = [];
  let terminalSnapshot = [];
  let inputValue = "";
  const inputHandlers = {};
  const palette = {
    background: "background",
    dim: "dim",
    foreground: "foreground",
    hover: "hover",
    popover: "popover",
    ansi1: "danger",
  };
  const path = new URL("../../.build/mods/muxcle-picker/main.js", import.meta.url);
  const source = (await readFile(path, "utf8"))
    .replace(/^import \{[\s\S]*?\} from "[^"]+";\r?\n/gm, "")
    .replace("export default class MuxclePicker", "globalThis.MuxclePicker = class MuxclePicker");
  const scope = {
    View: class {},
    div: element,
    h_flex: element,
    v_flex: element,
    v_virtual_list(id, count, _height, key, render) {
      const list = element();
      list.id = id;
      list.keys = Array.from({ length: count }, (_, index) => key(index));
      list.children.push(...render({ start: 0, end: count }, cx));
      return list;
    },
    Input: { new: element },
    InputState: {
      new: () => ({
        on(name, handler) {
          inputHandlers[name] = handler;
        },
        value: () => inputValue,
        focus() {},
        type(value) {
          inputValue = value;
          inputHandlers.change({}, cx);
        },
        submit() {
          inputHandlers.submit({}, cx);
        },
      }),
    },
    VirtualListScrollHandle: { new: () => ({ scroll_to_item() {} }) },
    agents: () => agentSnapshot,
    appHome: () => "/private/app-home",
    closeOverlay: (id) => calls.push(["close", id]),
    focused: () => focusSnapshot,
    hc: async (args) => {
      machineReads += 1;
      calls.push(["hc", args]);
      if (machineLoader) return machineLoader(args, machineReads);
      return machineResponses.shift() ?? { code: 0, stdout: JSON.stringify({ machines: [] }) };
    },
    hasVisibleHistoryBlock,
    layout: () => ({ id: "root", type: "row", children: [] }),
    openOverlay() {},
    parsePickerConfig,
    parsePickerOrder,
    pickerRows,
    pickerManagementActions,
    closeTargetIsCurrent,
    connectedPeerIsCurrent,
    parseConnectedPeers,
    panes: () => paneSnapshot,
    props: () => ({ overlay: "picker-overlay" }),
    readTextFile: async (path) => {
      calls.push(["read-config", path]);
      return config;
    },
    run: (...args) => {
      const normalized = JSON.parse(JSON.stringify(args));
      calls.push(normalized);
      if (options.runFailure === args[0]) throw new Error("simulated command failure");
    },
    selectedRowKey,
    selectionAction,
    shared: () => null,
    spaces: () => spaceSnapshot,
    terminals: () => {
      terminalReads += 1;
      return terminalSnapshot;
    },
    theme: () => palette,
  };
  const cx = {
    focus_handle: () => ({
      focus() {},
      release() {
        return true;
      },
    }),
    notify() {},
    spawn(task) {
      tasks.push(task);
    },
    stop_propagation() {},
  };
  vm.runInNewContext(source, scope, { filename: path.pathname });

  return {
    calls,
    get terminalReads() {
      return terminalReads;
    },
    get machineReads() {
      return machineReads;
    },
    setMachineResponses(value) {
      machineResponses = value;
    },
    setFocused(value) {
      focusSnapshot = value;
    },
    setPanes(value) {
      paneSnapshot = value;
    },
    setSpaces(value) {
      spaceSnapshot = value;
    },
    setAgents(value) {
      agentSnapshot = value;
    },
    setTerminals(value) {
      terminalSnapshot = value;
    },
    async open() {
      const view = new scope.MuxclePicker();
      view.init({}, cx);
      for (const task of tasks.splice(0)) await task(cx);
      return view;
    },
    render(view) {
      return view.render(cx);
    },
    search(view, query) {
      view.input.type(query);
      return view.render(cx);
    },
    submit(view) {
      view.input.submit();
    },
    keydown(view, keystroke) {
      const tree = view.render(cx);
      const root = view.closeReview ? findNode(tree, "muxcle-picker-close-review") : tree;
      const handler = root?.handlers.on_key_down?.[0];
      handler?.({ keystroke, key: keystroke }, cx);
    },
    async clickManagement(view, kind, identity) {
      const tree = view.render(cx);
      const list = findNode(tree, "muxcle-picker-management-actions");
      const key = list?.keys.find((candidate) => {
        const parts = JSON.parse(candidate);
        return parts[1] === kind && (identity === undefined || parts[2] === identity);
      });
      if (key === undefined) throw new Error(`No management action found for ${kind}`);
      return this.clickManagementKey(view, key);
    },
    clickManagementKey(view, key) {
      const list = findNode(view.render(cx), "muxcle-picker-management-actions");
      return list?.handlers.on_item_click?.[0]?.(key, cx);
    },
    clickButton(view, id) {
      const tree = view.render(cx);
      const handler = findNode(tree, id)?.handlers.on_click?.[0];
      if (!handler) throw new Error(`No clickable button found: ${id}`);
      return handler({}, cx);
    },
  };
}

function findNode(node, id) {
  if (!node || typeof node !== "object") return null;
  if (id !== null && node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function renderedText(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return Array.isArray(node?.children) ? node.children.map(renderedText).join("") : "";
}

const workspace = (status = null) => ({
  id: "machine/project",
  name: "Project",
  machine: null,
  active: true,
  tabs: [{ id: "machine/tab", name: "Work", active: true, status, panes: 1 }],
});

const agent = {
  address: "machine/agent",
  space: "machine/project",
  tab: "machine/tab",
  status: "working",
  app: "claude-code",
  program: { name: "Claude Code", agent: true },
};

const terminals = [
  { address: "machine/agent", parent: null, state: "live" },
  { address: "machine/worker", parent: "machine/agent", state: "live" },
];

test("default and malformed config preserve search but do not read terminal context", async () => {
  for (const config of [null, "bad config"]) {
    const app = await createPicker(config);
    app.setSpaces([workspace("working")]);
    app.setAgents([agent]);
    app.setTerminals(terminals);
    const view = await app.open();
    const plain = renderedText(app.render(view));

    assert.equal(app.terminalReads, 0);
    assert.equal(app.machineReads, 0);
    assert.doesNotMatch(plain, /Claude Code|live descendants/);
    assert.doesNotMatch(plain, /new tab|new space/);

    const filtered = renderedText(app.search(view, "claude"));
    assert.match(filtered, /Project → Work/);
    assert.equal(app.terminalReads, 0);
  }
});

test("management opt-in adds explicit creation actions while Enter still selects only existing targets", async () => {
  const app = await createPicker('{"schema":1,"management":true}');
  app.setSpaces([workspace()]);
  app.setFocused({ space: "machine/project", tab: "machine/tab", pane: null, terminal: null, shown: null });
  app.setPanes([{ pane: "pane", tab: "machine/tab", terminal: "terminal", mod: null }]);
  const view = await app.open();
  const tree = app.render(view);
  const actions = findNode(tree, "muxcle-picker-management-actions");

  assert.equal(app.machineReads, 0);
  assert.deepEqual(
    actions.keys.map((key) => JSON.parse(key)[1]),
    ["new-tab", "new-local-space", "close-tab"],
  );
  app.submit(view);
  assert.deepEqual(
    app.calls.filter(([command]) => command === "tab.select"),
    [["tab.select", { id: "machine/tab" }]],
  );
  assert.equal(
    app.calls.some(([command]) => ["tab.new", "space.new", "tab.close"].includes(command)),
    false,
  );

  const creation = await createPicker('{"schema":1,"management":true}');
  creation.setSpaces([workspace()]);
  creation.setFocused({ space: "machine/project", tab: "machine/tab", pane: null, terminal: null, shown: null });
  const creationView = await creation.open();
  await creation.clickManagement(creationView, "new-tab");
  assert.deepEqual(
    creation.calls.filter(([command]) => command === "tab.new"),
    [["tab.new", { space: "machine/project" }]],
  );
  assert.deepEqual(
    creation.calls.filter(([command]) => command === "close"),
    [["close", "picker-overlay"]],
  );
});

test("empty results do not preselect management actions; arrows select one before Enter runs it", async () => {
  const app = await createPicker('{"schema":1,"management":true}');
  app.setSpaces([]);
  const view = await app.open();
  app.submit(view);
  assert.equal(
    app.calls.some(([command]) => command === "space.new"),
    false,
  );

  app.keydown(view, "down");
  app.submit(view);
  assert.deepEqual(
    app.calls.filter(([command]) => command === "space.new"),
    [["space.new", { machine: "" }]],
  );
});

test("management opt-in dispatches local space creation only after its separate action is clicked", async () => {
  const app = await createPicker('{"schema":1,"management":true}');
  app.setSpaces([workspace()]);
  const view = await app.open();
  app.submit(view);

  assert.equal(
    app.calls.some(([command]) => command === "space.new"),
    false,
  );
  await app.clickManagement(view, "new-local-space");
  assert.deepEqual(
    app.calls.filter(([command]) => command === "space.new"),
    [["space.new", { machine: "" }]],
  );
});

test("remote-space actions query only when enabled and revalidate a connected non-temporary peer", async () => {
  const connected = {
    code: 0,
    stdout: JSON.stringify({
      machines: [{ id: "peer-server", name: "server", state: "connected", temporary: false }],
    }),
  };
  const disconnected = {
    code: 0,
    stdout: JSON.stringify({
      machines: [{ id: "peer-server", name: "server", state: "disconnected", temporary: false }],
    }),
  };
  const app = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [connected, disconnected],
  });
  app.setSpaces([workspace()]);
  const view = await app.open();

  assert.equal(app.machineReads, 1);
  assert.match(renderedText(app.render(view)), /New space on server/);
  await app.clickManagement(view, "new-peer-space", "server");

  assert.equal(app.machineReads, 2);
  assert.equal(
    app.calls.some(([command]) => command === "space.new"),
    false,
  );
  assert.equal(
    app.calls.some(([command]) => command === "close"),
    false,
  );
  assert.match(renderedText(app.render(view)), /no longer connected/i);
});

test("remote-space creation sends only after a fresh connected-peer result", async () => {
  const response = {
    code: 0,
    stdout: JSON.stringify({ machines: [{ id: "peer-server", name: "server", state: "connected" }] }),
  };
  const app = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [response, response],
  });
  app.setSpaces([workspace()]);
  const view = await app.open();
  await app.clickManagement(view, "new-peer-space", "server");

  assert.deepEqual(
    app.calls.filter(([command]) => command === "space.new"),
    [["space.new", { machine: "server" }]],
  );
  assert.deepEqual(
    app.calls.filter(([command]) => command === "close"),
    [["close", "picker-overlay"]],
  );
});

test("temporary connected peers remain visible but are not remote mutation targets", async () => {
  const peer = {
    code: 0,
    stdout: JSON.stringify({
      machines: [{ id: "temporary-core-1", name: "server", state: "connected", temporary: true }],
    }),
  };
  const remoteSpace = {
    id: "server/space",
    name: "Remote",
    machine: "server",
    active: true,
    tabs: [{ id: "server/tab", name: "Shell", active: true, panes: 1 }],
  };
  const app = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [peer],
  });
  app.setSpaces([remoteSpace]);
  app.setPanes([{ pane: "server/pane", tab: "server/tab", terminal: "server/terminal", mod: null }]);
  app.setFocused({
    space: "server/space",
    tab: "server/tab",
    pane: "server/pane",
    terminal: "server/terminal",
    shown: null,
  });
  const view = await app.open();
  const text = renderedText(app.render(view));

  assert.match(text, /Remote/);
  assert.match(text, /New local space/);
  assert.match(text, /Herdr does not support remote document actions for temporary machines/i);
  assert.doesNotMatch(text, /New tab in Remote|New space on server|Close selected tab/i);
  assert.equal(app.machineReads, 1);
  assert.equal(
    app.calls.some(([command]) => ["space.new", "tab.new", "tab.close"].includes(command)),
    false,
  );
});

test("reviewed tab close sends only the native target ID and input or Enter cannot bypass review", async () => {
  const app = await createPicker('{"schema":1,"management":true}');
  app.setSpaces([
    {
      ...workspace(),
      id: "local-space",
      tabs: [{ id: "local-tab", name: "shell", active: true, panes: 2 }],
    },
  ]);
  app.setPanes([
    { pane: "pane-a", tab: "local-tab", terminal: "terminal-a", mod: null },
    { pane: "pane-b", tab: "local-tab", terminal: null, mod: "files" },
  ]);
  app.setFocused({
    space: "local-space",
    tab: "local-tab",
    pane: "pane-a",
    terminal: "terminal-a",
    shown: "shown-terminal",
  });
  const view = await app.open();
  app.keydown(view, "down");
  app.keydown(view, "down");
  app.keydown(view, "down");
  app.submit(view);
  const review = renderedText(app.render(view));

  assert.match(review, /Review tab close/);
  assert.match(review, /local · Project/);
  assert.match(review, /pane-a: terminal terminal-a · shown terminal shown-terminal/);
  assert.match(review, /pane-b: mod files/);
  assert.equal(
    app.calls.some(([command]) => command === "tab.close"),
    false,
  );

  app.submit(view);
  app.keydown(view, "enter");
  assert.equal(
    app.calls.some(([command]) => command === "tab.close"),
    false,
  );

  await app.clickButton(view, "muxcle-picker-close-confirm");
  assert.deepEqual(
    app.calls.filter(([command]) => command === "tab.close"),
    [["tab.close", { id: "local-tab" }]],
  );
  assert.deepEqual(
    app.calls.filter(([command]) => command === "close"),
    [["close", "picker-overlay"]],
  );
});

test("uncertain close errors cannot be retried from the same review", async () => {
  const app = await createPicker('{"schema":1,"management":true}', { runFailure: "tab.close" });
  app.setSpaces([
    {
      ...workspace(),
      id: "local-space",
      tabs: [{ id: "local-tab", name: "shell", active: true, panes: 1 }],
    },
  ]);
  app.setPanes([{ pane: "pane-a", tab: "local-tab", terminal: "terminal-a", mod: null }]);
  const view = await app.open();
  await app.clickManagement(view, "close-tab");
  await app.clickButton(view, "muxcle-picker-close-confirm");

  assert.equal(app.calls.filter(([command]) => command === "tab.close").length, 1);
  assert.match(renderedText(app.render(view)), /status is uncertain/i);
  await app.clickButton(view, "muxcle-picker-close-confirm");
  assert.equal(app.calls.filter(([command]) => command === "tab.close").length, 1);
});

test("tab close confirmation refuses changed pane resources and cancellation never sends a command", async () => {
  const app = await createPicker('{"schema":1,"management":true}');
  app.setSpaces([
    {
      ...workspace(),
      id: "local-space",
      tabs: [{ id: "local-tab", name: "shell", active: true, panes: 1 }],
    },
  ]);
  app.setPanes([{ pane: "pane-a", tab: "local-tab", terminal: "terminal-a", mod: null }]);
  const view = await app.open();
  await app.clickManagement(view, "close-tab");
  app.setPanes([{ pane: "pane-a", tab: "local-tab", terminal: "replacement", mod: null }]);
  await app.clickButton(view, "muxcle-picker-close-confirm");

  assert.equal(
    app.calls.some(([command]) => command === "tab.close"),
    false,
  );
  assert.equal(
    app.calls.some(([command]) => command === "close"),
    false,
  );
  assert.match(renderedText(app.render(view)), /pane scope changed/i);

  await app.clickManagement(view, "close-tab");
  app.keydown(view, "escape");
  assert.equal(
    app.calls.some(([command]) => command === "tab.close"),
    false,
  );
});

test("remote management stays off without its flag and remote close rechecks connection state", async () => {
  const noRemote = await createPicker('{"schema":1,"management":true}');
  noRemote.setSpaces([
    {
      ...workspace(),
      id: "server/project",
      machine: "server",
      tabs: [{ id: "server/tab", name: "Work", active: true, panes: 1 }],
    },
  ]);
  noRemote.setFocused({ space: "server/project", tab: "server/tab", pane: "p", terminal: "t", shown: null });
  noRemote.setPanes([{ pane: "p", tab: "server/tab", terminal: "t", mod: null }]);
  const noRemoteView = await noRemote.open();
  const noRemoteActions = findNode(noRemote.render(noRemoteView), "muxcle-picker-management-actions");
  assert.equal(noRemote.machineReads, 0);
  assert.deepEqual(
    noRemoteActions.keys.map((key) => JSON.parse(key)[1]),
    ["new-local-space"],
  );

  const connected = {
    code: 0,
    stdout: JSON.stringify({ machines: [{ id: "peer-server", name: "server", state: "connected" }] }),
  };
  const disconnected = {
    code: 0,
    stdout: JSON.stringify({ machines: [{ id: "peer-server", name: "server", state: "disconnected" }] }),
  };
  const remote = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [connected, disconnected],
  });
  remote.setSpaces([
    {
      ...workspace(),
      id: "server/project",
      machine: "server",
      tabs: [{ id: "server/tab", name: "Work", active: true, panes: 1 }],
    },
  ]);
  remote.setPanes([{ pane: "p", tab: "server/tab", terminal: "t", mod: null }]);
  remote.setFocused({ space: "server/project", tab: "server/tab", pane: "p", terminal: "t", shown: null });
  const remoteView = await remote.open();
  await remote.clickManagement(remoteView, "close-tab");
  await remote.clickButton(remoteView, "muxcle-picker-close-confirm");

  assert.equal(remote.machineReads, 2);
  assert.equal(
    remote.calls.some(([command]) => command === "tab.close"),
    false,
  );
  assert.equal(
    remote.calls.some(([command]) => command === "close"),
    false,
  );
});

test("stale focused-space actions cannot create a tab on the prior target", async () => {
  const app = await createPicker('{"schema":1,"management":true}');
  app.setSpaces([workspace(), { id: "second", name: "Second", machine: null, active: false, tabs: [] }]);
  app.setFocused({ space: "machine/project", tab: "machine/tab", pane: null, terminal: null, shown: null });
  const view = await app.open();
  const list = findNode(app.render(view), "muxcle-picker-management-actions");
  const oldTabAction = list.keys.find((key) => JSON.parse(key)[1] === "new-tab");
  app.setFocused({ space: "second", tab: "second/tab", pane: null, terminal: null, shown: null });
  await app.clickManagementKey(view, oldTabAction);

  assert.equal(
    app.calls.some(([command]) => command === "tab.new"),
    false,
  );
  assert.match(renderedText(app.render(view)), /no longer available/i);
});

test("closing the picker while a peer check is pending prevents late creation", async () => {
  const connected = {
    code: 0,
    stdout: JSON.stringify({ machines: [{ id: "peer-server", name: "server", state: "connected" }] }),
  };
  let resolveFresh;
  const freshResult = new Promise((resolve) => {
    resolveFresh = resolve;
  });
  const app = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineLoader: (_args, read) => (read === 1 ? connected : freshResult),
  });
  app.setSpaces([workspace()]);
  const view = await app.open();
  const pending = app.clickManagement(view, "new-peer-space", "server");
  assert.equal(app.machineReads, 2);
  view.close();
  resolveFresh(connected);
  await pending;

  assert.equal(
    app.calls.some(([command]) => command === "space.new"),
    false,
  );
  assert.equal(
    app.calls.some(([command]) => command === "close"),
    false,
  );
});

test("malformed machine results fail closed without a remote fallback", async () => {
  const app = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [{ code: 0, stdout: "not json" }],
  });
  app.setSpaces([workspace()]);
  const view = await app.open();

  assert.match(renderedText(app.render(view)), /remote-space actions are unavailable/i);
  assert.equal(app.machineReads, 1);
  assert.equal(
    findNode(app.render(view), "muxcle-picker-management-actions").keys.some(
      (key) => JSON.parse(key)[1] === "new-peer-space",
    ),
    false,
  );
  assert.equal(
    app.calls.some(([command]) => ["space.new", "tab.new"].includes(command)),
    false,
  );
});

test("explicit agent context annotates exact existing targets without adding management actions", async () => {
  const app = await createPicker('{"schema":1,"agentContext":true}');
  app.setSpaces([workspace("working")]);
  app.setAgents([agent]);
  app.setTerminals(terminals);
  const view = await app.open();
  const tree = app.render(view);
  const text = renderedText(tree);

  assert.equal(app.terminalReads, 1);
  assert.match(text, /working/);
  assert.match(text, /Claude Code/);
  assert.match(text, /1 live descendant/);
  assert.doesNotMatch(text, /new tab|new space|close tab/);

  app.submit(view);
  assert.deepEqual(
    app.calls.filter(([command]) => command === "tab.select"),
    [["tab.select", { id: "machine/tab" }]],
  );
  assert.equal(
    app.calls.some(([command]) => ["tab.new", "space.new", "tab.close"].includes(command)),
    false,
  );
});

test("stale close callbacks cannot confirm a newly reviewed different or changed-scope tab", async () => {
  const makeSpaces = () => [
    {
      id: "space",
      name: "Workspace",
      machine: null,
      active: true,
      tabs: [
        { id: "tab-a", name: "Alpha", active: true, panes: 1 },
        { id: "tab-b", name: "Beta", active: false, panes: 1 },
      ],
    },
  ];
  const app = await createPicker('{"schema":1,"management":true}');
  app.setSpaces(makeSpaces());
  app.setPanes([
    { pane: "pane-a", tab: "tab-a", terminal: "terminal-a", mod: null },
    { pane: "pane-b", tab: "tab-b", terminal: "terminal-b", mod: null },
  ]);
  const view = await app.open();

  await app.clickManagement(view, "close-tab");
  const oldAlphaConfirm = findNode(app.render(view), "muxcle-picker-close-confirm").handlers.on_click[0];
  app.keydown(view, "escape");
  app.search(view, "beta");
  await app.clickManagement(view, "close-tab");
  oldAlphaConfirm({}, { notify() {} });

  assert.equal(
    app.calls.some(([command]) => command === "tab.close"),
    false,
  );
  assert.match(renderedText(app.render(view)), /Review tab close/);
  await app.clickButton(view, "muxcle-picker-close-confirm");
  assert.deepEqual(
    app.calls.filter(([command]) => command === "tab.close"),
    [["tab.close", { id: "tab-b" }]],
  );

  const sameTab = await createPicker('{"schema":1,"management":true}');
  sameTab.setSpaces([
    {
      id: "space",
      name: "Workspace",
      machine: null,
      active: true,
      tabs: [{ id: "tab-a", name: "Alpha", active: true, panes: 1 }],
    },
  ]);
  sameTab.setPanes([{ pane: "pane-a", tab: "tab-a", terminal: "terminal-a", mod: null }]);
  const sameTabView = await sameTab.open();
  await sameTab.clickManagement(sameTabView, "close-tab");
  const oldScopeConfirm = findNode(sameTab.render(sameTabView), "muxcle-picker-close-confirm").handlers.on_click[0];
  sameTab.keydown(sameTabView, "escape");
  sameTab.setPanes([{ pane: "pane-a", tab: "tab-a", terminal: "replacement", mod: null }]);
  await sameTab.clickManagement(sameTabView, "close-tab");
  oldScopeConfirm({}, { notify() {} });

  assert.equal(
    sameTab.calls.some(([command]) => command === "tab.close"),
    false,
  );
  await sameTab.clickButton(sameTabView, "muxcle-picker-close-confirm");
  assert.deepEqual(
    sameTab.calls.filter(([command]) => command === "tab.close"),
    [["tab.close", { id: "tab-a" }]],
  );
});

test("remote mutations reject a changed peer identity for space, tab, and close actions", async () => {
  const peer = (id) => ({
    code: 0,
    stdout: JSON.stringify({ machines: [{ id, name: "server", state: "connected" }] }),
  });
  const remoteSpace = {
    id: "server/space",
    name: "Remote",
    machine: "server",
    active: true,
    tabs: [{ id: "server/tab", name: "Shell", active: true, panes: 1 }],
  };

  const newSpace = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [peer("peer-original"), peer("peer-rebound")],
  });
  newSpace.setSpaces([workspace()]);
  const newSpaceView = await newSpace.open();
  await newSpace.clickManagement(newSpaceView, "new-peer-space", "server");
  assert.equal(
    newSpace.calls.some(([command]) => command === "space.new"),
    false,
  );
  assert.match(renderedText(newSpace.render(newSpaceView)), /identity changed|no longer identifies/i);

  const newTab = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [peer("peer-original"), peer("peer-rebound")],
  });
  newTab.setSpaces([remoteSpace]);
  newTab.setFocused({ space: "server/space", tab: "server/tab", pane: null, terminal: null, shown: null });
  const newTabView = await newTab.open();
  await newTab.clickManagement(newTabView, "new-tab");
  assert.equal(
    newTab.calls.some(([command]) => command === "tab.new"),
    false,
  );

  const close = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [peer("peer-original"), peer("peer-rebound")],
  });
  close.setSpaces([remoteSpace]);
  close.setPanes([{ pane: "server/pane", tab: "server/tab", terminal: "server/terminal", mod: null }]);
  close.setFocused({
    space: "server/space",
    tab: "server/tab",
    pane: "server/pane",
    terminal: "server/terminal",
    shown: null,
  });
  const closeView = await close.open();
  await close.clickManagement(closeView, "close-tab");
  await close.clickButton(closeView, "muxcle-picker-close-confirm");
  assert.equal(
    close.calls.some(([command]) => command === "tab.close"),
    false,
  );
  assert.match(renderedText(close.render(closeView)), /identity changed|no longer identifies/i);

  const missingIdentity = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [
      peer("peer-original"),
      { code: 0, stdout: JSON.stringify({ machines: [{ name: "server", state: "connected" }] }) },
    ],
  });
  missingIdentity.setSpaces([workspace()]);
  const missingView = await missingIdentity.open();
  await missingIdentity.clickManagement(missingView, "new-peer-space", "server");
  assert.equal(
    missingIdentity.calls.some(([command]) => command === "space.new"),
    false,
  );
  assert.match(renderedText(missingIdentity.render(missingView)), /could not verify connected machine identities/i);
});

test("remote mutations refuse a peer that becomes temporary before dispatch", async () => {
  const peer = (temporary) => ({
    code: 0,
    stdout: JSON.stringify({
      machines: [{ id: "peer-server", name: "server", state: "connected", temporary }],
    }),
  });
  const remoteSpace = {
    id: "server/space",
    name: "Remote",
    machine: "server",
    active: true,
    tabs: [{ id: "server/tab", name: "Shell", active: true, panes: 1 }],
  };

  const newSpace = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [peer(false), peer(true)],
  });
  newSpace.setSpaces([workspace()]);
  const newSpaceView = await newSpace.open();
  await newSpace.clickManagement(newSpaceView, "new-peer-space", "server");
  assert.equal(
    newSpace.calls.some(([command]) => command === "space.new"),
    false,
  );
  assert.match(renderedText(newSpace.render(newSpaceView)), /temporary/i);

  const newTab = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [peer(false), peer(true)],
  });
  newTab.setSpaces([remoteSpace]);
  newTab.setFocused({ space: "server/space", tab: "server/tab", pane: null, terminal: null, shown: null });
  const newTabView = await newTab.open();
  await newTab.clickManagement(newTabView, "new-tab");
  assert.equal(
    newTab.calls.some(([command]) => command === "tab.new"),
    false,
  );
  assert.match(renderedText(newTab.render(newTabView)), /temporary/i);

  const close = await createPicker('{"schema":1,"management":true,"remoteSpaces":true}', {
    machineResponses: [peer(false), peer(true)],
  });
  close.setSpaces([remoteSpace]);
  close.setPanes([{ pane: "server/pane", tab: "server/tab", terminal: "server/terminal", mod: null }]);
  close.setFocused({
    space: "server/space",
    tab: "server/tab",
    pane: "server/pane",
    terminal: "server/terminal",
    shown: null,
  });
  const closeView = await close.open();
  await close.clickManagement(closeView, "close-tab");
  await close.clickButton(closeView, "muxcle-picker-close-confirm");
  assert.equal(
    close.calls.some(([command]) => command === "tab.close"),
    false,
  );
  assert.match(renderedText(close.render(closeView)), /temporary/i);
});

test("close review bounds resources, keeps controls reachable, and sanitizes display-only metadata", async () => {
  const name = `Workspace\u202e${"n".repeat(300)}`;
  const panes = Array.from({ length: 256 }, (_, index) => ({
    pane: `pane-${index}-${"p".repeat(160)}`,
    tab: "tab",
    terminal: `terminal-${index}-${"t".repeat(160)}`,
    mod: null,
  }));
  const app = await createPicker('{"schema":1,"management":true}');
  app.setSpaces([
    { id: "space", name, machine: null, active: true, tabs: [{ id: "tab", name, active: true, panes: panes.length }] },
  ]);
  app.setPanes(panes);
  const view = await app.open();
  await app.clickManagement(view, "close-tab");
  const tree = app.render(view);
  const review = findNode(tree, "muxcle-picker-close-review");
  const resources = findNode(tree, "muxcle-picker-close-resources");
  const controls = findNode(tree, "muxcle-picker-close-actions");
  const firstResourceText = renderedText(resources.children[0]);
  const text = renderedText(review);

  assert.equal(review.styles.max_h[0], 580);
  assert.equal(resources.styles.max_h[0], 220);
  assert.ok("overflow_y_scrollbar" in resources.styles);
  assert.ok("flex_none" in controls.styles);
  assert.ok(findNode(tree, "muxcle-picker-close-cancel"));
  assert.ok(findNode(tree, "muxcle-picker-close-confirm"));
  assert.equal(findNode(resources, "muxcle-picker-close-confirm"), null);
  assert.ok(firstResourceText.length <= 160);
  assert.match(firstResourceText, /…/u);
  assert.equal(text.includes(`pane-0-${"p".repeat(160)}`), false);
  assert.doesNotMatch(text, /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u);
  assert.match(text, /shortened for display/i);
  assert.ok(text.length < 100_000);
});
