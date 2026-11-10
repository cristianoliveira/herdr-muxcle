import assert from "node:assert/strict";
import test from "node:test";
import { ProjectWatchers } from "../../.build/mods/muxcle-funzzy-status/projects.js";

const space = (id, { machine = null, folder = "/work/app", active = false } = {}) => ({
  id,
  name: id,
  machine,
  folder,
  active,
});
const capabilities = (token = "fz-one", schemaVersion = 1, methods = ["status"]) =>
  JSON.stringify({
    schemaVersion,
    instance: { token },
    methods,
  });
const status = (generation = 1, state = "idle", failures = []) =>
  JSON.stringify({
    generation,
    state,
    failures,
    commands: ["do not expose this"],
  });
const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function harness({ spaces = [], exec, notify, ...options } = {}) {
  const state = { spaces };
  const calls = [];
  const notifications = [];
  const watcher = new ProjectWatchers({
    spaces: () => state.spaces,
    exec: async (command, args, config) => {
      calls.push({ command, args, config });
      return exec ? exec(command, args, config) : ok(args.at(-1) === "status" ? status() : capabilities());
    },
    notify: (notification) => {
      notifications.push(notification);
      return notify?.(notification);
    },
    ...options,
  });
  return { watcher, state, calls, notifications };
}

test("collapses duplicate spaces but keeps the same path separate on each machine", async () => {
  const { watcher, calls } = harness({
    spaces: [space("local-a", { active: true }), space("local-b"), space("remote", { machine: "build-box" })],
    remoteEnabled: true,
  });

  await watcher.poll();

  assert.equal(calls.length, 6);
  assert.equal(calls.filter(({ config }) => config.on === null).length, 3);
  assert.equal(calls.filter(({ config }) => config.on === "build-box").length, 3);
  for (const group of [
    calls.filter(({ config }) => config.on === null),
    calls.filter(({ config }) => config.on === "build-box"),
  ]) {
    assert.deepEqual(
      group.map(({ args }) => args),
      [
        ["control", "--format", "json", "capabilities"],
        ["control", "--format", "json", "status"],
        ["control", "--format", "json", "capabilities"],
      ],
    );
  }
});

test("remote monitoring is opt-in and never falls back to the local binary", async () => {
  const disabled = harness({ spaces: [space("remote", { machine: "build-box", active: true })] });
  assert.equal(disabled.watcher.current().state, "remote-disabled");
  await disabled.watcher.poll();
  assert.equal(disabled.calls.length, 0);

  const remote = harness({
    spaces: [space("remote", { machine: "build-box", active: true })],
    remoteEnabled: true,
    binary: "/local/fzz",
    remoteBinary: "fzz-remote",
    exec: async () => ({ code: 1, stdout: "", stderr: "not available" }),
  });
  await remote.watcher.poll();

  assert.equal(remote.watcher.current().state, "offline");
  assert.equal(remote.calls.length, 1);
  assert.equal(remote.calls[0].command, "fzz-remote");
  assert.equal(remote.calls[0].config.on, "build-box");
  assert.equal(remote.calls[0].config.cwd, "/work/app");
  assert.equal(remote.calls[0].config.timeout, 10_000);
});

test("caps active project monitoring and reports when the selected project is outside the bound", async () => {
  const spaces = Array.from({ length: 65 }, (_, index) =>
    space(`p${index}`, {
      folder: `/work/${String(index).padStart(2, "0")}`,
      active: index === 64,
    }),
  );
  const { watcher, calls } = harness({ spaces });

  await watcher.poll();

  assert.equal(watcher.current().state, "limit");
  assert.equal(calls.length, 64 * 3);
});

test("empty project folders use native target-home defaults without guessing a path", async () => {
  const { watcher, calls } = harness({
    spaces: [space("remote-home", { machine: "build-box", folder: "", active: true })],
    remoteEnabled: true,
  });

  await watcher.poll();

  assert.equal(calls.length, 3);
  assert.equal(calls[0].config.cwd, undefined);
  assert.equal(calls[0].config.on, "build-box");
});

test("unsupported CLI syntax is distinct from an unreachable watcher", async () => {
  const unsupported = harness({
    spaces: [space("local", { active: true })],
    exec: async () => ({ code: 2, stdout: "", stderr: "error: unexpected argument '--format' found" }),
  });
  await unsupported.watcher.poll();
  assert.equal(unsupported.watcher.current().state, "unsupported");
  assert.equal(unsupported.calls.length, 1);

  const offline = harness({
    spaces: [space("local", { active: true })],
    exec: async () => ({ code: 1, stdout: "", stderr: "could not connect to control socket" }),
  });
  await offline.watcher.poll();
  assert.equal(offline.watcher.current().state, "offline");
});

test("unsupported control capabilities and malformed status are distinct", async () => {
  const unsupported = harness({
    spaces: [space("local", { active: true })],
    exec: async (_command, args) => ok(args.at(-1) === "capabilities" ? capabilities("fz-one", 2) : status()),
  });
  await unsupported.watcher.poll();
  assert.equal(unsupported.watcher.current().state, "unsupported");
  assert.equal(unsupported.calls.length, 1);

  const invalid = harness({
    spaces: [space("local", { active: true })],
    exec: async (_command, args) => ok(args.at(-1) === "status" ? "not json" : capabilities()),
  });
  await invalid.watcher.poll();
  assert.equal(invalid.watcher.current().state, "invalid");
  assert.equal(invalid.notifications.length, 0);
});

test("capabilities bracketing rejects a status captured across a watcher restart", async () => {
  let token = 0;
  const { watcher, calls, notifications } = harness({
    spaces: [space("local", { active: true })],
    exec: async (_command, args) => {
      if (args.at(-1) === "status") return ok(status(7, "passed"));
      token += 1;
      return ok(capabilities(`fz-${token}`));
    },
  });

  await watcher.poll();

  assert.equal(watcher.current().state, "restarting");
  assert.equal(calls.length, 3);
  assert.equal(notifications.length, 0);
});

test("new terminal generations notify once without exposing job output or commands", async () => {
  let generation = 1;
  const state = "failed";
  const { watcher, notifications } = harness({
    spaces: [space("local", { active: true })],
    exec: async (_command, args) =>
      ok(args.at(-1) === "status" ? status(generation, state, ["credential=secret; command output"]) : capabilities()),
  });

  await watcher.poll();
  assert.equal(notifications.length, 0, "first observed terminal result is a silent baseline");

  generation = 2;
  await watcher.poll();
  await watcher.poll();

  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0], {
    title: "Funzzy watcher",
    body: "Run #2 failed · local · app",
    level: "error",
  });
  assert.doesNotMatch(JSON.stringify(notifications[0]), /credential|secret|command output/);
  assert.equal(watcher.current().failures, 1);
});

test("duplicate same-project spaces do not create an implicit notification selection", async () => {
  let generation = 1;
  const { watcher, notifications } = harness({
    spaces: [space("first"), space("second")],
    exec: async (_command, args) => ok(args.at(-1) === "status" ? status(generation, "passed") : capabilities()),
  });

  await watcher.poll();
  generation = 2;
  await watcher.poll();

  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0], {
    title: "Funzzy watcher",
    body: "Run #2 passed · local · app",
    level: "success",
  });
  assert.equal("action" in notifications[0], false);
});

test("app restart and watcher restart both baseline silently; a later generation notifies", async () => {
  let token = "fz-one";
  let generation = 4;
  let persisted;
  const options = {
    spaces: [space("local", { active: true })],
    readPersisted: () => persisted,
    writePersisted: (_key, value) => {
      persisted = value;
    },
    exec: async (_command, args) => ok(args.at(-1) === "status" ? status(generation, "passed") : capabilities(token)),
  };
  const first = harness(options);
  await first.watcher.poll();
  assert.equal(first.notifications.length, 0);

  const resumed = harness(options);
  await resumed.watcher.poll();
  assert.equal(resumed.notifications.length, 0);

  token = "fz-two";
  generation = 1;
  await resumed.watcher.poll();
  assert.equal(resumed.notifications.length, 0);

  generation = 2;
  await resumed.watcher.poll();
  assert.equal(resumed.notifications.length, 1);
});

test("a new terminal generation discovered after reconnect is delivered once", async () => {
  let generation = 1;
  const { watcher, state, notifications } = harness({
    spaces: [space("local", { active: true })],
    exec: async (_command, args) => ok(args.at(-1) === "status" ? status(generation, "passed") : capabilities()),
  });

  await watcher.poll();
  state.spaces = [];
  await watcher.poll();
  assert.equal(watcher.hasProjects(), false);
  state.spaces = [space("local", { active: true })];
  generation = 2;
  await watcher.poll();

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].body, "Run #2 passed · local · app");
});

test("closing the last space suppresses an in-flight result, and closing the watcher stops future polls", async () => {
  const pending = deferred();
  let statusCalls = 0;
  const { watcher, state, calls, notifications } = harness({
    spaces: [space("local", { active: true })],
    exec: async (_command, args) => {
      if (args.at(-1) === "capabilities") return pending.promise;
      statusCalls += 1;
      return ok(status(3, "failed"));
    },
  });

  const running = watcher.poll();
  assert.equal(calls.length, 1);
  state.spaces = [];
  watcher.sync();
  pending.resolve(ok(capabilities()));
  await running;

  assert.equal(statusCalls, 0);
  assert.equal(notifications.length, 0);
  assert.equal(watcher.current().state, "no-project");

  state.spaces = [space("local", { active: true })];
  await watcher.poll();
  watcher.close();
  const callsAtClose = calls.length;
  await watcher.poll();
  assert.equal(calls.length, callsAtClose);
});

test("polls do not overlap, and per-project command concurrency stays bounded", async () => {
  const pending = deferred();
  let active = 0;
  let maxActive = 0;
  let firstCall = true;
  const spaces = Array.from({ length: 9 }, (_, index) => space(`p${index}`, { folder: `/work/${index}` }));
  const { watcher, calls } = harness({
    spaces,
    exec: async (_command, args) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        if (firstCall) {
          firstCall = false;
          return await pending.promise;
        }
        await Promise.resolve();
        return ok(args.at(-1) === "status" ? status() : capabilities());
      } finally {
        active -= 1;
      }
    },
  });

  const firstPoll = watcher.poll();
  const callsAtFirstPoll = calls.length;
  await watcher.poll();
  assert.equal(calls.length, callsAtFirstPoll, "a second poll is skipped while the first is pending");
  pending.resolve(ok(capabilities()));
  await firstPoll;

  assert.ok(maxActive <= 4);
  assert.ok(maxActive > 1);
  assert.equal(calls.length, spaces.length * 3);
});

test("reselection during a remote request keeps each result bound to its exact project", async () => {
  const localStatus = deferred();
  let localDone;
  const localFinished = new Promise((resolve) => {
    localDone = resolve;
  });
  const state = {
    spaces: [
      space("local", { folder: "/work/local", active: true }),
      space("remote", { machine: "build-box", folder: "/work/remote" }),
    ],
  };
  const { watcher, notifications } = harness({
    ...state,
    remoteEnabled: true,
    spaces: state.spaces,
    exec: async (_command, args, config) => {
      if (args.at(-1) === "status" && config.cwd === "/work/local") {
        const result = await localStatus.promise;
        localDone();
        return result;
      }
      if (args.at(-1) === "status") return ok(status(8, "passed"));
      return ok(capabilities());
    },
  });

  const polling = watcher.poll();
  await Promise.resolve();
  await Promise.resolve();
  state.spaces[0].active = false;
  state.spaces[1].active = true;
  localStatus.resolve(ok(status(3, "running")));
  await localFinished;
  await polling;

  assert.equal(watcher.current().state, "passed");
  assert.equal(watcher.current().generation, 8);
  assert.equal(notifications.length, 0);
});
