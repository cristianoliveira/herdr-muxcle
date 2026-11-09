import assert from "node:assert/strict";
import test from "node:test";
import {
  captureMoveTarget,
  folderTabName,
  moveToPosition,
  moveTabAction,
  positionMaximum,
  renameFromCwdAction,
} from "../../.build/mods/muxcle-tab-tools/model.js";

const spaces = [
  {
    id: "local",
    active: true,
    tabs: [
      { id: "first", active: false },
      { id: "middle", active: true },
      { id: "last", active: false },
    ],
  },
  {
    id: "server/space",
    active: false,
    tabs: [{ id: "server/tab", active: true }],
  },
];

const focus = (overrides = {}) => ({
  space: "local",
  tab: "middle",
  pane: "pane",
  terminal: "terminal",
  shown: null,
  cwd: "/work/project",
  ...overrides,
});

test("moves the active tab left or right using native one-based positions", () => {
  assert.deepEqual(moveTabAction(spaces, "left"), {
    command: "tab.move",
    args: { id: "middle", index: 1 },
  });
  assert.deepEqual(moveTabAction(spaces, "right"), {
    command: "tab.move",
    args: { id: "middle", index: 3 },
  });
});

test("does not wrap at either tab boundary or dispatch for an invalid snapshot", () => {
  const first = [{ ...spaces[0], tabs: spaces[0].tabs.map((tab, index) => ({ ...tab, active: index === 0 })) }];
  const last = [{ ...spaces[0], tabs: spaces[0].tabs.map((tab, index) => ({ ...tab, active: index === 2 })) }];

  assert.equal(moveTabAction(first, "left"), null);
  assert.equal(moveTabAction(last, "right"), null);
  assert.equal(moveTabAction([], "left"), null);
  assert.equal(moveTabAction([{ ...spaces[0], tabs: [] }], "right"), null);
});

test("captures the focused tab and space for a pinned position prompt", () => {
  assert.deepEqual(captureMoveTarget(focus(), spaces), { spaceId: "local", tabId: "middle" });
  assert.deepEqual(captureMoveTarget(focus({ space: "server/space", tab: "server/tab" }), spaces), {
    spaceId: "server/space",
    tabId: "server/tab",
  });
  assert.equal(captureMoveTarget(focus({ tab: "gone" }), spaces), null);
});

test("shows the current zero-based position bound and hides stale targets", () => {
  const target = { spaceId: "local", tabId: "middle" };
  assert.equal(positionMaximum(spaces, target), 2);
  assert.equal(positionMaximum([{ ...spaces[0], tabs: [] }], target), null);
  assert.equal(moveToPosition(spaces, { spaceId: "", tabId: "middle" }, "0").kind, "refused");
  assert.equal(moveToPosition(spaces, { spaceId: "local", tabId: "" }, "0").kind, "refused");
});

test("validates zero-based position against current tabs and translates to native index", () => {
  assert.deepEqual(moveToPosition(spaces, { spaceId: "local", tabId: "middle" }, "0"), {
    kind: "move",
    action: { command: "tab.move", args: { id: "middle", index: 1 } },
  });
  assert.deepEqual(moveToPosition(spaces, { spaceId: "local", tabId: "middle" }, "2"), {
    kind: "move",
    action: { command: "tab.move", args: { id: "middle", index: 3 } },
  });
  assert.deepEqual(moveToPosition(spaces, { spaceId: "local", tabId: "middle" }, "1"), { kind: "unchanged" });
  const remote = [
    {
      id: "server/space",
      active: true,
      tabs: [
        { id: "server/other", active: false },
        { id: "server/tab", active: true },
      ],
    },
  ];
  assert.deepEqual(moveToPosition(remote, { spaceId: "server/space", tabId: "server/tab" }, "0"), {
    kind: "move",
    action: { command: "tab.move", args: { id: "server/tab", index: 1 } },
  });
});

test("rechecks a pinned tab and the current tab count before dispatch", () => {
  const target = { spaceId: "local", tabId: "middle" };
  const changedFocus = [
    { ...spaces[0], active: false },
    { ...spaces[1], active: true },
  ];
  assert.deepEqual(moveToPosition(changedFocus, target, "2"), {
    kind: "move",
    action: { command: "tab.move", args: { id: "middle", index: 3 } },
  });

  const removed = [{ ...spaces[0], tabs: spaces[0].tabs.filter((tab) => tab.id !== "middle") }];
  assert.equal(moveToPosition(removed, target, "0").kind, "refused");
  const movedToOtherSpace = [
    { ...spaces[0], tabs: spaces[0].tabs.filter((tab) => tab.id !== "middle") },
    { ...spaces[1], tabs: [...spaces[1].tabs, { id: "middle", active: true }] },
  ];
  assert.equal(moveToPosition(movedToOtherSpace, target, "0").kind, "refused");

  const twoTabs = [{ ...spaces[0], tabs: spaces[0].tabs.slice(0, 2) }];
  assert.equal(moveToPosition(twoTabs, target, "2").kind, "refused");
});

test("rejects blank, signed, fractional, exponential, whitespace, unsafe, and oversized input", () => {
  const target = { spaceId: "local", tabId: "middle" };
  for (const value of ["", "-1", "+1", "1.5", "1e2", " 1", "1 ", "9007199254740992", "00000000000000000"]) {
    assert.equal(moveToPosition(spaces, target, value).kind, "refused", value);
  }
});

test("folder names handle roots, trailing separators, and Unicode without normalization", () => {
  const decomposed = "Cafe\u0301";
  assert.equal(folderTabName("/"), "/");
  assert.equal(folderTabName("////"), "/");
  assert.equal(folderTabName("/work/project///"), "project");
  assert.equal(folderTabName(`/work/${decomposed}/`), decomposed);
  assert.equal(folderTabName(null), null);
  assert.equal(folderTabName(""), null);
});

test("renames from the focused terminal cwd while preserving the machine-qualified tab id", () => {
  assert.deepEqual(
    renameFromCwdAction(focus({ space: "server/space", tab: "server/tab", cwd: "/srv/ma\u0308ine/" }), spaces),
    { command: "tab.rename", args: { id: "server/tab", name: "ma\u0308ine" } },
  );
});

test("refuses folder naming without an ordinary focused terminal, cwd, or live tab", () => {
  for (const item of [
    focus({ terminal: null }),
    focus({ shown: "replacement" }),
    focus({ cwd: null }),
    focus({ cwd: "" }),
    focus({ tab: "removed" }),
    null,
  ]) {
    assert.equal(renameFromCwdAction(item, spaces), null);
  }
});
