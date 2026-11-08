import assert from "node:assert/strict";
import test from "node:test";
import { observeHistory, previousAction } from "../../.build/mods/muxcle-history/model.js";

const snapshot = (activeSpace = "one", activeTab = "a") => [
  {
    id: "one",
    active: activeSpace === "one",
    tabs: [
      { id: "a", active: activeTab === "a" },
      { id: "b", active: activeTab === "b" },
    ],
  },
  { id: "remote:two", active: activeSpace === "remote:two", tabs: [{ id: "remote:c", active: true }] },
];

test("first observation initializes history without inventing a previous target", () => {
  const state = observeHistory(null, snapshot());

  assert.deepEqual(state, { schema: 1, spaces: ["one"], tabs: { one: ["a"] } });
  assert.equal(previousAction("last-tab", state, snapshot()), null);
  assert.equal(previousAction("last-space", state, snapshot()), null);
  assert.deepEqual(observeHistory(state, snapshot()), state);
});

test("last-tab toggles between observed tabs independently for each space", () => {
  let state = observeHistory(null, snapshot());
  state = observeHistory(state, snapshot("one", "b"));

  assert.deepEqual(previousAction("last-tab", state, snapshot("one", "b")), {
    command: "tab.select",
    args: { id: "a" },
  });
  state = observeHistory(state, snapshot("one", "a"));
  assert.deepEqual(previousAction("last-tab", state, snapshot()), {
    command: "tab.select",
    args: { id: "b" },
  });

  state = observeHistory(state, snapshot("remote:two"));
  assert.equal(previousAction("last-tab", state, snapshot("remote:two")), null);
  assert.deepEqual(state.tabs.one, ["a", "b"]);
  assert.deepEqual(state.tabs["remote:two"], ["remote:c"]);
});

test("last-space preserves qualified IDs and follows observed focus only", () => {
  let state = observeHistory(null, snapshot());
  state = observeHistory(state, snapshot("remote:two"));

  assert.deepEqual(previousAction("last-space", state, snapshot("remote:two")), {
    command: "space.select",
    args: { id: "one" },
  });
  assert.deepEqual(previousAction("last-space", state, snapshot()), {
    command: "space.select",
    args: { id: "remote:two" },
  });
});

test("ignores unseen inactive tab changes and prunes removed tabs and spaces", () => {
  let state = observeHistory(null, snapshot());
  state = observeHistory(state, snapshot("one", "b"));
  state = observeHistory(state, snapshot("remote:two"));
  const closed = [{ id: "one", active: true, tabs: [{ id: "b", active: true }] }];

  assert.deepEqual(observeHistory(state, closed), {
    schema: 1,
    spaces: ["one"],
    tabs: { one: ["b"] },
  });
  assert.equal(previousAction("last-tab", state, closed), null);
  assert.equal(previousAction("last-space", state, closed), null);
  assert.deepEqual(observeHistory(state, snapshot("remote:two", "b")).tabs.one, ["b", "a"]);
});

test("retains only two visits and refuses navigation without an active space", () => {
  const moreTabs = (active) => [
    {
      id: "one",
      active: true,
      tabs: ["a", "b", "c"].map((id) => ({ id, active: id === active })),
    },
  ];
  let state = observeHistory(null, moreTabs("a"));
  state = observeHistory(state, moreTabs("b"));
  state = observeHistory(state, moreTabs("c"));

  assert.deepEqual(state.tabs.one, ["c", "b"]);
  const inactive = moreTabs("c").map((space) => ({ ...space, active: false }));
  assert.equal(previousAction("last-tab", state, inactive), null);
  assert.equal(previousAction("last-space", state, inactive), null);
});

test("serializes unchanged history canonically when native space order differs", () => {
  const spaces = [
    { id: "z", active: true, tabs: [{ id: "z-tab", active: true }] },
    { id: "a", active: false, tabs: [{ id: "a-tab", active: true }] },
  ];
  const persisted = { schema: 1, spaces: ["z", "a"], tabs: { a: ["a-tab"], z: ["z-tab"] } };

  assert.equal(JSON.stringify(observeHistory(persisted, spaces)), JSON.stringify(persisted));
});

test("malformed persisted state is reset and surviving visits are deduplicated", () => {
  for (const invalid of [null, [], { schema: 2 }, { schema: 1, spaces: "bad", tabs: [] }]) {
    assert.deepEqual(observeHistory(invalid, snapshot()), observeHistory(null, snapshot()));
  }
  const raw = { schema: 1, spaces: ["gone", "one", "one"], tabs: { one: ["b", "b", "a"], gone: ["x"] } };
  const before = JSON.stringify(raw);

  assert.deepEqual(observeHistory(raw, snapshot()), {
    schema: 1,
    spaces: ["one"],
    tabs: { one: ["a", "b"] },
  });
  assert.equal(JSON.stringify(raw), before);
  assert.deepEqual(observeHistory(raw, []), { schema: 1, spaces: [], tabs: {} });
});
