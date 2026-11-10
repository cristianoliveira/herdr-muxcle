import assert from "node:assert/strict";
import test from "node:test";
import {
  dismissEvent,
  dismissEvents,
  emptyState,
  filterEvents,
  jumpCommand,
  observeEvents,
  restoreState,
} from "../../.build/mods/muxcle-agent-intray/model.js";

const agent = (address, status, seq = 1, labels = {}) => ({
  address,
  status,
  seq,
  title: labels.title ?? `Task ${address}`,
  space_name: labels.space_name ?? "Project",
  tab_name: labels.tab_name ?? "Work",
});

test("records observed attention transitions newest first with deterministic sequence and duplicate ordering", () => {
  const state = observeEvents(emptyState(), [
    agent("older", "done", 2),
    agent("newer", "blocked", 5),
    agent("busy", "working", 9),
    agent("same-sequence-b", "done", 5),
    agent("same-sequence-a", "blocked", 5),
    agent("duplicate", "done", 7),
    agent("duplicate", "blocked", 7),
  ]);

  assert.deepEqual(
    state.events.map(({ address, status }) => [address, status]),
    [
      ["duplicate", "blocked"],
      ["newer", "blocked"],
      ["same-sequence-a", "blocked"],
      ["same-sequence-b", "done"],
      ["older", "done"],
    ],
  );
  assert.deepEqual(
    restoreState(JSON.stringify(state)).events.map((event) => event.address),
    state.events.map((event) => event.address),
  );
});

test("unchanged reports and acknowledgement to idle do not recreate or erase unread events", () => {
  const first = observeEvents(emptyState(), [agent("one", "done")]);

  assert.equal(observeEvents(first, [agent("one", "done", 4)]), first);
  const acknowledged = observeEvents(first, [agent("one", "idle", 5)]);
  assert.deepEqual(acknowledged.events, first.events);
  assert.deepEqual(observeEvents(acknowledged, [agent("one", "idle", 6)]), acknowledged);
});

test("a later attention transition gets a new event while retaining the earlier unread event", () => {
  const first = observeEvents(emptyState(), [agent("one", "done")]);
  const working = observeEvents(first, [agent("one", "working", 2)]);
  const next = observeEvents(working, [agent("one", "blocked", 3)]);

  assert.equal(next.events.length, 2);
  assert.notEqual(next.events[0].id, next.events[1].id);
  assert.deepEqual(
    next.events.map((event) => event.status),
    ["blocked", "done"],
  );
});

test("empty startup snapshots retain remembered status", () => {
  const first = observeEvents(emptyState(), [agent("one", "done")]);
  const resumed = observeEvents(observeEvents(first, []), [agent("one", "done")]);

  assert.equal(resumed.events.length, 1);
});

test("unread events and remembered labels stay bounded", () => {
  const agents = Array.from({ length: 1_100 }, (_, index) => agent(`t${index}`, "done", index));
  const state = observeEvents(emptyState(), agents);

  assert.equal(state.events.length, 100);
  assert.equal(state.seen.length, 1_000);
  assert.equal(state.events[0].address, "t1099");
  assert.ok(state.seen.every((seen) => seen.title.length <= 240 && seen.space.length <= 240 && seen.tab.length <= 240));
});

test("restore rejects malformed, oversized, unsafe, and ambiguous persisted state", () => {
  const state = observeEvents(emptyState(), [agent("one", "blocked")]);
  const duplicateIds = { ...state, events: [...state.events, ...state.events] };

  assert.deepEqual(restoreState(state), state);
  assert.equal(restoreState(duplicateIds).events.length, 1);
  for (const invalid of [
    null,
    "broken",
    "null",
    { version: 9 },
    { schema: 1, events: {}, seen: [] },
    " ".repeat(3_000_001),
  ]) {
    assert.deepEqual(restoreState(invalid), emptyState());
  }
  assert.deepEqual(restoreState({ ...state, serial: Number.MAX_SAFE_INTEGER }), emptyState());
});

test("restore canonicalizes newest events and de-duplicates remembered addresses", () => {
  const raw = {
    schema: 1,
    serial: 4,
    seen: [
      { address: "one", status: "done", title: "old", space: "P", tab: "A" },
      { address: "one", status: "blocked", title: "new", space: "P", tab: "B" },
    ],
    events: [
      { id: 2, address: "two", status: "done" },
      { id: 4, address: "four", status: "blocked" },
      { id: 3, address: "three", status: "done" },
    ],
  };

  const state = restoreState(raw);
  assert.deepEqual(
    state.events.map((event) => event.id),
    [4, 3, 2],
  );
  assert.equal(state.seen.length, 1);
  assert.equal(state.seen[0].status, "blocked");
  assert.equal(state.seen[0].title, "new");
});

test("labels are bounded literal display text and invalid agent reports are ignored", () => {
  const state = observeEvents(emptyState(), [
    null,
    agent("", "done"),
    agent("bad", "error"),
    agent("invalid", "done", Number.NaN),
    agent("negative", "done", -1),
    { ...agent("safe", "done"), title: "$(touch /tmp/nope)\u0000" + "x".repeat(500) },
  ]);

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].title.length, 240);
  assert.ok(state.events[0].title.startsWith("$(touch /tmp/nope) "));
  assert.doesNotMatch(state.events[0].title, /[\u0000-\u001f\u007f]/);
});

test("dismissal preserves other events, observation history, and future repeat suppression", () => {
  const first = observeEvents(emptyState(), [agent("one", "done"), agent("two", "blocked", 2)]);
  const read = dismissEvent(first, first.events[0].id);
  const restored = restoreState(read);
  const next = observeEvents(restored, [agent("one", "done"), agent("two", "blocked", 2)]);

  assert.deepEqual(
    next.events.map((event) => event.address),
    ["one"],
  );
  assert.equal(dismissEvents(next, []), next);
  assert.equal(dismissEvent(next, -1), next);
});

test("filters intersect with literal multiword search and keep newest-first order", () => {
  const events = [
    { id: 3, title: "Review", status: "blocked", space: "Wire", tab: "backend", address: "maya/t3" },
    { id: 2, title: "Review [v2]", status: "done", space: "Wire", tab: "frontend", address: "t2" },
    { id: 1, title: "Deploy", status: "done", space: "Personal", tab: "docs", address: "t1" },
  ];

  assert.deepEqual(
    filterEvents(events, "wire review", "done").map((event) => event.id),
    [2],
  );
  assert.deepEqual(
    filterEvents(events, "needs input", "blocked").map((event) => event.id),
    [3],
  );
  assert.deepEqual(
    filterEvents(events, "[v2]").map((event) => event.id),
    [2],
  );
  assert.deepEqual(filterEvents(events, ".*"), []);
  assert.deepEqual(filterEvents(events, "", "error"), []);
  assert.deepEqual(
    events.map((event) => event.id),
    [3, 2, 1],
  );
});

test("jump uses the exact live local or remote address and never invents an action", () => {
  assert.deepEqual(jumpCommand({ address: "machine/t1" }, [{ address: "machine/t1", state: "live" }]), [
    "agent.focus",
    { terminal: "machine/t1" },
  ]);
  assert.equal(jumpCommand({ address: "t1" }, [{ address: "machine/t1", state: "live" }]), null);
  assert.equal(jumpCommand({ address: "t1" }, [{ address: "t1", state: "finished" }]), null);
  assert.equal(jumpCommand(null, []), null);
});
