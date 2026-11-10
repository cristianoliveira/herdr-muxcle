import assert from "node:assert/strict";
import test from "node:test";
import {
  captureReview,
  closerKeyAction,
  filterSpaces,
  reviewStillMatches,
  SpaceCloserModel,
} from "../../.build/mods/muxcle-space-closer/model.js";

const spaces = [
  {
    id: "local-space",
    name: "Local project",
    folder: "/work/local",
    machine: null,
    tabs: [{ id: "local-tab", name: "Editor", panes: 2 }],
  },
  {
    id: "build/remote-space",
    name: "Remote project",
    folder: "/srv/project",
    machine: "build",
    tabs: [
      { id: "build/tab-one", name: "Shell", panes: 1 },
      { id: "build/tab-two", name: "Tests", panes: 3 },
    ],
  },
];
const layouts = [
  { name: null, layout: "ready" },
  { name: "build", layout: "ready" },
];
const peers = [{ id: "core-build-1", name: "build", state: "connected" }];
const state = (overrides = {}) => ({ spaces, layouts, peers, ...overrides });

test("Enter never confirms outside selection; Escape only cancels", () => {
  assert.equal(closerKeyAction("selecting", "enter"), "pass");
  assert.equal(closerKeyAction("reviewing", "enter"), "ignore");
  assert.equal(closerKeyAction("checking-confirm", "ctrl-enter"), "ignore");
  assert.equal(closerKeyAction("submitted", "return"), "ignore");
  assert.equal(closerKeyAction("reviewing", "escape"), "cancel");
});

test("filters by name, machine, and folder without mutating hidden selections", () => {
  const model = new SpaceCloserModel();
  assert.equal(model.toggle("local-space", spaces), true);
  assert.equal(model.toggle("build/remote-space", spaces), true);
  assert.deepEqual(filterSpaces(spaces, "REMOTE build /srv"), [spaces[1]]);
  assert.deepEqual(filterSpaces(spaces, "local /work"), [spaces[0]]);
  assert.deepEqual(filterSpaces(spaces, "no-match"), []);
  assert.equal(model.selectedIds.has("local-space"), true);
  assert.equal(model.selectedIds.has("build/remote-space"), true);
});

test("review captures exact space, peer, tab IDs and pane counts as immutable values", () => {
  const result = captureReview(spaces, ["build/remote-space"], layouts, peers);
  assert.equal(result.kind, "ready");
  assert.deepEqual(result.review, [
    {
      id: "build/remote-space",
      name: "Remote project",
      folder: "/srv/project",
      machine: "build",
      peerId: "core-build-1",
      tabs: [
        { id: "build/tab-one", name: "Shell", panes: 1 },
        { id: "build/tab-two", name: "Tests", panes: 3 },
      ],
    },
  ]);
  assert.equal(Object.isFrozen(result.review), true);
  assert.equal(Object.isFrozen(result.review[0].tabs), true);
  assert.equal(Object.isFrozen(result.review[0].tabs[0]), true);

  spaces[1].tabs[0].panes = 99;
  assert.equal(result.review[0].tabs[0].panes, 1);
  spaces[1].tabs[0].panes = 1;
});

test("new arrivals do not invalidate review, but reviewed data changes do", () => {
  const result = captureReview(spaces, ["local-space", "build/remote-space"], layouts, peers);
  assert.equal(result.kind, "ready");
  assert.equal(
    reviewStillMatches(
      result.review,
      state({ spaces: [...spaces, { id: "new", name: "New", folder: "/new", machine: null, tabs: [] }] }),
    ),
    true,
  );

  const changed = [
    [{ ...spaces[0], name: "Renamed" }, spaces[1]],
    [{ ...spaces[0], machine: "build" }, spaces[1]],
    [{ ...spaces[0], tabs: [{ id: "new-tab", name: "Editor", panes: 2 }] }, spaces[1]],
    [{ ...spaces[0], tabs: [{ ...spaces[0].tabs[0], panes: 4 }] }, spaces[1]],
    [spaces[1]],
  ];
  for (const currentSpaces of changed) {
    assert.equal(reviewStillMatches(result.review, state({ spaces: currentSpaces })), false);
  }
});

test("remote alias retarget and unavailable layouts fail revalidation", () => {
  const result = captureReview(spaces, ["build/remote-space"], layouts, peers);
  assert.equal(result.kind, "ready");
  assert.equal(
    reviewStillMatches(result.review, state({ peers: [{ id: "core-build-2", name: "build", state: "connected" }] })),
    false,
  );
  assert.equal(
    reviewStillMatches(result.review, state({ peers: [{ id: "core-build-1", name: "build", state: "offline" }] })),
    false,
  );
  assert.equal(
    reviewStillMatches(
      result.review,
      state({
        layouts: [
          { name: null, layout: "ready" },
          { name: "build", layout: "unavailable" },
        ],
      }),
    ),
    false,
  );
});

test("missing targets, duplicate IDs, and unknown machine identities fail closed", () => {
  assert.equal(captureReview(spaces, ["gone"], layouts, peers).kind, "missing");
  assert.equal(captureReview([spaces[0], spaces[0]], ["local-space"], layouts, peers).kind, "unavailable");
  assert.equal(captureReview(spaces, ["build/remote-space"], layouts, []).kind, "unavailable");
  assert.equal(captureReview(spaces, ["build/remote-space"], layouts, null).kind, "unavailable");
  assert.equal(captureReview(spaces, ["local-space"], [{ name: null, layout: "unavailable" }], []).kind, "unavailable");
});
