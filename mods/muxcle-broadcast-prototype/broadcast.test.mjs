import assert from "node:assert/strict";
import test from "node:test";
import {
  BROADCAST_ACTIVE_KEY,
  BROADCAST_LABEL,
  broadcastHelperArgs,
  broadcastOverlay,
  broadcastReadyFile,
  checkBroadcastDependencies,
  launchBroadcast,
  broadcastPlan,
  broadcastRunArgs,
  captureBroadcastTargets,
  waitForBroadcastReady,
} from "../../.build/mods/muxcle-broadcast-prototype/broadcast.js";

const focus = { space: "local", tab: "tab1", pane: "p1", terminal: "t1", shown: null };
const spaces = [{ id: "local", machine: null, active: true, tabs: [{ id: "tab1", active: true }] }];
const panes = [
  { pane: "p1", terminal: "t1", tab: "tab1" },
  { pane: "p2", terminal: "t2", tab: "tab1" },
  { pane: "p3", terminal: null, mod: "toolbar", tab: "tab1" },
  { pane: "p4", terminal: "t3", tab: "other" },
];
const terminals = ["t1", "t2"].map((address) => ({ address, state: "live" }));
const capture = () => captureBroadcastTargets(focus, spaces, panes, terminals);

function plan() {
  return broadcastPlan(capture(), "/home/user/.config/herdr-app/", "/home/user/", "a".repeat(32));
}

test("captures one reviewed frozen set of live local ordinary panes in active tab order", () => {
  assert.deepEqual(capture(), {
    space: "local",
    tab: "tab1",
    targets: [
      { pane: "p1", terminal: "t1" },
      { pane: "p2", terminal: "t2" },
    ],
  });
});

test("refuses remote, mod, popup, swapped, and malformed focus references", () => {
  for (const bad of [
    { ...focus, space: "remote/space" },
    { ...focus, pane: null },
    { ...focus, terminal: "host/t1" },
    { ...focus, shown: "t2" },
    { ...focus, terminal: "not-a-terminal" },
  ]) {
    assert.throws(() => captureBroadcastTargets(bad, spaces, panes, terminals));
  }
  assert.throws(() => captureBroadcastTargets(null, spaces, panes, terminals));
});

test("refuses inactive or remote spaces and tabs", () => {
  assert.throws(() => captureBroadcastTargets(focus, [{ ...spaces[0], machine: "host" }], panes, terminals));
  assert.throws(() => captureBroadcastTargets(focus, [{ ...spaces[0], active: false }], panes, terminals));
  assert.throws(() =>
    captureBroadcastTargets(focus, [{ ...spaces[0], tabs: [{ id: "tab1", active: false }] }], panes, terminals),
  );
});

test("refuses invalid and duplicate pane or terminal references instead of deduplicating", () => {
  assert.throws(
    () => captureBroadcastTargets(focus, spaces, [...panes, { pane: "p1", terminal: "t3", tab: "tab1" }], terminals),
    /duplicate/i,
  );
  assert.throws(
    () => captureBroadcastTargets(focus, spaces, [...panes, { pane: "p3", terminal: "t1", tab: "tab1" }], terminals),
    /duplicate/i,
  );
  assert.throws(
    () => captureBroadcastTargets(focus, spaces, [{ ...panes[0], mod: "popup" }, panes[1]], terminals),
    /non-ordinary/i,
  );
});

test("requires exactly 2–8 unique live targets and one current record per target", () => {
  assert.throws(() => captureBroadcastTargets(focus, spaces, [panes[0]], terminals), /2–8/);
  const eightPanes = Array.from({ length: 8 }, (_, index) => ({
    pane: `p${index + 1}`,
    terminal: `t${index + 1}`,
    tab: "tab1",
  }));
  const eightTerminals = eightPanes.map(({ terminal }) => ({ address: terminal, state: "live" }));
  assert.doesNotThrow(() => captureBroadcastTargets(focus, spaces, eightPanes, eightTerminals));
  const ninePanes = [...eightPanes, { pane: "p9", terminal: "t9", tab: "tab1" }];
  assert.throws(
    () => captureBroadcastTargets(focus, spaces, ninePanes, [...eightTerminals, { address: "t9", state: "live" }]),
    /2–8/,
  );
  assert.throws(
    () => captureBroadcastTargets(focus, spaces, panes, [...terminals, { address: "t1", state: "live" }]),
    /exactly one live/,
  );
  assert.throws(
    () => captureBroadcastTargets(focus, spaces, panes, [{ ...terminals[0], state: "finished" }, terminals[1]]),
    /live/,
  );
});

test("builds a dedicated prototype command with reviewed scope and explicit dependencies", () => {
  const selected = plan();
  assert.equal(selected.coreId, "a".repeat(32));
  assert.equal(selected.cwd, "/home/user");
  assert.equal(selected.script, "/home/user/.config/herdr-app/mods/muxcle-broadcast-prototype/broadcast.py");
  assert.deepEqual(selected.dependencies, ["python3", "hc", "herdr-app"]);
  assert.deepEqual(selected.command, ["python3", "-E", "-s", selected.script]);
  assert.deepEqual(selected.args, [
    "--targets",
    JSON.stringify(capture().targets),
    "--space",
    "local",
    "--tab",
    "tab1",
    "--core-id",
    "a".repeat(32),
    "--app-home",
    "/home/user/.config/herdr-app",
  ]);
  assert.deepEqual(selected.targets, capture().targets);
  assert.throws(() => broadcastPlan(capture(), "relative", "/home/user", "bad"));
});

test("starts one owned removable helper without taking target ownership", () => {
  const args = broadcastRunArgs(plan(), "token-12345678");
  assert.ok(args.includes("--bg"));
  assert.ok(args.includes("--no-parent"));
  assert.ok(args.includes("--no-notify"));
  assert.ok(args.includes("--rm"));
  assert.ok(args.includes(`${BROADCAST_LABEL}=token-12345678`));
  assert.ok(!args.includes("--keep"));
  assert.deepEqual(broadcastHelperArgs(plan(), "token-12345678").slice(-4), [
    "--ready-file",
    "/home/user/.muxcle-broadcast-token-12345678/ready",
    "--ready-token",
    "token-12345678",
  ]);
  assert.equal(broadcastReadyFile(plan(), "token-12345678"), "/home/user/.muxcle-broadcast-token-12345678/ready");
  assert.throws(() => broadcastRunArgs(plan(), "bad token"), /token/);
});

test("waits for a process-bound raw/noecho marker before exposing the helper", async () => {
  const session = { address: "t99", token: "token-12345678", pid: 4242 };
  let call;
  const ready = await waitForBroadcastReady(
    session,
    plan(),
    async (command, args, options) => {
      call = { command, args, options };
      return { code: 0, stdout: "ready\n", stderr: "" };
    },
    () => false,
  );
  assert.equal(ready, true);
  assert.equal(call.command, "python3");
  assert.equal(call.options.timeout, 12_000);
  assert.deepEqual(call.args.slice(-2), ["/home/user/.muxcle-broadcast-token-12345678/ready", "token-12345678:4242"]);
  assert.equal(
    await waitForBroadcastReady(
      session,
      plan(),
      async () => ({ code: 1, stdout: "", stderr: "" }),
      () => false,
    ),
    false,
  );
  assert.equal(
    await waitForBroadcastReady(
      session,
      plan(),
      async () => ({ code: 0, stdout: "ready", stderr: "" }),
      () => true,
    ),
    false,
  );
});

test("uses millisecond dependency timeouts and stops on either missing prerequisite", async () => {
  const calls = [];
  await checkBroadcastDependencies(plan(), async (command, args, options) => {
    calls.push({ command, args, options });
    return { code: 0, stdout: "", stderr: "" };
  });
  assert.deepEqual(
    calls.map(({ options }) => options.timeout),
    [5000, 5000],
  );
  assert.ok(calls.every(({ options }) => options.cwd === "/home/user"));

  await assert.rejects(
    checkBroadcastDependencies(plan(), async () => ({ code: 1, stdout: "", stderr: "missing" })),
    /helper is missing/,
  );
  let pythonChecks = 0;
  await assert.rejects(
    checkBroadcastDependencies(plan(), async (command) => {
      pythonChecks += 1;
      return { code: command === "python3" ? 1 : 0, stdout: "", stderr: "missing curses" };
    }),
    /Python 3 with the standard curses module/,
  );
  assert.equal(pythonChecks, 2);
});

test("persists launch receipts, blocks unknown outcomes, and reconciles only verified helpers", async () => {
  assert.equal(BROADCAST_ACTIVE_KEY, "muxcle.broadcast-prototype.active.v1");
  const calls = { launches: 0, inspections: 0, readiness: 0, opens: 0, order: [] };
  let record = null;
  const io = {
    active: () => record,
    claimActive: (value) => {
      if (record !== null) return false;
      record = value;
      return true;
    },
    setActive: (value) => {
      if (record?.token !== value.token) return false;
      record = value;
      return true;
    },
    clearActive: (selectedToken) => {
      if (record?.token === selectedToken) record = null;
    },
    launch: async () => {
      calls.launches += 1;
      return "t99";
    },
    inspect: async () => {
      calls.inspections += 1;
      calls.order.push("inspect");
      return { kind: "live-owned", pid: 99, createdMs: 1234 };
    },
    waitReady: async () => {
      calls.readiness += 1;
      calls.order.push("raw-noecho-ready");
      return true;
    },
    open: () => {
      calls.opens += 1;
      calls.order.push("open");
      return "overlay-1";
    },
    cancelled: () => false,
  };

  const opened = await launchBroadcast(true, async () => plan(), io, "token-12345678");
  assert.equal(opened.kind, "opened");
  assert.equal(record.phase, "active");
  assert.deepEqual(record.session, { address: "t99", token: "token-12345678", pid: 99, createdMs: 1234 });
  assert.equal(calls.launches, 1);
  assert.deepEqual(calls.order, ["inspect", "raw-noecho-ready", "open"]);

  const reopened = await launchBroadcast(true, async () => plan(), io, "token-other-1234");
  assert.equal(reopened.kind, "opened-existing");
  assert.equal(calls.launches, 1);
  assert.equal(calls.opens, 2);
  assert.equal(calls.readiness, 2);

  record = null;
  const blockedIO = {
    ...io,
    claimActive: (value) => {
      record = value;
      return true;
    },
    setActive: (value) => {
      record = value;
      return true;
    },
    launch: async () => "t101",
    waitReady: async () => false,
  };
  const blocked = await launchBroadcast(true, async () => plan(), blockedIO, "token-not-ready-123");
  assert.equal(blocked.kind, "left-running");
  assert.equal(calls.opens, 2);
  assert.equal(record.phase, "uncertain");

  const otherScope = { ...plan(), tab: "tab2" };
  await assert.rejects(
    launchBroadcast(true, async () => otherScope, io, "token-other-1234"),
    /another frozen scope/,
  );
  assert.equal(calls.launches, 1);
});

test("unknown and cancelled asynchronous launches leave receipts and block accidental retries", async () => {
  let resolvedBeforeStart = false;
  const cancelledBeforeStart = await launchBroadcast(
    true,
    async () => {
      resolvedBeforeStart = true;
      return plan();
    },
    { cancelled: () => true },
    "token-before-start-123",
  );
  assert.equal(cancelledBeforeStart, null);
  assert.equal(resolvedBeforeStart, false);

  let record = null;
  let launchCount = 0;
  const io = {
    active: () => record,
    claimActive: (value) => {
      record = value;
      return true;
    },
    setActive: (value) => {
      record = value;
      return true;
    },
    clearActive: (token) => {
      if (record?.token === token) record = null;
    },
    launch: async () => {
      launchCount += 1;
      throw new Error("transport closed before receipt");
    },
    inspect: async () => ({ kind: "unowned" }),
    waitReady: async () => true,
    open: () => "overlay-1",
    cancelled: () => false,
  };
  await assert.rejects(
    launchBroadcast(true, async () => plan(), io, "token-unknown-123"),
    /outcome is uncertain.*hc ls --all/,
  );
  assert.equal(record.phase, "uncertain");
  await assert.rejects(
    launchBroadcast(true, async () => plan(), io, "token-retry-123"),
    /unresolved/,
  );
  assert.equal(launchCount, 1);

  record = null;
  const cancelledIO = {
    ...io,
    launch: async () => {
      launchCount += 1;
      return "t100";
    },
    cancelled: () => launchCount > 1,
  };
  const left = await launchBroadcast(true, async () => plan(), cancelledIO, "token-cancelled-123");
  assert.equal(left.kind, "left-running");
  assert.equal(record.phase, "uncertain");
  assert.equal(record.session.address, "t100");
  assert.equal(launchCount, 2);
});

test("opens a labeled scope viewer and rejects foreign terminal addresses", () => {
  const overlay = broadcastOverlay("t99", plan());
  assert.equal(overlay.kind, "dialog");
  assert.match(JSON.stringify(overlay), /broadcast-scope/);
  assert.throws(() => broadcastOverlay("host/t99"), /address/);
});
