import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  hasVisibleHistoryBlock,
  parsePickerConfig,
  parsePickerOrder,
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
      if (name === "on_key_down" || name === "on_item_click")
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

async function createPicker(config) {
  const calls = [];
  const tasks = [];
  let terminalReads = 0;
  let spaceSnapshot = [];
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
    v_virtual_list(_id, count, _height, key, render) {
      const list = element();
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
    hasVisibleHistoryBlock,
    layout: () => ({ id: "root", type: "row", children: [] }),
    openOverlay() {},
    parsePickerConfig,
    parsePickerOrder,
    pickerRows,
    props: () => ({ overlay: "picker-overlay" }),
    readTextFile: async (path) => {
      calls.push(["read-config", path]);
      return config;
    },
    run: (...args) => calls.push(args),
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
  };
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
  tabs: [{ id: "machine/tab", name: "Work", active: true, status }],
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
    assert.doesNotMatch(plain, /Claude Code|live descendants/);
    assert.doesNotMatch(plain, /new tab|new space/);

    const filtered = renderedText(app.search(view, "claude"));
    assert.match(filtered, /Project → Work/);
    assert.equal(app.terminalReads, 0);
  }
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
