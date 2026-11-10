import assert from "node:assert/strict";
import test from "node:test";
import {
  COPY_MODE_LABEL,
  copyModeKeyAction,
  copyModePlan,
  copyModeTarget,
  copyOverlay,
  copyRunArgs,
  inspectCopyMode,
  launchCopyMode,
  parseCopyModeReceipt,
} from "../../.build/mods/muxcle-copy-mode/copy-mode.js";

const localSpace = { id: "local", machine: null, active: true };
const remoteSpace = { id: "mac/space-1", machine: "mac", active: false };
const spaces = [localSpace, remoteSpace];
const focus = { space: "local", tab: "tab-1", pane: "pane-1", terminal: "t3", shown: null, agent: null };
const layout = { id: "root", type: "row", children: [{ id: "main", type: "block", content: { tab: "active" } }] };
const target = copyModeTarget(focus, layout, [], spaces);
const plan = copyModePlan(target, "/config/herdr", "/home/me", "core-1", null);
const token = "copy-mode-test-token";

const receipt = (selectedPlan = plan, selectedToken = token, overrides = {}) => ({
  address: "t99",
  state: "live",
  labels: { [COPY_MODE_LABEL]: selectedToken },
  cwd: selectedPlan.cwd,
  argv: selectedPlan.command,
  keep: false,
  parent: null,
  ...overrides,
});
const result = (value, code = 0) => ({
  code,
  stdout: code === 0 ? JSON.stringify(value) : "",
  stderr: code === 0 ? "" : "Core unavailable",
});
const activeRecord = (selectedPlan = plan, selectedToken = token, extra = {}) => ({
  schema: 1,
  token: selectedToken,
  phase: "active",
  coreId: selectedPlan.coreId,
  machine: selectedPlan.machine,
  machineId: selectedPlan.machineId,
  terminal: selectedPlan.terminal,
  cwd: selectedPlan.cwd,
  command: selectedPlan.command,
  session: {
    address: "t99",
    token: selectedToken,
    coreId: selectedPlan.coreId,
    machine: selectedPlan.machine,
    machineId: selectedPlan.machineId,
    terminal: selectedPlan.terminal,
    cwd: selectedPlan.cwd,
    command: selectedPlan.command,
    script: selectedPlan.script,
  },
  ...extra,
});

function coreFor(selectedPlan = plan, selectedToken = token, getOverrides = {}) {
  return async (args) => {
    if (args[0] === "server" && args[1] === "status") return result({ core: { id: selectedPlan.coreId } });
    if (args[0] === "machine" && args[1] === "ls") {
      return result({ machines: [{ name: selectedPlan.machine, id: selectedPlan.machineId }] });
    }
    if (args[0] === "get") return result(receipt(selectedPlan, selectedToken, getOverrides));
    if (args[0] === "run") return result(receipt(selectedPlan, selectedToken));
    throw new Error(`Unexpected Core command: ${args.join(" ")}`);
  };
}

function ioFor(selectedPlan = plan, options = {}) {
  const calls = [];
  let active = options.active ?? null;
  const io = {
    active: () => active,
    claimActive: (record) => {
      calls.push(["claim", record]);
      if (active !== null) return false;
      active = record;
      return true;
    },
    setActive: (record) => {
      calls.push(["set", record]);
      if (!active || active.token !== record.token) return false;
      active = record;
      return true;
    },
    clearActive: (ownerToken) => {
      calls.push(["clear", ownerToken]);
      if (active?.token === ownerToken) active = null;
    },
    core: async (args) => {
      calls.push(["core", args]);
      return coreFor(selectedPlan, options.receiptToken ?? token, options.getOverrides ?? {})(args);
    },
    open: (spec) => {
      calls.push(["open", spec]);
      return options.openResult ?? "overlay-1";
    },
    cancelled: () => options.cancelled?.() ?? false,
  };
  return { io, calls, active: () => active };
}

test("chooses the currently displayed pane terminal, including Native's shown replacement", () => {
  assert.equal(target.terminal, "t3");
  assert.equal(copyModeTarget({ ...focus, terminal: "mac/t7", shown: "t8" }, layout, [], spaces).terminal, "t8");
  assert.equal(
    copyModeTarget(
      { ...focus, space: remoteSpace.id, tab: "mac/tab-1", pane: null, terminal: "mac/t9", shown: null },
      layout,
      [],
      spaces,
    ).terminal,
    "mac/t9",
  );
});

test("focused literal terminal blocks outrank visible or ambiguous agent surfaces and own machine scope", () => {
  const mixedLayout = {
    id: "root",
    type: "row",
    children: [
      { id: "agent", type: "block", content: { agent: "focused" } },
      { id: "other-agent", type: "block", content: { agent: "unsupported" } },
    ],
  };
  const selected = copyModeTarget(
    { ...focus, space: remoteSpace.id, pane: null, terminal: "t7", agent: "build/t9" },
    mixedLayout,
    [],
    spaces,
  );
  assert.equal(selected.terminal, "t7");
  assert.equal(selected.machine, null);
  assert.equal(selected.focus.agent, null);

  const remote = copyModeTarget(
    { ...focus, pane: null, terminal: "build/t7", agent: "build/t9" },
    mixedLayout,
    [],
    spaces,
  );
  assert.equal(remote.terminal, "build/t7");
  assert.equal(remote.machine, "build");
});

test("uses a sole visible focused-agent body instead of an unrelated underlying pane", () => {
  const agentLayout = {
    id: "root",
    type: "row",
    children: [{ id: "agent", type: "block", content: { agent: "focused" } }],
  };
  const agent = {
    address: "mac/t4",
    space: "mac/space-1",
    tab: "mac/tab-1",
    app: "claude",
    program: { name: "Claude", agent: true },
  };
  const selected = copyModeTarget({ ...focus, agent: agent.address }, agentLayout, [agent], spaces);
  const remotePlan = copyModePlan(selected, "/config", "/home/me", "core-1", "machine-1");
  assert.equal(remotePlan.terminal, "mac/t4");
  assert.equal(remotePlan.machine, "mac");
  assert.equal(remotePlan.machineId, "machine-1");
  assert.equal(remotePlan.focus.pane, "pane-1");
});

test("resolves a sole visible floating focused-agent body", () => {
  const floatingLayout = {
    id: "root",
    type: "row",
    children: [{ id: "main", type: "block", content: { mod: "workspace-status" } }],
    floating: [{ id: "agent", content: { agent: "focused" }, edge: "right" }],
  };
  const agent = {
    address: "mac/t4",
    space: "mac/space-1",
    tab: "mac/tab-1",
    app: "claude",
    program: { name: "Claude", agent: true },
  };
  assert.equal(copyModeTarget({ ...focus, agent: agent.address }, floatingLayout, [agent], spaces).terminal, "mac/t4");
});

test("follows Native's visible active-child or first-visible stack fallback", () => {
  const hidden = {
    id: "root",
    type: "row",
    children: [{ id: "agent", type: "block", hidden: true, content: { agent: "focused" } }],
  };
  const hiddenActive = {
    id: "root",
    type: "stack",
    active: "hidden-tab",
    children: [
      { id: "hidden-tab", type: "block", hidden: true, content: { tab: "active" } },
      { id: "agent", type: "block", content: { agent: "focused" } },
    ],
  };
  const noActive = {
    id: "root",
    type: "stack",
    children: [
      { id: "hidden-tab", type: "block", hidden: true, content: { tab: "active" } },
      { id: "agent", type: "block", content: { agent: "focused" } },
      { id: "later-tab", type: "block", content: { tab: "active" } },
    ],
  };
  const missingActive = { ...noActive, active: "removed-child" };
  const visibleActive = {
    id: "root",
    type: "stack",
    active: "agent",
    children: [
      { id: "tab", type: "block", content: { tab: "active" } },
      { id: "agent", type: "block", content: { agent: "focused" } },
    ],
  };
  const agent = {
    address: "mac/t4",
    space: "mac/space-1",
    tab: "mac/tab-1",
    app: "claude",
    program: { name: "Claude", agent: true },
  };
  assert.throws(() => copyModeTarget({ ...focus, agent: agent.address }, hidden, [], spaces), /visible terminal/i);
  assert.equal(
    copyModeTarget({ ...focus, agent: agent.address }, hiddenActive, [agent], spaces).terminal,
    agent.address,
  );
  assert.equal(copyModeTarget({ ...focus, agent: agent.address }, noActive, [agent], spaces).terminal, agent.address);
  assert.equal(
    copyModeTarget({ ...focus, agent: agent.address }, missingActive, [agent], spaces).terminal,
    agent.address,
  );
  assert.equal(
    copyModeTarget({ ...focus, agent: agent.address }, visibleActive, [agent], spaces).terminal,
    agent.address,
  );
});

test("refuses mixed terminal surfaces, missing bodies, stale agents, and mismatched machine scope", () => {
  const visibleAgent = { type: "block", content: { agent: "focused" } };
  assert.throws(() => copyModeTarget(focus, visibleAgent, [], spaces), /visible.*agent/);

  assert.throws(() => copyModeTarget({ ...focus, agent: "mac/t404" }, visibleAgent, [], spaces), /visible.*agent/);
  assert.equal(copyModeTarget({ ...focus, terminal: "mac/t7" }, layout, [], spaces).machine, "mac");
  const mixed = {
    id: "root",
    type: "row",
    children: [
      { id: "tab", type: "block", content: { tab: "active" } },
      { id: "agent", type: "block", content: { agent: "focused" } },
    ],
  };
  const agent = { address: "mac/t4", space: "mac/space-1", tab: "mac/tab-1" };
  assert.throws(
    () => copyModeTarget({ ...focus, agent: agent.address }, mixed, [agent], spaces),
    /ambiguous.*surface/i,
  );
  assert.throws(
    () => copyModeTarget(focus, { type: "stack", active: "missing", children: [] }, [], spaces),
    /visible terminal/i,
  );
  assert.throws(
    () => copyModeTarget(focus, { type: "block", content: { mod: "workspace-status" } }, [], spaces),
    /visible terminal/i,
  );
  for (const invalid of [null, {}, { ...focus, pane: null, terminal: null }, { ...focus, shown: "--help" }]) {
    assert.throws(() => copyModeTarget(invalid, layout, [], spaces), /terminal/i);
  }
});

test("maps launcher keys to explicit capture and close actions", () => {
  assert.equal(copyModeKeyAction("enter"), "capture");
  assert.equal(copyModeKeyAction("escape"), "close");
  assert.equal(copyModeKeyAction("q"), null);
  assert.equal(copyModeKeyAction("ctrl-enter"), null);
});

test("builds explicit launch arguments with verified Core and remote-machine identities", () => {
  assert.equal(plan.coreId, "core-1");
  assert.deepEqual(plan.command, ["python3", plan.script, "--terminal", "t3", "--core-id", "core-1"]);
  assert.deepEqual(plan.dependencies, ["python3", "hc", "nvim"]);
  const remoteTarget = copyModeTarget(
    { ...focus, space: remoteSpace.id, tab: "mac/tab-1", terminal: "mac/t3" },
    layout,
    [],
    [remoteSpace],
  );
  const remotePlan = copyModePlan(remoteTarget, "/config with spaces", "/home/me", "core-1", "machine-1");
  assert.equal(remotePlan.cwd, "/home/me");
  assert.deepEqual(remotePlan.command, [
    "python3",
    remotePlan.script,
    "--terminal",
    "mac/t3",
    "--core-id",
    "core-1",
    "--machine",
    "mac",
    "--machine-id",
    "machine-1",
  ]);
  assert.deepEqual(copyRunArgs(remotePlan, token), [
    "run",
    "--bg",
    "--json",
    "--no-parent",
    "--no-notify",
    "--rm",
    "--label",
    `${COPY_MODE_LABEL}=${token}`,
    "--cwd",
    "/home/me",
    "--",
    ...remotePlan.command,
  ]);
  assert.throws(() => copyModePlan(target, "/config", "/home/../work", "core-1", null), /trusted absolute local home/);
  assert.throws(() => copyModePlan(remoteTarget, "/config", "/home/me", "core-1", null), /machine identity/);
});

test("does no plan, Core, capture, or launch work without an explicit request", async () => {
  const { io, calls } = ioFor();
  let resolutions = 0;
  assert.equal(
    await launchCopyMode(
      false,
      async () => {
        resolutions += 1;
        return plan;
      },
      io,
      token,
    ),
    null,
  );
  assert.equal(resolutions, 0);
  assert.deepEqual(calls, []);
});

test("validates Core receipts before opening the shipped non-destructive peek layout", () => {
  assert.deepEqual(parseCopyModeReceipt(result(receipt()), plan, token), {
    address: "t99",
    state: "live",
    token,
    coreId: "core-1",
    terminal: "t3",
    machine: null,
    machineId: null,
    cwd: "/home/me",
    command: plan.command,
    script: plan.script,
  });
  for (const invalid of [
    receipt(plan, token, { address: "mac/t99" }),
    receipt(plan, token, { labels: {} }),
    receipt(plan, token, { cwd: "/tmp" }),
    receipt(plan, token, { argv: ["sh"] }),
    receipt(plan, token, { keep: true }),
    receipt(plan, token, { parent: "t3" }),
  ])
    assert.throws(() => parseCopyModeReceipt(result(invalid), plan, token));

  const overlay = copyOverlay("t99");
  assert.deepEqual(
    overlay.layout.children.map((node) => node.content),
    [{ mod: "peek", props: { terminal: "t99" } }, { terminal: "t99" }],
  );
});

test("opens one verified viewer and never kills it when focus changes after launch", async () => {
  const { io, calls, active } = ioFor(plan);
  const result = await launchCopyMode(
    true,
    async () => {
      const index = calls.filter(([kind]) => kind === "resolve").length;
      calls.push(["resolve"]);
      return [plan, plan, null][index] ?? null;
    },
    io,
    token,
  );
  assert.equal(result.kind, "left-running");
  assert.match(result.evidence, /changed after capture/);
  assert.equal(
    calls.some(([kind]) => kind === "open"),
    false,
  );
  assert.equal(
    calls.some(([kind, args]) => kind === "core" && args[0] === "kill"),
    false,
  );
  assert.equal(active()?.phase, "uncertain");
  assert.equal(active()?.session.address, "t99");
});

test("cancellation after launch leaves uncertain receipt without automatic cleanup", async () => {
  let cancelled = false;
  const { io, calls, active } = ioFor(plan, { cancelled: () => cancelled });
  const originalCore = io.core;
  io.core = async (args) => {
    const result = await originalCore(args);
    if (args[0] === "run") cancelled = true;
    return result;
  };
  const result = await launchCopyMode(true, async () => plan, io, token);
  assert.equal(result.kind, "left-running");
  assert.match(result.evidence, /launcher closed after capture/);
  assert.equal(
    calls.some(([kind, args]) => kind === "core" && args[0] === "kill"),
    false,
  );
  assert.equal(
    calls.some(([kind]) => kind === "open"),
    false,
  );
  assert.equal(active()?.session.address, "t99");
});

test("refuses duplicate launches when a previous outcome is unresolved", async () => {
  const unresolved = { schema: 1, token, phase: "uncertain", coreId: "core-1" };
  const { io, calls } = ioFor(plan, { active: unresolved });
  await assert.rejects(
    launchCopyMode(true, async () => plan, io, token),
    /outcome is unresolved.*hc ls --all/,
  );
  assert.deepEqual(calls, []);
});

test("preserves an unknown launch outcome and refuses a second launch without a receipt", async () => {
  const { io, calls, active } = ioFor();
  let launches = 0;
  io.core = async (args) => {
    calls.push(["core", args]);
    if (args[0] === "run") {
      launches += 1;
      throw new Error("transport closed before receipt");
    }
    return coreFor()(args);
  };
  await assert.rejects(
    launchCopyMode(true, async () => plan, io, token),
    /outcome is uncertain.*hc ls --all/,
  );
  assert.equal(active()?.phase, "uncertain");
  assert.equal(launches, 1);
  await assert.rejects(
    launchCopyMode(
      true,
      async () => {
        throw new Error("must not resolve");
      },
      io,
      "new-token",
    ),
    /outcome is unresolved/,
  );
  assert.equal(launches, 1);
  assert.equal(
    calls.some(([kind, args]) => kind === "core" && args[0] === "kill"),
    false,
  );
});

test("cancellation during the final reopen check prevents opening the existing viewer", async () => {
  let cancelled = false;
  let resolveLatest;
  let signalSecondResolve;
  let resolveCount = 0;
  const latest = new Promise((resolve) => {
    resolveLatest = resolve;
  });
  const secondResolveStarted = new Promise((resolve) => {
    signalSecondResolve = resolve;
  });
  const { io, calls } = ioFor(plan, { active: activeRecord(), cancelled: () => cancelled });
  const opening = launchCopyMode(
    true,
    async () => {
      resolveCount += 1;
      if (resolveCount === 1) return plan;
      signalSecondResolve();
      return latest;
    },
    io,
    "new-token",
  );

  await secondResolveStarted;
  cancelled = true;
  resolveLatest(plan);
  assert.equal(await opening, null);
  assert.equal(
    calls.some(([kind]) => kind === "open"),
    false,
  );
});

test("reopens a verified existing viewer without launching a second capture", async () => {
  const existing = activeRecord();
  const { io, calls } = ioFor(plan, { active: existing });
  const opened = await launchCopyMode(true, async () => plan, io, "new-token");
  assert.equal(opened.kind, "opened-existing");
  assert.equal(opened.session.address, "t99");
  assert.equal(
    calls.some(([kind, args]) => kind === "core" && args[0] === "run"),
    false,
  );
  assert.equal(
    calls.some(([kind]) => kind === "open"),
    true,
  );
});

test("remote machine identity changes stop inspection before hc get", async () => {
  const remoteTarget = copyModeTarget(
    { ...focus, space: remoteSpace.id, tab: "mac/tab-1", terminal: "mac/t3" },
    layout,
    [],
    [remoteSpace],
  );
  const remotePlan = copyModePlan(remoteTarget, "/config", "/home/me", "core-1", "machine-1");
  const session = parseCopyModeReceipt(result(receipt(remotePlan)), remotePlan, token);
  const calls = [];
  const inspection = await inspectCopyMode(session, async (args) => {
    calls.push(args);
    if (args[0] === "server") return result({ core: { id: "core-1" } });
    if (args[0] === "machine") return result({ machines: [{ name: "mac", id: "machine-2" }] });
    throw new Error("hc get must not run after a machine identity change");
  });
  assert.equal(inspection, "foreign-machine");
  assert.deepEqual(
    calls.map(([command]) => command),
    ["server", "machine"],
  );
});

test("same address on another Core is not inspected, killed, or relaunched", async () => {
  const existing = activeRecord(plan, token, {
    coreId: "core-old",
    session: { ...activeRecord().session, coreId: "core-old" },
  });
  const { io, calls } = ioFor(plan, { active: existing });
  await assert.rejects(
    launchCopyMode(true, async () => plan, io, "new-token"),
    /different Herdr Core/,
  );
  assert.equal(
    calls.some(([kind, args]) => kind === "core" && args[0] === "get"),
    false,
  );
  assert.equal(
    calls.some(([kind, args]) => kind === "core" && args[0] === "run"),
    false,
  );
});

test("leaves a user-kept or replaced viewer untouched and blocks another capture", async () => {
  for (const getOverrides of [{ keep: true }, { labels: {} }]) {
    const { io, calls } = ioFor(plan, { active: activeRecord(), getOverrides });
    await assert.rejects(
      launchCopyMode(true, async () => plan, io, "new-token"),
      /left untouched/,
    );
    assert.equal(
      calls.some(([kind, args]) => kind === "core" && args[0] === "kill"),
      false,
    );
    assert.equal(
      calls.some(([kind, args]) => kind === "core" && args[0] === "run"),
      false,
    );
  }
});
