import assert from "node:assert/strict";
import test from "node:test";
import { rotationPlan } from "../../.build/mods/muxcle-rotation/model.js";

const panes = [
  { pane: "a", terminal: "terminal-a", tab: "tab", zoomed: false },
  { pane: "b", terminal: "terminal-b", tab: "tab", zoomed: false },
];
const focus = (pane = "a") => ({ space: "space", tab: "tab", pane, terminal: `terminal-${pane}`, shown: null });
const tab = { id: "tab", panes: 2, zoomed: false };

function applyToSlots(plan, axis, initialFocus) {
  const slots = ["a", "b"];
  let focused = initialFocus;
  for (const action of plan.actions) {
    if (action.command === "pane.focus") {
      focused = action.args.pane;
      continue;
    }
    const index = slots.indexOf(focused);
    const forward = axis === "row" ? "right" : "down";
    const backward = axis === "row" ? "left" : "up";
    const direction = action.args.direction;
    const target = direction === forward ? index + 1 : direction === backward ? index - 1 : -1;
    if (target < 0 || target >= slots.length) continue;
    [slots[index], slots[target]] = [slots[target], slots[index]];
  }
  return { slots, focused };
}

test("swaps either split axis and keeps focus at the original screen position", () => {
  for (const axis of ["row", "column"]) {
    for (const originalFocus of ["a", "b"]) {
      const plan = rotationPlan(focus(originalFocus), tab, panes);
      assert.equal(plan.kind, "rotate");

      const applied = applyToSlots(plan, axis, originalFocus);

      assert.deepEqual(applied.slots, ["b", "a"]);
      assert.equal(applied.focused, originalFocus === "a" ? "b" : "a");
      assert.deepEqual(
        panes.map(({ pane }) => pane),
        ["a", "b"],
      );
    }
  }
});

test("qualifies target IDs and ignores panes in other tabs", () => {
  const remotePanes = panes.map((pane) => ({
    ...pane,
    pane: `remote:${pane.pane}`,
    terminal: `remote:${pane.terminal}`,
    tab: "remote:tab",
  }));
  const plan = rotationPlan(
    { space: "remote:space", tab: "remote:tab", pane: "remote:a", terminal: "remote:terminal-a", shown: null },
    { ...tab, id: "remote:tab" },
    [...panes, ...remotePanes],
  );

  assert.equal(plan.kind, "rotate");
  assert.deepEqual(plan.actions.at(-1), { command: "pane.focus", args: { pane: "remote:b" } });
});

test("a single ordinary pane is a no-op", () => {
  assert.equal(rotationPlan(focus(), { ...tab, panes: 1 }, panes.slice(0, 1)).kind, "noop");
});

test("refuses missing focus, stale counts, duplicate IDs, and larger layouts", () => {
  assert.equal(rotationPlan(null, tab, panes).kind, "unsupported");
  assert.equal(rotationPlan(focus(), undefined, panes).kind, "unsupported");
  assert.equal(rotationPlan(focus("missing"), tab, panes).kind, "unsupported");
  assert.equal(rotationPlan(focus(), { ...tab, panes: 3 }, panes).kind, "unsupported");
  assert.equal(rotationPlan(focus(), tab, [panes[0], panes[0]]).kind, "unsupported");
  const third = { ...panes[1], pane: "c", terminal: "terminal-c" };
  assert.equal(rotationPlan(focus(), { ...tab, panes: 3 }, [...panes, third]).kind, "unsupported");
});

test("refuses zoomed, replaced, and mod panes without planning writes", () => {
  const cases = [
    [focus(), { ...tab, zoomed: true }, panes],
    [{ ...focus(), shown: "replacement" }, tab, panes],
    [{ ...focus(), terminal: "replaced-terminal" }, tab, panes],
    [focus(), tab, [panes[0], { ...panes[1], zoomed: true }]],
    [focus(), tab, [panes[0], { ...panes[1], terminal: null, mod: "editor" }]],
  ];
  for (const args of cases) {
    const plan = rotationPlan(...args);
    assert.equal(plan.kind, "unsupported");
    assert.equal("actions" in plan, false);
  }
});
