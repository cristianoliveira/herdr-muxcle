import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as copyMode from "../../.build/mods/muxcle-copy-mode/copy-mode.js";

function element() {
  const node = { children: [], handlers: {} };
  const builder = new Proxy(node, {
    get(target, name) {
      if (name === "child")
        return (child) => {
          target.children.push(child);
          return builder;
        };
      if (name in target) return target[name];
      return (...args) => {
        target.handlers[name] = args;
        return builder;
      };
    },
  });
  return builder;
}

function find(root, predicate) {
  if (!root || typeof root !== "object") return null;
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

function action(root, label) {
  const found = find(root, (node) => node.children.includes(label));
  assert.ok(found, `Expected visible action: ${label}`);
  return found;
}

async function launcher() {
  const path = new URL("../../.build/mods/muxcle-copy-mode/main.js", import.meta.url);
  const source = (await readFile(path, "utf8"))
    .replace(/^import .*;$/gm, "")
    .replace("export default class MuxcleCopyMode", "globalThis.CopyMode = class MuxcleCopyMode");
  const calls = { captures: [], core: [], closed: [], notices: [] };
  const tasks = [];
  const scope = {
    ...copyMode,
    Date: { now: () => 0 },
    Math: { random: () => 0.5 },
    View: class {},
    div: element,
    h_flex: element,
    v_flex: element,
    focused: () => ({ space: "local", tab: "tab-1", pane: "pane-1", terminal: "t3", shown: null, agent: null }),
    spaces: () => [{ id: "local", machine: null }],
    layout: () => ({ type: "block", content: { tab: "active" } }),
    agents: () => [],
    props: () => ({ overlay: "copy-launcher" }),
    theme: () => ({}),
    closeOverlay: (id) => calls.closed.push(id),
    notify: (notice) => calls.notices.push(notice),
    appHome: () => "/app",
    home: () => "/home/me",
    shared: () => null,
    setShared: () => assert.fail("Rendering must not change active capture ownership"),
    hc: async (args) => {
      calls.core.push(args);
      assert.fail("No live Core calls in view tests");
    },
    openOverlay: () => assert.fail("Only the verified launch flow may open a viewer"),
    launchCopyMode: async (confirmed) => {
      calls.captures.push(confirmed);
      throw new Error("Controlled capture failure");
    },
  };
  vm.runInNewContext(source, scope, { filename: path.pathname });
  const view = new scope.CopyMode();
  const cx = {
    notify() {},
    stop_propagation() {},
    focus_handle: () => ({ focus() {} }),
    spawn: (callback) => tasks.push(callback(cx)),
  };
  view.init({ overlay: "copy-launcher" }, cx);
  return { view, cx, calls, settle: () => Promise.all(tasks) };
}

test("wrapped details scroll independently while capture and close remain outside the shrinking body", async () => {
  const popup = await launcher();

  const root = popup.view.render();
  const capture = action(root, "Copy snapshot");
  const close = action(root, "Close · Esc");
  const details = find(root, (node) => "overflow_y_scrollbar" in node.handlers);

  assert.ok(details, "Long details must be scrollable instead of pushing capture out of the popup");
  assert.ok("size_full" in root.handlers, "Use the overlay's actual available size");
  assert.equal(root.handlers.h, undefined);
  assert.equal(root.handlers.w, undefined);
  assert.ok("flex_1" in details.handlers);
  assert.deepEqual(details.handlers.min_h, [0]);
  assert.ok(root.children.includes(capture));
  assert.ok("flex_none" in capture.handlers);
  assert.equal(
    find(details, (node) => node === capture || node === close),
    null,
  );
  assert.deepEqual(popup.calls.captures, []);
  assert.deepEqual(popup.calls.core, []);
});

test("click and Enter explicitly request capture and surface failure without losing the action", async () => {
  for (const trigger of ["click", "enter"]) {
    const popup = await launcher();
    const root = popup.view.render();

    if (trigger === "click") action(root, "Copy snapshot").handlers.on_click[0]({}, popup.cx);
    else root.handlers.on_key_down[0]({ keystroke: "enter" }, popup.cx);
    await popup.settle();

    assert.deepEqual(popup.calls.captures, [true]);
    assert.ok(
      find(popup.view.render(), (node) =>
        node.children.some((text) => typeof text === "string" && text.includes("Controlled capture failure")),
      ),
    );
    action(popup.view.render(), "Copy snapshot");
    assert.deepEqual(popup.calls.core, []);
    assert.deepEqual(popup.calls.closed, []);
  }
});

test("Escape closes only the launcher without capture or Core work", async () => {
  const popup = await launcher();

  popup.view.render().handlers.on_key_down[0]({ keystroke: "escape" }, popup.cx);
  await popup.settle();

  assert.deepEqual(popup.calls.closed, ["copy-launcher"]);
  assert.deepEqual(popup.calls.captures, []);
  assert.deepEqual(popup.calls.core, []);
});
