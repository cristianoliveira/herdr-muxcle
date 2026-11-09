import assert from "node:assert/strict";
import test from "node:test";
import { SizingController } from "../../.build/mods/muxcle-sizing/controller.js";

const focus = { space: "space", tab: "tab", pane: "a", terminal: "ta", shown: null };
const panes = [
  { pane: "a", terminal: "ta", tab: "tab", zoomed: false },
  { pane: "b", terminal: "tb", tab: "tab", zoomed: false },
];
const tab = { id: "tab", panes: 2, zoomed: false };

function harness(overrides = {}) {
  const calls = { docs: [], notices: [] };
  const adapter = {
    snapshot: () => overrides.snapshot ?? { focus, tab, panes, machine: null },
    document: async (context) => {
      calls.docs.push(context);
      return overrides.document ? overrides.document(context) : '{"changed":true,"splits":1}';
    },
    notice: (message, level) => calls.notices.push({ message, level }),
  };
  return { calls, controller: new SizingController(adapter) };
}

test("opens one scoped document operation and reports successful equalization", async () => {
  const value = harness();

  assert.equal(await value.controller.equalize(), true);
  assert.deepEqual(value.calls.docs, [
    {
      space: "space",
      tab: "tab",
      pane: "a",
      panes: ["a", "b"],
      terminals: ["ta", "tb"],
      machine: null,
    },
  ]);
  assert.deepEqual(value.calls.notices, [{ message: "Equalized 1 split.", level: "info" }]);
});

test("a single pane is a no-op without helper calls or notices", async () => {
  const value = harness({
    snapshot: {
      focus,
      tab: { ...tab, panes: 1 },
      panes: panes.slice(0, 1),
      machine: null,
    },
  });

  assert.equal(await value.controller.equalize(), false);
  assert.deepEqual(value.calls.docs, []);
  assert.deepEqual(value.calls.notices, []);
});

test("unsupported snapshots fail closed before reading the core document", async () => {
  const value = harness({
    snapshot: { focus: { ...focus, shown: "replacement" }, tab, panes, machine: null },
  });

  assert.equal(await value.controller.equalize(), false);
  assert.deepEqual(value.calls.docs, []);
  assert.equal(value.calls.notices[0].level, "info");
});

test("already-equal layouts report no change", async () => {
  const value = harness({ document: async () => '{"changed":false,"splits":0}' });

  assert.equal(await value.controller.equalize(), false);
  assert.deepEqual(value.calls.notices, []);
});

test("coalesces pending shortcuts and exposes uncertain outcomes", async () => {
  let resolveDocument;
  const document = new Promise((resolve) => {
    resolveDocument = resolve;
  });
  const pending = harness({ document: () => document });
  const first = pending.controller.equalize();
  assert.equal(await pending.controller.equalize(), false);
  resolveDocument('{"changed":true,"splits":2}');
  assert.equal(await first, true);
  assert.equal(pending.calls.docs.length, 1);

  const uncertain = harness({ document: async () => '{"changed":true,"splits":0}' });
  assert.equal(await uncertain.controller.equalize(), false);
  assert.equal(uncertain.calls.notices[0].level, "error");
  assert.match(uncertain.calls.notices[0].message, /uncertain/);
});

test("dispose prevents future commands and suppresses late notices", async () => {
  let resolveDocument;
  const document = new Promise((resolve) => {
    resolveDocument = resolve;
  });
  const value = harness({ document: () => document });
  const pending = value.controller.equalize();
  value.controller.dispose();
  assert.equal(await value.controller.equalize(), false);
  resolveDocument('{"changed":true,"splits":1}');

  assert.equal(await pending, true);
  assert.deepEqual(value.calls.notices, []);
});
