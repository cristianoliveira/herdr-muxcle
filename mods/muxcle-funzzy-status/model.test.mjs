import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PROJECTS,
  isUnsupportedCli,
  layoutHasMod,
  observeSnapshot,
  parseCapabilities,
  parseStatus,
  persistCursors,
  projectKey,
  projectLabel,
  restoreCursors,
  statusColor,
  watcherBinary,
} from "../../.build/mods/muxcle-funzzy-status/model.js";

const capabilities = (overrides = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    instance: { token: "fz-one" },
    methods: ["status", "capabilities"],
    ...overrides,
  });
const snapshot = (generation, state, failures = []) => ({
  generation,
  state,
  failures: failures.length,
});

test("projects are identified by exact machine and folder, including target home", () => {
  assert.equal(projectKey({ machine: null, folder: "/work/app" }), projectKey({ machine: null, folder: "/work/app" }));
  assert.notEqual(
    projectKey({ machine: "build-box", folder: "/work/app" }),
    projectKey({ machine: null, folder: "/work/app" }),
  );
  assert.notEqual(
    projectKey({ machine: "build-box", folder: "/work/app" }),
    projectKey({ machine: "test-box", folder: "/work/app" }),
  );
  assert.notEqual(
    projectKey({ machine: "build-box", folder: "" }),
    projectKey({ machine: "build-box", folder: "/Users/person" }),
  );
});

test("capabilities require a supported control schema and status method", () => {
  assert.deepEqual(parseCapabilities(capabilities()), { kind: "ok", value: { instance: "fz-one" } });
  assert.deepEqual(parseCapabilities(capabilities({ schemaVersion: 2 })), { kind: "unsupported" });
  assert.deepEqual(parseCapabilities(capabilities({ methods: ["capabilities"] })), { kind: "unsupported" });
  assert.deepEqual(parseCapabilities("not json"), { kind: "invalid" });
  assert.deepEqual(parseCapabilities(capabilities({ instance: {} })), { kind: "invalid" });
  assert.deepEqual(parseCapabilities(capabilities({ methods: ["status", 4] })), { kind: "invalid" });
});

test("unsupported CLI recognition is narrow and does not classify connection failures", () => {
  assert.equal(isUnsupportedCli("error: unrecognized subcommand 'control'"), true);
  assert.equal(isUnsupportedCli("error: unexpected argument '--format' found"), true);
  assert.equal(isUnsupportedCli("could not connect to control socket"), false);
  assert.equal(isUnsupportedCli("watcher is unavailable"), false);
  assert.equal(isUnsupportedCli(`${"x".repeat(4096)} unexpected argument '--format' found`), false);
});

test("project labels are bounded, path-based, and strip control characters", () => {
  assert.equal(projectLabel({ machine: null, folder: "/work/app\n" }), "local · app");
  const label = projectLabel({ machine: "build\n-box", folder: `/work/${"project".repeat(20)}` });
  assert.equal(label.includes("\n"), false);
  assert.ok(label.length <= 96);
});

test("status validates required fields and retains only failure count", () => {
  const parsed = parseStatus(
    JSON.stringify({
      generation: 12,
      state: "failed",
      failures: ["secret command and output"],
      commands: ["never display this"],
    }),
  );

  assert.deepEqual(parsed, { kind: "ok", value: snapshot(12, "failed", ["secret command and output"]) });
  assert.deepEqual(parseStatus(JSON.stringify({ generation: -1, state: "passed", failures: [] })), { kind: "invalid" });
  assert.deepEqual(parseStatus(JSON.stringify({ generation: 1, state: "unknown", failures: [] })), { kind: "invalid" });
  assert.deepEqual(parseStatus(JSON.stringify({ generation: 1, state: "passed", failures: [null] })), {
    kind: "invalid",
  });
  assert.deepEqual(parseStatus("{"), { kind: "invalid" });
});

test("initial and restarted watcher instances establish silent baselines", () => {
  const first = observeSnapshot(undefined, snapshot(4, "failed"), "fz-one", false);
  const restarted = observeSnapshot(first.cursor, snapshot(1, "passed"), "fz-two", false);

  assert.equal(first.notify, false);
  assert.equal(first.cursor.lastNotifiedGeneration, 4);
  assert.equal(restarted.notify, false);
  assert.equal(restarted.cursor.instance, "fz-two");
  assert.equal(restarted.cursor.lastNotifiedGeneration, 1);
});

test("new terminal generations notify once, including completion of an observed running generation", () => {
  const baseline = observeSnapshot(undefined, snapshot(7, "running"), "fz-one", false).cursor;
  const passed = observeSnapshot(baseline, snapshot(7, "passed"), "fz-one", false);
  const repeated = observeSnapshot(passed.cursor, snapshot(7, "passed"), "fz-one", false);
  const next = observeSnapshot(repeated.cursor, snapshot(8, "failed"), "fz-one", false);

  assert.equal(passed.notify, true);
  assert.equal(repeated.notify, false);
  assert.equal(next.notify, true);
});

test("app restart suppresses its first observation while advancing dedup metadata", () => {
  const previous = observeSnapshot(undefined, snapshot(2, "passed"), "fz-one", false).cursor;
  const resumed = observeSnapshot(previous, snapshot(3, "failed"), "fz-one", true);
  const next = observeSnapshot(resumed.cursor, snapshot(4, "passed"), "fz-one", false);

  assert.equal(resumed.notify, false);
  assert.equal(resumed.cursor.lastNotifiedGeneration, 3);
  assert.equal(next.notify, true);
});

test("generation regression is rejected without changing the cursor", () => {
  const previous = observeSnapshot(undefined, snapshot(9, "running"), "fz-one", false).cursor;
  const regressed = observeSnapshot(previous, snapshot(8, "passed"), "fz-one", false);

  assert.equal(regressed.invalid, true);
  assert.equal(regressed.notify, false);
  assert.equal(regressed.cursor, previous);
});

test("cursor state round-trips and remains bounded", () => {
  const cursors = new Map();
  for (let index = 0; index < MAX_PROJECTS + 10; index += 1) {
    const identity = { machine: null, folder: `/work/${index}` };
    cursors.set(projectKey(identity), {
      instance: "fz-one",
      generation: index,
      state: "running",
      lastNotifiedGeneration: null,
    });
  }

  const stored = persistCursors(cursors);
  const restored = restoreCursors(stored);
  assert.equal(stored.entries.length, MAX_PROJECTS);
  assert.equal(restored.size, MAX_PROJECTS);
  assert.deepEqual(restoreCursors({ schema: 2, entries: stored.entries }), new Map());
  assert.equal(
    restoreCursors({
      schema: 1,
      entries: [{ machine: null, folder: "x", cursor: { ...stored.entries[0].cursor, state: "invalid" } }],
    }).size,
    0,
  );

  const identity = { machine: "build-box", folder: "/work/app" };
  const cursor = {
    instance: "fz-one",
    generation: 4,
    state: "failed",
    lastNotifiedGeneration: 4,
    output: "PRIVATE_FIXTURE".repeat(1000),
    commands: ["PRIVATE_COMMAND"],
  };
  const sanitizedRestored = restoreCursors({ schema: 1, entries: [{ ...identity, cursor }] });
  assert.deepEqual(sanitizedRestored.get(projectKey(identity)), {
    instance: "fz-one",
    generation: 4,
    state: "failed",
    lastNotifiedGeneration: 4,
  });
  const sanitized = persistCursors(new Map([[projectKey(identity), cursor]]));
  assert.equal(JSON.stringify(sanitized).includes("PRIVATE_"), false);
  assert.ok(JSON.stringify(sanitized).length < 1000);
});

test("layout activation follows a nested mounted mod block only", () => {
  assert.equal(
    layoutHasMod(
      { children: [{ content: { mod: "other" } }, { content: { mod: "muxcle-funzzy-status" } }] },
      "muxcle-funzzy-status",
    ),
    true,
  );
  assert.equal(layoutHasMod({ children: [{ content: { mod: "other" } }] }, "muxcle-funzzy-status"), false);
  assert.equal(layoutHasMod(null, "muxcle-funzzy-status"), false);
});

test("binary defaults are portable and only expand local-home shortcuts", () => {
  assert.equal(watcherBinary(undefined, "/home/person"), "fzz");
  assert.equal(watcherBinary("~/bin/fzz", "/home/person"), "/home/person/bin/fzz");
  assert.equal(watcherBinary("/opt/tools/fzz", "/home/person"), "/opt/tools/fzz");
});

test("status colors stay within the theme palette", () => {
  const theme = { ansi1: "red", ansi2: "green", ansi4: "blue", muted: "gray" };
  assert.deepEqual(
    ["running", "passed", "failed", "idle"].map((state) => statusColor(state, theme)),
    ["blue", "green", "red", "gray"],
  );
});
