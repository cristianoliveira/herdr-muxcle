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
  const calls = { docs: [], operations: [], notices: [], commands: [], helpViews: 0, snapshots: 0 };
  const snapshots = [...(overrides.snapshots ?? [])];
  const adapter = {
    snapshot: () => {
      calls.snapshots += 1;
      return snapshots.shift() ?? overrides.snapshot ?? { focus, tab, panes, machine: null };
    },
    document: async (context, operation) => {
      calls.docs.push(context);
      calls.operations.push(operation);
      return overrides.document ? overrides.document(context) : '{"changed":true,"splits":1}';
    },
    notice: (message, level) => calls.notices.push({ message, level }),
    run: (command, args) => calls.commands.push({ command, args }),
    openHelp: () => {
      calls.helpViews += 1;
    },
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
  assert.deepEqual(value.calls.operations, ["equalize"]);
  assert.deepEqual(value.calls.notices, [{ message: "Equalized 1 split.", level: "info" }]);
});

test("dispatches named resize commands and reports the requested axis", async () => {
  const value = harness();

  assert.equal(await value.controller.execute("grow-width"), true);
  assert.deepEqual(value.calls.operations, ["grow-width"]);
  assert.deepEqual(value.calls.notices, [{ message: "Grew pane width.", level: "info" }]);
});

test("strip-height dispatches a distinct command and reports the fixed-weight target", async () => {
  const value = harness();

  assert.equal(await value.controller.execute("strip-height"), true);
  assert.deepEqual(value.calls.operations, ["strip-height"]);
  assert.deepEqual(value.calls.notices, [{ message: "Created a 4% height strip.", level: "info" }]);
});

test("strip-height unzooms only when its originally zoomed tab and focus remain unchanged", async () => {
  const before = {
    focus: { ...focus, shown: null },
    tab: { ...tab, zoomed: true },
    panes: panes.map((pane) => ({ ...pane, zoomed: pane.pane === "a" })),
    machine: null,
  };
  const unchanged = harness({ snapshots: [before, before], document: async () => '{"changed":false,"splits":0}' });

  assert.equal(await unchanged.controller.execute("strip-height"), true);
  assert.deepEqual(unchanged.calls.commands, [{ command: "pane.zoom", args: { pane: "a" } }]);

  const changedFocus = harness({ snapshots: [before, { ...before, focus: { ...focus, pane: "b" } }] });
  await changedFocus.controller.execute("strip-height");
  assert.deepEqual(changedFocus.calls.commands, []);

  const userUnzoomed = harness({ snapshots: [before, { ...before, tab: { ...tab, zoomed: false } }] });
  await userUnzoomed.controller.execute("strip-height");
  assert.deepEqual(userUnzoomed.calls.commands, []);
});

test("strip-height refuses more than 25 panes before starting the helper", async () => {
  const oversized = Array.from({ length: 26 }, (_, index) => ({
    pane: `p${index}`,
    terminal: `t${index}`,
    tab: "tab",
    zoomed: false,
  }));
  const value = harness({
    snapshot: {
      focus: { space: "space", tab: "tab", pane: "p0", terminal: "t0", shown: null },
      tab: { id: "tab", panes: 26, zoomed: false },
      panes: oversized,
      machine: null,
    },
  });

  assert.equal(await value.controller.execute("strip-height"), false);
  assert.deepEqual(value.calls.docs, []);
  assert.match(value.calls.notices[0].message, /at most 25 panes/);
});

test("strip-height does not undo a zoom created during sizing or after unmount", async () => {
  const ordinary = { focus, tab, panes, machine: null };
  const zoomed = { focus, tab: { ...tab, zoomed: true }, panes, machine: null };
  const newlyZoomed = harness({ snapshots: [ordinary, zoomed] });

  await newlyZoomed.controller.execute("strip-height");
  assert.deepEqual(newlyZoomed.calls.commands, []);

  let resolveDocument;
  const pending = new Promise((resolve) => {
    resolveDocument = resolve;
  });
  const before = {
    focus,
    tab: { ...tab, zoomed: true },
    panes: panes.map((pane) => ({ ...pane, zoomed: pane.pane === "a" })),
    machine: null,
  };
  const unmounted = harness({ snapshots: [before, before], document: () => pending });
  const operation = unmounted.controller.execute("strip-height");
  unmounted.controller.dispose();
  resolveDocument('{"changed":true,"splits":1}');
  await operation;

  assert.deepEqual(unmounted.calls.commands, []);
});

test("rejects a resize result claiming more than one changed split", async () => {
  const value = harness({ document: async () => '{"changed":true,"splits":2}' });

  assert.equal(await value.controller.execute("grow-width"), false);
  assert.equal(value.calls.notices[0].level, "error");
  assert.match(value.calls.notices[0].message, /unexpected resize result.*uncertain/);
});

test("opens native help without reading a snapshot, invoking the helper, or posting a notice", async () => {
  const value = harness();

  assert.equal(await value.controller.execute("help"), false);
  assert.equal(value.calls.helpViews, 1);
  assert.equal(value.calls.snapshots, 0);
  assert.deepEqual(value.calls.docs, []);
  assert.deepEqual(value.calls.notices, []);
});

test("help remains available while a sizing operation is pending", async () => {
  let resolveDocument;
  const pending = new Promise((resolve) => {
    resolveDocument = resolve;
  });
  const value = harness({ document: () => pending });
  const sizing = value.controller.execute("grow-width");

  assert.equal(await value.controller.execute("help"), false);
  assert.equal(value.calls.helpViews, 1);
  assert.equal(value.calls.docs.length, 1);

  resolveDocument('{"changed":false,"splits":0}');
  assert.equal(await sizing, false);
});

test("rejects unknown commands before taking a snapshot", async () => {
  const value = harness();

  assert.equal(await value.controller.execute("resize-diagonal"), false);
  assert.equal(value.calls.snapshots, 0);
  assert.deepEqual(value.calls.docs, []);
  assert.deepEqual(value.calls.notices, []);
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
  assert.match(value.calls.notices[0].message, /before changing pane sizes/);
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
  assert.equal(await pending.controller.execute("grow-width"), false);
  resolveDocument('{"changed":true,"splits":2}');
  assert.equal(await first, true);
  assert.equal(pending.calls.docs.length, 1);

  const uncertain = harness({ document: async () => '{"changed":true,"splits":0}' });
  assert.equal(await uncertain.controller.equalize(), false);
  assert.equal(uncertain.calls.notices[0].level, "error");
  assert.match(uncertain.calls.notices[0].message, /uncertain/);
});

test("reports malformed helper output as an uncertain error", async () => {
  const value = harness({ document: async () => "{invalid" });

  assert.equal(await value.controller.equalize(), false);
  assert.deepEqual(value.calls.notices, [
    { message: "Sizing helper returned invalid data; outcome may be uncertain.", level: "error" },
  ]);
});

test("uses a fallback message for failures that are not Error instances", async () => {
  const value = harness({ document: async () => Promise.reject(null) });

  assert.equal(await value.controller.equalize(), false);
  assert.deepEqual(value.calls.notices, [{ message: "Pane sizing could not be confirmed.", level: "error" }]);
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
