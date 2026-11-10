import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { planKeymapMerge } from "../../.build/src/lib/keymap-merge.js";

const packageKeys = JSON.parse(await readFile(new URL("../../packages/tmux-keys/keys.json", import.meta.url), "utf8"));
const packageBindingCount = Object.values(packageKeys).reduce(
  (count, section) => count + Object.keys(section).length,
  0,
);

test("package snippet maps the requested tmux-inspired keys to native Herdr commands", () => {
  assert.deepEqual(packageKeys, {
    global: {
      "ctrl-a c": "tab.new",
      "ctrl-a n": "tab.prev",
      "ctrl-a p": "tab.next",
      "ctrl-a 1": "tab.select:1",
      "ctrl-a 2": "tab.select:2",
      "ctrl-a 3": "tab.select:3",
      "ctrl-a 4": "tab.select:4",
      "ctrl-a 5": "tab.select:5",
      "ctrl-a 6": "tab.select:6",
      "ctrl-a 7": "tab.select:7",
      "ctrl-a 8": "tab.select:8",
      "ctrl-a 9": "tab.select:9",
      "ctrl-a w": "pane.split:down",
      "ctrl-a _": "pane.split:down",
      "ctrl-a v": "pane.split:right",
      "ctrl-a |": "pane.split:right",
      "ctrl-a ctrl-h": "pane.go:left",
      "ctrl-a ctrl-j": "pane.go:down",
      "ctrl-a ctrl-k": "pane.go:up",
      "ctrl-a ctrl-l": "pane.go:right",
      "ctrl-a ctrl-f": "pane.zoom",
      "ctrl-a z": "pane.zoom",
      "ctrl-a ,": "tab.rename",
      "ctrl-a ?": "app.help",
      "ctrl-a :": "app.palette",
    },
    terminal: { "ctrl-a ctrl-a": `send:${String.fromCharCode(1)}` },
  });
});

test("merges the parsed package snippet and preserves unrelated key sections", () => {
  const existing = {
    global: { "ctrl-shift-x": "app.palette" },
    terminal: { "ctrl-shift-y": "send:y" },
    "layout:terminals": { "ctrl-shift-z": "terminal" },
    "mod:editor": { "ctrl-s": "editor.save" },
    settings: { theme: "dark" },
  };

  const plan = planKeymapMerge(existing, packageKeys);

  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.added, packageBindingCount);
  assert.equal(plan.unchanged, 0);
  assert.deepEqual(plan.merged.global["ctrl-a c"], "tab.new");
  assert.deepEqual(plan.merged.terminal["ctrl-a ctrl-a"], "send:\u0001");
  assert.deepEqual(plan.merged["layout:terminals"], existing["layout:terminals"]);
  assert.deepEqual(plan.merged["mod:editor"], existing["mod:editor"]);
  assert.deepEqual(plan.merged.settings, existing.settings);
  assert.deepEqual(existing.global, { "ctrl-shift-x": "app.palette" });
});

test("leaves already-equal package bindings unchanged on repeat merge", () => {
  const existing = JSON.parse(JSON.stringify(packageKeys));

  const plan = planKeymapMerge(existing, packageKeys);

  assert.deepEqual(plan.merged, existing);
  assert.equal(plan.added, 0);
  assert.equal(plan.unchanged, packageBindingCount);
  assert.deepEqual(plan.conflicts, []);
});

test("rejects exact key conflicts without returning a partial merge", () => {
  const existing = { global: { "ctrl-a c": "app.palette" }, terminal: {} };

  const plan = planKeymapMerge(existing, packageKeys);

  assert.equal(plan.merged, null);
  assert.deepEqual(plan.conflicts, [
    {
      chord: "ctrl-a c",
      existingSection: "global",
      incomingSection: "global",
      existingAction: "app.palette",
      incomingAction: "tab.new",
      reason: "exact",
    },
  ]);
  assert.deepEqual(existing.global, { "ctrl-a c": "app.palette" });
});

test("reports layout and terminal precedence conflicts", () => {
  const existing = {
    global: { "ctrl-a ctrl-a": "terminal" },
    "layout:terminals": { "ctrl-a c": "app.palette" },
    terminal: { "ctrl-a n": "tab.next" },
  };

  const plan = planKeymapMerge(existing, packageKeys);

  assert.equal(plan.merged, null);
  assert.deepEqual(
    plan.conflicts.map(({ chord, existingSection, reason }) => [chord, existingSection, reason]),
    [
      ["ctrl-a c", "layout:terminals", "shadowed-by-existing"],
      ["ctrl-a n", "terminal", "shadowed-by-existing"],
      ["ctrl-a ctrl-a", "global", "overrides-existing"],
    ],
  );
});

test("native help and palette additions preserve equal bindings but refuse higher-priority overrides", () => {
  const existing = { global: { "ctrl-a ?": "app.help", "ctrl-a :": "app.palette" } };

  const equalPlan = planKeymapMerge(existing, packageKeys);

  assert.equal(equalPlan.unchanged, 2);
  assert.equal(equalPlan.added, packageBindingCount - 2);
  assert.deepEqual(equalPlan.conflicts, []);
  assert.deepEqual(equalPlan.merged.global["ctrl-a ?"], "app.help");
  assert.deepEqual(equalPlan.merged.global["ctrl-a :"], "app.palette");

  const shadowing = {
    terminal: { "ctrl-a ?": "terminal.search" },
    "layout:personal": { "ctrl-a :": "app.settings" },
  };

  const conflictPlan = planKeymapMerge(shadowing, packageKeys);

  assert.equal(conflictPlan.merged, null);
  assert.deepEqual(
    conflictPlan.conflicts.map(({ chord, existingSection, reason }) => [chord, existingSection, reason]),
    [
      ["ctrl-a ?", "terminal", "shadowed-by-existing"],
      ["ctrl-a :", "layout:personal", "shadowed-by-existing"],
    ],
  );
  assert.deepEqual(shadowing.terminal, { "ctrl-a ?": "terminal.search" });
});

test("refuses help and palette chords shadowed by focused-mod bindings", () => {
  const existing = {
    "mod:editor": { "ctrl-a ?": "editor.help", "ctrl-a :": "editor.palette" },
  };

  const plan = planKeymapMerge(existing, packageKeys);

  assert.equal(plan.merged, null);
  assert.deepEqual(
    plan.conflicts.map(({ chord, existingSection, reason }) => [chord, existingSection, reason]),
    [
      ["ctrl-a ?", "mod:editor", "shadowed-by-existing"],
      ["ctrl-a :", "mod:editor", "shadowed-by-existing"],
    ],
  );
  assert.deepEqual(existing["mod:editor"], { "ctrl-a ?": "editor.help", "ctrl-a :": "editor.palette" });
});

test("reports focused-mod bindings that shadow terminal Ctrl-a passthrough", () => {
  const existing = { "mod:editor": { "ctrl-a ctrl-a": "editor.action" } };

  const plan = planKeymapMerge(existing, packageKeys);

  assert.equal(plan.merged, null);
  assert.deepEqual(plan.conflicts, [
    {
      chord: "ctrl-a ctrl-a",
      existingSection: "mod:editor",
      incomingSection: "terminal",
      existingAction: "editor.action",
      incomingAction: "send:\u0001",
      reason: "shadowed-by-existing",
    },
  ]);
  assert.deepEqual(existing["mod:editor"], { "ctrl-a ctrl-a": "editor.action" });
});

test("preserves equal mod-scoped native actions without reporting false conflicts", () => {
  const existing = { "mod:editor": { "ctrl-a ?": "app.help", "ctrl-a :": "app.palette" } };

  const plan = planKeymapMerge(existing, packageKeys);

  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.added, packageBindingCount);
  assert.deepEqual(plan.merged["mod:editor"], existing["mod:editor"]);
  assert.equal(plan.merged.global["ctrl-a ?"], "app.help");
  assert.equal(plan.merged.global["ctrl-a :"], "app.palette");
});

test("rejects malformed parsed maps with actionable errors", () => {
  assert.throws(() => planKeymapMerge(null, packageKeys), /existing key map must be a JSON object/);
  assert.throws(() => planKeymapMerge({}, { global: [] }), /section global must be an object/);
  assert.throws(() => planKeymapMerge({}, { global: { "ctrl-a c": 42 } }), /action must be a string or command object/);
  assert.throws(
    () => planKeymapMerge({}, { global: { "ctrl-a c": { command: "tab.new", args: [] } } }),
    /command args must be an object/,
  );
  assert.throws(() => planKeymapMerge({}, { global: { "ctrl-a c": "" } }), /action must not be empty/);
  assert.throws(() => planKeymapMerge({ "layout:": {} }, packageKeys), /empty key section name/);
  assert.throws(() => planKeymapMerge({}, { "layout:terminals": {} }), /unsupported section: layout:terminals/);
  assert.throws(() => planKeymapMerge({}, { settings: { theme: "dark" } }), /unsupported section: settings/);
});
