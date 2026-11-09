import assert from "node:assert/strict";
import test from "node:test";
import { matchesRecentTabsState, MAX_RECENT_TABS, observeRecentTabs } from "../../.build/mods/muxcle-history/model.js";

const space = (id, activeSpace, activeTab, tabIds = ["one", "two", "three"]) => ({
  id,
  active: activeSpace,
  tabs: tabIds.map((tabId) => ({ id: tabId, active: tabId === activeTab })),
});

test("tracks more than two observed live tabs and moves repeated visits to the front", () => {
  let state = null;
  for (const tab of ["one", "two", "three", "one"]) {
    state = observeRecentTabs(state, [space("local", true, tab)]);
  }

  assert.deepEqual(state, {
    schema: 1,
    visits: [
      { space: "local", tab: "one" },
      { space: "local", tab: "three" },
      { space: "local", tab: "two" },
    ],
  });
  assert.deepEqual(observeRecentTabs(state, [space("local", true, "one")]), state);
});

test("keeps machine-qualified identities distinct and prunes closed targets", () => {
  const state = {
    schema: 1,
    visits: [
      { space: "remote:project", tab: "remote:terminal" },
      { space: "local:project", tab: "local:terminal" },
      { space: "local:project", tab: "local:closed" },
      { space: "gone:space", tab: "gone:tab" },
    ],
  };
  const before = JSON.stringify(state);

  assert.deepEqual(
    observeRecentTabs(state, [
      space("local:project", true, "local:terminal", ["local:terminal"]),
      space("remote:project", false, null, ["remote:terminal"]),
    ]),
    {
      schema: 1,
      visits: [
        { space: "local:project", tab: "local:terminal" },
        { space: "remote:project", tab: "remote:terminal" },
      ],
    },
  );
  assert.equal(JSON.stringify(state), before);
});

test("inactive observations do not invent visits but still prune removed targets", () => {
  const previous = {
    schema: 1,
    visits: [
      { space: "local", tab: "one" },
      { space: "local", tab: "two" },
    ],
  };
  const inactive = [space("local", false, "three")];

  assert.deepEqual(observeRecentTabs(previous, inactive), {
    schema: 1,
    visits: [
      { space: "local", tab: "one" },
      { space: "local", tab: "two" },
    ],
  });
  assert.deepEqual(observeRecentTabs(previous, []), { schema: 1, visits: [] });
});

test("repairs malformed or old persistence without throwing", () => {
  const oldToggleState = { schema: 1, spaces: ["local", "other"], tabs: { local: ["one", "two"] } };
  for (const invalid of [
    null,
    [],
    { schema: 0, visits: [{ space: "a", tab: "b" }] },
    { schema: 1, visits: "bad" },
    oldToggleState,
  ]) {
    assert.deepEqual(observeRecentTabs(invalid, [space("local", false, null)]), { schema: 1, visits: [] });
  }

  const corrupted = {
    schema: 1,
    visits: [
      { space: "local", tab: "one" },
      { space: "", tab: "bad" },
      { space: "local", tab: "one" },
      { space: "local", tab: 4 },
      null,
    ],
  };
  const before = JSON.stringify(corrupted);
  assert.deepEqual(observeRecentTabs(corrupted, [space("local", true, "two", ["one", "two"])]), {
    schema: 1,
    visits: [
      { space: "local", tab: "two" },
      { space: "local", tab: "one" },
    ],
  });
  assert.equal(JSON.stringify(corrupted), before);
});

test("recognizes only the canonical persisted IDs and version fields", () => {
  const state = { schema: 1, visits: [{ space: "local", tab: "one" }] };

  assert.equal(matchesRecentTabsState(state, state), true);
  assert.equal(matchesRecentTabsState({ ...state, debug: "extra" }, state), false);
  assert.equal(
    matchesRecentTabsState({ schema: 1, visits: [{ ...state.visits[0], name: "sensitive" }] }, state),
    false,
  );
  assert.equal(matchesRecentTabsState({ schema: 2, visits: state.visits }, state), false);
});

test("bounds persisted recency to the newest live targets and stores IDs only", () => {
  const ids = Array.from({ length: MAX_RECENT_TABS + 2 }, (_, index) => `tab-${index}`);
  let state = null;
  for (const tab of ids) state = observeRecentTabs(state, [space("local", true, tab, ids)]);

  assert.equal(state.visits.length, MAX_RECENT_TABS);
  assert.deepEqual(state.visits[0], { space: "local", tab: ids.at(-1) });
  assert.deepEqual(state.visits.at(-1), { space: "local", tab: ids[2] });
  assert.deepEqual(Object.keys(state), ["schema", "visits"]);
  assert.deepEqual(Object.keys(state.visits[0]), ["space", "tab"]);
});
