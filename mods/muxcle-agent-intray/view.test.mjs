import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  dismissEvent,
  dismissEvents,
  filterEvents,
  jumpCommand,
  observeEvents,
  restoreState,
} from "../../.build/mods/muxcle-agent-intray/model.js";

const STATE_KEY = "muxcle-agent-intray.state.v1";
const agent = (address, status, seq = 1) => ({
  address,
  status,
  seq,
  title: `Task ${address}`,
  space_name: "Project",
  tab_name: "Work",
});

async function createInbox() {
  const calls = [];
  const sharedState = new Map();
  const writes = [];
  const lists = new Map();
  let snapshot = [];
  let live = [];
  let options = {};
  let jumpError = null;
  let stopped = 0;

  function element() {
    const node = { handlers: {} };
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
            target.children = children;
            return builder;
          };
        if (name === "when") return (condition, apply) => (condition ? apply(builder) : builder);
        return (...args) => {
          target.handlers[name] = args;
          return builder;
        };
      },
    });
    return builder;
  }

  const path = new URL("../../.build/mods/muxcle-agent-intray/main.js", import.meta.url);
  const source = (await readFile(path, "utf8"))
    .replace(/^import .*;$/gm, "")
    .replace("export default class MuxcleAgentIntray", "globalThis.MuxcleAgentIntray = class MuxcleAgentIntray");
  const scope = {
    View: class {},
    div: element,
    h_flex: element,
    v_flex: element,
    v_virtual_list(_id, count, _height, key, render) {
      const list = element();
      list.count = count;
      list.keys = Array.from({ length: count }, (_, index) => key(index));
      list.items = render({ start: 0, end: count });
      lists.set("events", list);
      return list;
    },
    VirtualListScrollHandle: { new: () => ({ scroll_to_item() {} }) },
    InputState: {
      new: () => {
        let value = "";
        const handlers = {};
        return {
          handlers,
          on(name, callback) {
            handlers[name] = callback;
          },
          value: () => value,
          focus() {
            calls.push(["focus"]);
          },
          type(text, cx) {
            value = text;
            handlers.change({}, cx);
          },
          submit(cx) {
            handlers.submit({}, cx);
          },
        };
      },
    },
    Input: { new: element },
    Button: { new: element },
    Tabs: { new: element },
    Tab: { new: element },
    agents: () => snapshot,
    terminals: () => live,
    dismissEvent,
    dismissEvents,
    filterEvents,
    jumpCommand,
    observeEvents,
    restoreState,
    props: () => options,
    theme: () => ({
      accent: "accent",
      background: "background",
      blocked: "blocked",
      dim: "dim",
      done: "done",
      foreground: "foreground",
      hover: "hover",
      muted: "muted",
      popover: "popover",
    }),
    shared: (key) => sharedState.get(key),
    setShared(key, value) {
      writes.push(key);
      sharedState.set(key, value);
    },
    run(...args) {
      if (jumpError) throw jumpError;
      calls.push(args);
    },
    closeOverlay: (id) => calls.push(["close", id]),
    notify: (message) => calls.push(["notice", message.title]),
  };
  vm.runInNewContext(source, scope, { filename: path.pathname });

  const cx = {
    focus_handle: () => ({
      focus() {
        calls.push(["focus"]);
      },
      is_focused() {
        return true;
      },
      release() {
        return true;
      },
    }),
    notify() {},
    stop_propagation() {
      stopped += 1;
    },
  };

  return {
    calls,
    writes,
    lists,
    stopped: () => stopped,
    open(role) {
      options = { role, overlay: "inbox" };
      const view = new scope.MuxcleAgentIntray();
      view.init({}, cx);
      return view;
    },
    setAgents(value) {
      snapshot = value;
      live = value.map(({ address }) => ({ address, state: "live" }));
    },
    setLive(value) {
      live = value;
    },
    failJump() {
      jumpError = new Error("offline");
    },
    press(view, key, renderAfter = true) {
      const root = view.render(cx);
      if (key === "enter") {
        root.handlers.on_key_down[0]({ key, keystroke: key }, cx);
        view.input.handlers.submit({}, cx);
      } else {
        root.handlers.on_key_down[0]({ key, keystroke: key }, cx);
      }
      if (renderAfter) view.render(cx);
    },
    search(view, value) {
      view.input.type(value, cx);
      view.render(cx);
    },
    button(view, label) {
      function find(node) {
        if (node?.handlers?.on_click && renderedText(node) === label) return node;
        return Array.isArray(node?.children) ? node.children.map(find).find(Boolean) : undefined;
      }
      const button = find(view.render(cx));
      assert.ok(button, `Missing button: ${label}`);
      return button;
    },
    tab(view, label) {
      function find(node) {
        if (node?.handlers?.on_click && renderedText(node).startsWith(`${label} (`)) return node;
        return Array.isArray(node?.children) ? node.children.map(find).find(Boolean) : undefined;
      }
      const tab = find(view.render(cx));
      assert.ok(tab, `Missing status tab: ${label}`);
      tab.handlers.on_click[0]({}, cx);
      view.render(cx);
    },
    click(view, label) {
      const button = this.button(view, label);
      assert.notEqual(button.handlers.disabled?.[0], true);
      if (button.handlers.on_mouse_down) button.handlers.on_mouse_down[1]({}, cx);
      button.handlers.on_click[0]({}, cx);
      view.render(cx);
    },
    pointerDown(view, label) {
      const button = this.button(view, label);
      button.handlers.on_mouse_down[1]({}, cx);
    },
    keyboardActivate(view, label) {
      const button = this.button(view, label);
      assert.notEqual(button.handlers.disabled?.[0], true);
      button.handlers.on_click[0]({}, cx);
      view.render(cx);
    },
    state() {
      return restoreState(sharedState.get(STATE_KEY));
    },
    rawState() {
      return sharedState.get(STATE_KEY);
    },
    setLegacyState(value) {
      sharedState.set("intray.state", value);
    },
    legacyState() {
      return sharedState.get("intray.state");
    },
  };
}

function renderedText(node) {
  if (typeof node === "string") return node;
  return Array.isArray(node?.children) ? node.children.map(renderedText).join(" ") : "";
}

test("the optional observer captures while the popup is closed without rewriting no-change state", async () => {
  const app = await createInbox();
  app.setLegacyState("personal-state");
  const observer = app.open("observer");
  observer.render();
  const writesAfterStart = app.writes.length;
  observer.render();

  assert.equal(app.writes.length, writesAfterStart);
  app.setAgents([agent("one", "done")]);
  observer.render();

  assert.deepEqual(
    app.state().events.map((event) => event.address),
    ["one"],
  );
  assert.equal(app.rawState().schema, 1);
  assert.equal(app.rawState().events.length, 1);
  assert.equal(app.legacyState(), "personal-state");
  assert.equal(app.rawState().events[0].title, "Task one");
  assert.equal(app.rawState().seen[0].title, "Task one");
});

test("popup works without the observer and explains that earlier transitions are not replayed", async () => {
  const app = await createInbox();
  const view = app.open();
  const text = renderedText(view.render());

  assert.match(text, /No unread events/);
  assert.match(text, /earlier transitions are not replayed/);
});

test("queued focus keeps an event unread until explicit dismissal", async () => {
  const app = await createInbox();
  app.setAgents([agent("remote/t1", "blocked")]);
  const view = app.open();

  app.press(view, "enter", false);

  assert.deepEqual(
    app.calls.find((call) => call[0] === "agent.focus"),
    ["agent.focus", { terminal: "remote/t1" }],
  );
  assert.deepEqual(
    app.calls.filter((call) => call[0] === "close"),
    [["close", "inbox"]],
  );
  assert.equal(app.state().events.length, 1);

  const reopened = app.open();
  app.press(reopened, "ctrl-d");
  assert.equal(app.state().events.length, 0);
});

test("status filters keep unread events intact and Enter jumps only within the selected status", async () => {
  const app = await createInbox();
  app.setAgents([agent("finished", "done"), agent("blocked", "blocked", 2)]);
  const view = app.open();
  app.tab(view, "Finished");

  assert.equal(app.lists.get("events").count, 1);
  assert.equal(app.state().events.length, 2);
  app.press(view, "enter");

  assert.deepEqual(
    app.calls.find((call) => call[0] === "agent.focus"),
    ["agent.focus", { terminal: "finished" }],
  );
  assert.equal(app.state().events.length, 2);
});

test("manual selection stays on the same event when a newer event arrives", async () => {
  const app = await createInbox();
  app.setAgents([agent("old", "done"), agent("new", "blocked", 2)]);
  const view = app.open();
  app.press(view, "ctrl-j");
  app.setAgents([agent("old", "done"), agent("new", "blocked", 2), agent("latest", "done", 3)]);

  app.press(view, "enter");

  assert.deepEqual(
    app.calls.find((call) => call[0] === "agent.focus"),
    ["agent.focus", { terminal: "old" }],
  );
  assert.equal(app.state().events.length, 3);
});

test("unavailable and failed jumps preserve the event", async () => {
  const app = await createInbox();
  app.setAgents([agent("gone", "done")]);
  const view = app.open();
  app.setLive([]);

  app.press(view, "enter");
  assert.equal(app.state().events.length, 1);
  assert.equal(
    app.calls.some((call) => call[0] === "agent.focus"),
    false,
  );
  assert.equal(
    app.calls.some((call) => call[0] === "close"),
    false,
  );

  app.setLive([{ address: "gone", state: "live" }]);
  app.failJump();
  app.press(view, "enter");
  assert.equal(app.state().events.length, 1);
  assert.equal(
    app.calls.some((call) => call[0] === "close"),
    false,
  );
});

test("bulk review fixes event IDs, captures arrivals at confirmation, and leaves new events unread", async () => {
  const app = await createInbox();
  app.setAgents([agent("old", "done")]);
  const view = app.open();
  app.click(view, "Dismiss all");

  app.setAgents([agent("old", "done"), agent("new", "blocked", 2)]);
  app.press(view, "ctrl-enter");

  assert.deepEqual(
    app.state().events.map((event) => event.address),
    ["new"],
  );
});

test("plain Enter and native Button keyboard activation cannot confirm reviewed events", async () => {
  const app = await createInbox();
  app.setAgents([agent("one", "done")]);
  const view = app.open();
  app.click(view, "Dismiss all");

  app.press(view, "enter");
  app.press(view, "ctrl-d");
  app.keyboardActivate(view, "Confirm · Ctrl+Enter");

  assert.equal(app.state().events.length, 1);
  assert.equal(
    app.calls.some((call) => call[0] === "agent.focus" || call[0] === "close"),
    false,
  );
  assert.ok(app.stopped() >= 2);

  app.press(view, "ctrl-enter");
  assert.equal(app.state().events.length, 0);
});

test("pointer confirmation is explicit and a canceled pointer press cannot arm Enter", async () => {
  const app = await createInbox();
  app.setAgents([agent("one", "done")]);
  const view = app.open();
  app.click(view, "Dismiss all");

  app.pointerDown(view, "Confirm · Ctrl+Enter");
  app.press(view, "enter");
  app.keyboardActivate(view, "Confirm · Ctrl+Enter");
  assert.equal(app.state().events.length, 1);

  app.click(view, "Confirm · Ctrl+Enter");
  assert.equal(app.state().events.length, 0);
});

test("cancel and Escape abandon review without reading events", async () => {
  for (const cancel of ["button", "escape"]) {
    const app = await createInbox();
    app.setAgents([agent("one", "done")]);
    const view = app.open();
    app.click(view, "Dismiss all");

    if (cancel === "button") app.click(view, "Cancel");
    else app.press(view, "escape");

    assert.equal(app.state().events.length, 1);
  }
});

test("confirmation removes only reviewed IDs after another view changes shared state", async () => {
  const app = await createInbox();
  app.setAgents([agent("old", "done")]);
  const first = app.open();
  app.click(first, "Dismiss all");

  const second = app.open();
  app.press(second, "ctrl-d");
  app.setAgents([agent("old", "done"), agent("new", "blocked", 2)]);
  app.press(first, "ctrl-enter");

  assert.deepEqual(
    app.state().events.map((event) => event.address),
    ["new"],
  );
});
