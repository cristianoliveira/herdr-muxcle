import assert from "node:assert/strict";
import test from "node:test";
import { sizingPlan } from "../../.build/mods/muxcle-sizing/model.js";

const panes = [
  { pane: "a", terminal: "ta", tab: "tab", zoomed: false },
  { pane: "b", terminal: "tb", tab: "tab", zoomed: false },
  { pane: "c", terminal: "tc", tab: "tab", zoomed: false },
];
const focus = (pane = "a") => ({ space: "space", tab: "tab", pane, terminal: `t${pane}`, shown: null });
const tab = { id: "tab", panes: 3, zoomed: false };

test("a single ordinary pane is a no-op", () => {
  assert.deepEqual(sizingPlan(focus(), { ...tab, panes: 1 }, panes.slice(0, 1)), { kind: "noop" });
});

test("plans a scoped document equalization for two or more ordinary panes", () => {
  const plan = sizingPlan(focus("b"), tab, panes, null);

  assert.equal(plan.kind, "document");
  assert.deepEqual(plan.context, {
    space: "space",
    tab: "tab",
    pane: "b",
    panes: ["a", "b", "c"],
    terminals: ["ta", "tb", "tc"],
    machine: null,
  });
});

test("preserves machine-qualified identity scope", () => {
  const remote = panes.map((pane) => ({
    ...pane,
    pane: `build/${pane.pane}`,
    terminal: `build/${pane.terminal}`,
    tab: "build/tab",
  }));
  const plan = sizingPlan(
    { ...focus("b"), space: "build/space", tab: "build/tab", pane: "build/b", terminal: "build/tb" },
    { ...tab, id: "build/tab" },
    remote,
    "build",
  );

  assert.equal(plan.kind, "document");
  assert.equal(plan.context.machine, "build");
  assert.deepEqual(plan.context.panes, ["build/a", "build/b", "build/c"]);
});

test("refuses missing focus, stale pane counts, duplicate identities, and oversized layouts", () => {
  assert.equal(sizingPlan(null, tab, panes).kind, "unsupported");
  assert.equal(sizingPlan(focus(), undefined, panes).kind, "unsupported");
  assert.equal(sizingPlan(focus("missing"), tab, panes).kind, "unsupported");
  assert.equal(sizingPlan(focus(), { ...tab, panes: 2 }, panes).kind, "unsupported");
  assert.equal(sizingPlan(focus(), tab, [panes[0], panes[0], panes[2]]).kind, "unsupported");
  const oversized = Array.from({ length: 65 }, (_, index) => ({
    ...panes[0],
    pane: `p${index}`,
    terminal: `t${index}`,
  }));
  const oversizedFocus = { ...focus(), pane: "p0", terminal: "t0" };
  assert.equal(sizingPlan(oversizedFocus, { ...tab, panes: 65 }, oversized).kind, "unsupported");
});

test("refuses zoomed, replaced, and non-terminal panes", () => {
  const cases = [
    [focus(), { ...tab, zoomed: true }, panes],
    [{ ...focus(), shown: "replacement" }, tab, panes],
    [{ ...focus(), terminal: "stale-terminal" }, tab, panes],
    [focus(), tab, [panes[0], { ...panes[1], zoomed: true }, panes[2]]],
    [focus(), tab, [panes[0], { ...panes[1], terminal: null, mod: "editor" }, panes[2]]],
  ];
  for (const args of cases) assert.equal(sizingPlan(...args).kind, "unsupported");
});
