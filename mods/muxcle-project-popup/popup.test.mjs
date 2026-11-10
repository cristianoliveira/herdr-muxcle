import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  inspectPopup,
  openPopup,
  popupPlan,
  popupRunArgs,
  updateActiveIfOwned,
  POPUP_OWNER_LABEL,
} from "../../.build/mods/muxcle-project-popup/popup.js";

const focus = {
  space: "local",
  tab: "tab-1",
  pane: "pane-1",
  terminal: "t1",
  shown: null,
  cwd: "/work/project",
};
const spaces = [
  {
    id: "local",
    machine: null,
    active: true,
    tabs: [{ id: "tab-1", active: true }],
  },
];
const panes = [{ pane: "pane-1", terminal: "t1", tab: "tab-1", cwd: "/work/project" }];
const json = (value, code = 0) => ({
  code,
  stdout: code === 0 ? JSON.stringify(value) : "",
  stderr: code === 0 ? "" : JSON.stringify(value),
});
const coreStatus = { core: { id: "core-1", name: "local" } };

function terminalFor(plan, token, state = "live") {
  return {
    address: "t99",
    state,
    labels: { [POPUP_OWNER_LABEL]: token },
    argv: ["/bin/sh", "-c", 'exec "$1"', "muxcle-project-popup", plan.script],
    cwd: plan.cwd,
    keep: false,
    parent: null,
  };
}

function adapters(overrides = {}) {
  const calls = [];
  let active = null;
  let terminal = null;
  let cancelled = false;
  const io = {
    calls,
    active: () => active,
    claimActive: (value) => {
      if (active !== null) return false;
      active = value;
      return true;
    },
    setActive: (value) =>
      updateActiveIfOwned(
        () => active,
        (next) => {
          active = next;
        },
        value,
      ),
    clearActive: (token) => {
      if (active?.token === token) active = null;
    },
    check: async () => ({ shellAvailable: true, exists: true, executable: true }),
    core: async (args) => {
      if (args[0] === "server") return json(coreStatus);
      if (args[0] === "run") {
        const label = args[args.indexOf("--label") + 1];
        const token = label.slice(label.indexOf("=") + 1);
        const cwd = args[args.indexOf("--cwd") + 1];
        const argv = args.slice(args.indexOf("--") + 1);
        terminal = {
          address: "t99",
          state: "live",
          labels: { [POPUP_OWNER_LABEL]: token },
          argv,
          cwd,
          keep: false,
          parent: null,
        };
        if (io.cancelAfterRun) cancelled = true;
        return json(terminal);
      }
      if (args[0] === "get") {
        const snapshot = terminal ? { ...terminal, labels: { ...terminal.labels }, argv: [...terminal.argv] } : null;
        io.afterGet?.(terminal);
        return snapshot ? json(snapshot) : json({ error: { kind: "not_found" } }, 3);
      }
      throw new Error(`unexpected core args: ${args.join(" ")}`);
    },
    isContextCurrent: () => true,
    isCancelled: () => cancelled,
    open: () => "overlay-1",
    ...overrides,
  };
  const core = io.core;
  io.core = async (args) => {
    calls.push(args);
    return core(args);
  };
  const open = io.open;
  io.open = (spec) => {
    calls.push(["open", spec]);
    return open(spec);
  };
  io.setTerminal = (value) => {
    terminal = value;
  };
  io.terminal = () => terminal;
  io.setCancelled = (value) => {
    cancelled = value;
  };
  return io;
}

function planFor(currentFocus = focus, currentSpaces = spaces, currentPanes = panes) {
  return popupPlan(currentFocus, currentSpaces, currentPanes);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function status(value = "live") {
  return value === "live" ? { kind: "live-owned" } : { kind: value };
}

test("plan binds the active local terminal, tab, pane, cwd, and project script", () => {
  assert.deepEqual(planFor(), {
    space: "local",
    tab: "tab-1",
    pane: "pane-1",
    terminal: "t1",
    cwd: "/work/project",
    script: "/work/project/.tmp/popup",
  });
  assert.equal(planFor({ ...focus, cwd: "/" }, spaces, [{ ...panes[0], cwd: "/" }]).script, "/.tmp/popup");
  assert.equal(planFor({ ...focus, cwd: "/work/project///" }).script, "/work/project/.tmp/popup");
  for (const terminal of ["t7", "t1b"]) {
    assert.equal(planFor({ ...focus, terminal }, spaces, [{ ...panes[0], terminal }]).terminal, terminal);
  }
});

test("refuses parent traversal that could change meaning across a symlink", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "muxcle-popup-path-"));
  const target = join(temporary, "target");
  const lexicalProject = join(temporary, "project");
  const cwd = `${temporary}/link/../project`;

  try {
    await mkdir(join(target, "child"), { recursive: true });
    await mkdir(join(target, "project"), { recursive: true });
    await mkdir(lexicalProject, { recursive: true });
    await symlink(join(target, "child"), join(temporary, "link"));

    assert.notEqual(await realpath(cwd), lexicalProject);
    assert.throws(
      () => planFor({ ...focus, cwd }, spaces, [{ ...panes[0], cwd }]),
      /without `\.\.` or leading `\/\/` components/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("shell-looking project paths stay literal argv and cannot become a shell line", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "muxcle-popup-"));
  const marker = join(temporary, "injected");
  const cwd = join(temporary, `project $(touch ${marker}); 'quoted' 日本語`);
  const script = join(cwd, ".tmp", "popup");
  const token = "popup-unique-token";

  try {
    await mkdir(join(cwd, ".tmp"), { recursive: true });
    await writeFile(script, "#!/bin/sh\nprintf 'popup-safe\\n'\n");
    await chmod(script, 0o755);

    const plan = planFor({ ...focus, cwd }, spaces, [{ ...panes[0], cwd }]);
    const runArgs = popupRunArgs(plan, token);
    // Absolute /bin/sh avoids short template-name lookup; $1 stays one literal path argument.
    const expectedArgv = ["/bin/sh", "-c", 'exec "$1"', "muxcle-project-popup", script];
    const argv = runArgs.slice(runArgs.indexOf("--") + 1);
    assert.deepEqual(argv, expectedArgv);
    assert.equal(argv[0], "/bin/sh");
    assert.equal(runArgs[runArgs.indexOf("--cwd") + 1], cwd);

    const execution = spawnSync(argv[0], argv.slice(1), { encoding: "utf8" });
    assert.equal(execution.status, 0, execution.stderr);
    assert.equal(execution.stdout, "popup-safe\n");
    await assert.rejects(access(marker));

    const io = adapters();
    await openPopup(plan, io, token);
    const run = io.calls.find((args) => args[0] === "run");
    assert.deepEqual(run.slice(run.indexOf("--") + 1), expectedArgv);
    assert.equal(run[run.indexOf("--cwd") + 1], cwd);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("opens a native terminal overlay with the exact owned terminal receipt", async () => {
  const io = adapters();
  const result = await openPopup(planFor(), io, "token-0001");

  assert.equal(result?.overlay, "overlay-1");
  assert.equal(result?.session.address, "t99");
  const spec = io.calls.find((args) => args[0] === "open")?.[1];
  assert.equal(spec.kind, "dialog");
  assert.equal(spec.layout.children[0].content.mod, "peek");
  assert.deepEqual(spec.layout.children[0].content.props, { terminal: "t99" });
  assert.equal(spec.layout.children[1].content.terminal, "t99");
  assert.equal(io.active()?.phase, "active");
});

test("unknown, remote, stale, and non-terminal contexts refuse without executing", () => {
  const refusals = [
    [null, spaces, panes],
    [{ ...focus, pane: null }, spaces, panes],
    [{ ...focus, terminal: null }, spaces, panes],
    [{ ...focus, cwd: null }, spaces, panes],
    [{ ...focus, cwd: "relative/project" }, spaces, panes],
    [{ ...focus, shown: "t2" }, spaces, panes],
    [focus, [], panes],
    [focus, [{ ...spaces[0], machine: "server" }], panes],
    [focus, [{ ...spaces[0], active: false }], panes],
    [focus, [{ ...spaces[0], tabs: [] }], panes],
    [focus, spaces, [{ pane: "pane-1", terminal: "t2", tab: "tab-1", cwd: "/work/project" }]],
    [{ ...focus, terminal: "server/t1" }, spaces, [{ ...panes[0], terminal: "server/t1" }]],
    [{ ...focus, terminal: "unknown-terminal" }, spaces, [{ ...panes[0], terminal: "unknown-terminal" }]],
    [{ ...focus, terminal: "t404" }, spaces, panes],
    [focus, spaces, [{ ...panes[0], cwd: "/different/project" }]],
    [focus, spaces, [{ pane: "pane-1", terminal: "t1", tab: "tab-1" }]],
  ];

  for (const [currentFocus, currentSpaces, currentPanes] of refusals) {
    assert.throws(() => popupPlan(currentFocus, currentSpaces, currentPanes));
  }
});

test("missing or non-executable project scripts create no terminal and give distinct recovery", async () => {
  for (const [check, message] of [
    [{ shellAvailable: true, exists: false, executable: false }, /create.*\.tmp\/popup/i],
    [{ shellAvailable: true, exists: true, executable: false }, /chmod \+x \.tmp\/popup/],
  ]) {
    const io = adapters({ check: async () => check });
    await assert.rejects(openPopup(planFor(), io, "token-0001"), message);
    assert.equal(
      io.calls.some((args) => args[0] === "run"),
      false,
    );
    assert.equal(io.active(), null);
  }
});

test("missing POSIX shell refuses before any terminal launch", async () => {
  const io = adapters({ check: async () => ({ shellAvailable: false, exists: false, executable: false }) });

  await assert.rejects(openPopup(planFor(), io, "token-0001"), /POSIX shell at \/bin\/sh/);
  assert.equal(
    io.calls.some((args) => args[0] === "run"),
    false,
  );
  assert.equal(io.active(), null);
});

test("cancellation before launch clears the claim without calling the core", async () => {
  const io = adapters({ isCancelled: () => true });

  assert.equal(await openPopup(planFor(), io, "token-0001"), null);
  assert.equal(
    io.calls.some((args) => args[0] === "run"),
    false,
  );
  assert.equal(io.active(), null);
});

test("cancellation after launch leaves the verified terminal running without an automatic stop", async () => {
  const io = adapters({ cancelAfterRun: true });

  const result = await openPopup(planFor(), io, "token-0001");
  assert.equal(result?.kind, "left-running");
  assert.equal(result?.session.address, "t99");
  assert.equal(
    io.calls.some((args) => args[0] === "kill"),
    false,
  );
  assert.equal(
    io.calls.some((args) => args[0] === "open"),
    false,
  );
  assert.equal(io.active()?.phase, "uncertain");
});

test("a kept-state change after inspection is never followed by an automatic stop", async () => {
  const io = adapters({
    cancelAfterRun: true,
    afterGet: (terminal) => {
      terminal.keep = true;
    },
  });

  const result = await openPopup(planFor(), io, "token-0001");
  assert.equal(result?.kind, "left-running");
  assert.equal(io.terminal()?.keep, true);
  assert.equal(
    io.calls.some((args) => args[0] === "kill"),
    false,
  );
  assert.equal(io.active()?.phase, "uncertain");
});

test("a stale focus after launch leaves the terminal running and opens no overlay", async () => {
  let checks = 0;
  const io = adapters({ isContextCurrent: () => ++checks < 3 });

  const result = await openPopup(planFor(), io, "token-0001");
  assert.equal(result?.kind, "left-running");
  assert.equal(
    io.calls.some((args) => args[0] === "kill"),
    false,
  );
  assert.equal(
    io.calls.some((args) => args[0] === "open"),
    false,
  );
  assert.equal(io.active()?.phase, "uncertain");
});

test("a quick exit is not shown as an empty overlay", async () => {
  const io = adapters({
    core: async (args) => {
      if (args[0] === "server") return json(coreStatus);
      if (args[0] === "run") return json(terminalFor(planFor(), "token-0001", "finished"));
      throw new Error(`unexpected core args: ${args.join(" ")}`);
    },
  });

  assert.equal(await openPopup(planFor(), io, "token-0001"), null);
  assert.equal(
    io.calls.some((args) => args[0] === "open"),
    false,
  );
  assert.equal(io.active(), null);
});

test("omitted default keep and parent fields remain valid receipt defaults", async () => {
  const io = adapters({
    core: async (args) => {
      if (args[0] === "server") return json(coreStatus);
      if (args[0] === "run") {
        const receipt = terminalFor(planFor(), "token-0001");
        delete receipt.keep;
        delete receipt.parent;
        return json(receipt);
      }
      if (args[0] === "get") {
        const record = terminalFor(planFor(), "token-0001");
        delete record.keep;
        return json(record);
      }
      throw new Error(`unexpected core args: ${args.join(" ")}`);
    },
  });

  assert.equal((await openPopup(planFor(), io, "token-0001"))?.session.address, "t99");
  assert.equal(
    io.calls.some((args) => args[0] === "open"),
    true,
  );
});

test("launch errors and malformed receipts are uncertain and never kill an unverified terminal", async () => {
  for (const result of [
    json({ error: { message: "core unavailable" } }, 1),
    json({ ...terminalFor(planFor(), "other-token"), address: "t88" }),
    { code: 0, stdout: "not-json", stderr: "" },
  ]) {
    const io = adapters({
      core: async (args) => (args[0] === "server" ? json(coreStatus) : result),
    });

    await assert.rejects(openPopup(planFor(), io, "token-0001"), /launch|receipt|uncertain/i);
    assert.equal(
      io.calls.some((args) => args[0] === "open"),
      false,
    );
    assert.equal(
      io.calls.some((args) => args[0] === "kill"),
      false,
    );
    assert.equal(io.active()?.phase, "uncertain");
  }
});

test("overlay failure leaves the verified terminal running without an automatic stop", async () => {
  const io = adapters({
    open: () => {
      throw new Error("overlay failed");
    },
  });

  const result = await openPopup(planFor(), io, "token-0001");
  assert.equal(result?.kind, "left-running");
  assert.match(result?.evidence ?? "", /overlay failed/);
  assert.equal(
    io.calls.some((args) => args[0] === "kill"),
    false,
  );
  assert.equal(io.active()?.phase, "uncertain");
});

test("a delayed token-bound state update cannot overwrite a newer active claim", async () => {
  const inspectionEntered = deferred();
  const releaseInspection = deferred();
  const olderClaim = { schema: 1, token: "token-first", phase: "active" };
  const newerClaim = { schema: 1, token: "token-second", phase: "active" };
  let active = olderClaim;

  const delayedClose = (async () => {
    inspectionEntered.resolve();
    await releaseInspection.promise;
    updateActiveIfOwned(
      () => active,
      (record) => {
        active = record;
      },
      { ...olderClaim, phase: "uncertain", evidence: "late close" },
    );
  })();

  await inspectionEntered.promise;
  active = newerClaim;
  releaseInspection.resolve();
  await delayedClose;

  assert.deepEqual(active, newerClaim);
});

test("a delayed preflight cannot clear or overwrite a newer launch claim", async () => {
  const preflightEntered = deferred();
  const releasePreflight = deferred();
  let checkCount = 0;
  const io = adapters({
    check: async () => {
      checkCount += 1;
      if (checkCount === 1) {
        preflightEntered.resolve();
        await releasePreflight.promise;
      }
      return { shellAvailable: true, exists: true, executable: true };
    },
  });

  const firstLaunch = openPopup(planFor(), io, "token-first");
  await preflightEntered.promise;
  io.clearActive("token-first");

  const secondResult = await openPopup(planFor(), io, "token-second");
  assert.equal(secondResult?.kind, "opened");
  const newerClaim = io.active();

  releasePreflight.resolve();
  await assert.rejects(firstLaunch, /ownership claim changed/);
  assert.deepEqual(io.active(), newerClaim);
  assert.equal(io.calls.filter((args) => args[0] === "run").length, 1);
});

test("a delayed inspection cannot replace a newer claim after launch", async () => {
  const inspectionEntered = deferred();
  const releaseInspection = deferred();
  const io = adapters();
  const core = io.core;
  let getCount = 0;
  io.core = async (args) => {
    if (args[0] === "get" && ++getCount === 1) {
      inspectionEntered.resolve();
      await releaseInspection.promise;
    }
    return core(args);
  };

  const firstLaunch = openPopup(planFor(), io, "token-first");
  await inspectionEntered.promise;
  io.clearActive("token-first");

  const secondResult = await openPopup(planFor(), io, "token-second");
  assert.equal(secondResult?.kind, "opened");
  const newerClaim = io.active();

  releaseInspection.resolve();
  const firstResult = await firstLaunch;
  assert.equal(firstResult?.kind, "left-running");
  assert.deepEqual(io.active(), newerClaim);
  assert.equal(io.calls.filter((args) => args[0] === "run").length, 2);
  assert.equal(io.calls.filter((args) => args[0] === "open").length, 1);
});

test("simultaneous launcher actions claim shared state before either can run twice", async () => {
  const io = adapters();
  const plan = planFor();
  const results = await Promise.allSettled([openPopup(plan, io, "token-first"), openPopup(plan, io, "token-second")]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(io.calls.filter((args) => args[0] === "run").length, 1);
});

test("an existing owned popup blocks a duplicate launch until it is gone", async () => {
  const io = adapters();
  const plan = planFor();
  const session = { ...terminalFor(plan, "old-token"), token: "old-token", coreId: "core-1", script: plan.script };
  assert.equal(io.claimActive({ schema: 1, token: "old-token", phase: "active", coreId: "core-1", session }), true);
  io.setTerminal(terminalFor(plan, "old-token"));

  await assert.rejects(openPopup(plan, io, "new-token"), /already active/i);
  assert.equal(
    io.calls.some((args) => args[0] === "run"),
    false,
  );
});

test("inspection is bound to core, address, nonce, argv, cwd, and keep state", async () => {
  const plan = planFor();
  const session = { ...terminalFor(plan, "token-0001"), token: "token-0001", coreId: "core-1", script: plan.script };
  const io = adapters();
  io.setTerminal(terminalFor(plan, "token-0001"));

  assert.deepEqual(await inspectPopup(session, io.core), status());

  for (const [record, currentCoreId, expected] of [
    [{ ...terminalFor(plan, "someone-else") }, "core-1", "unowned"],
    [{ ...terminalFor(plan, "token-0001"), keep: true }, "core-1", "kept"],
    [{ ...terminalFor(plan, "token-0001"), state: "unknown" }, "core-1", "unowned"],
    [terminalFor(plan, "token-0001"), "core-2", "foreign-core"],
    [{ ...terminalFor(plan, "token-0001"), cwd: "/elsewhere" }, "core-1", "unowned"],
    [{ ...terminalFor(plan, "token-0001"), argv: ["sh", "-c", "bad"] }, "core-1", "unowned"],
  ]) {
    const guarded = adapters({
      core: async (args) => {
        if (args[0] === "server") return json({ core: { id: currentCoreId } });
        if (args[0] === "get") return json({ ...record, address: "t99" });
        throw new Error(`unexpected destructive call: ${args.join(" ")}`);
      },
    });
    guarded.setTerminal(record);

    assert.equal((await inspectPopup(session, guarded.core)).kind, expected);
    assert.equal(
      guarded.calls.some((args) => args[0] === "kill"),
      false,
    );
  }
});
