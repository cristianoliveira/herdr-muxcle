import assert from "node:assert/strict";
import test from "node:test";
import { createSessionizerAdapter } from "../../.build/mods/muxcle-sessionizer/sessionizer/adapter.js";

function createApi(overrides = {}) {
  const calls = { reads: [], execs: [], commands: [], closed: [], shared: [], saved: [] };
  const api = {
    readTextFile: async (path) => {
      calls.reads.push(path);
      return null;
    },
    exec: async (command, args, options) => {
      calls.execs.push({ command, args, options });
      return { code: 0, stdout: '{"projects":[],"warnings":[],"truncated":false}', stderr: "" };
    },
    spaces: () => [],
    home: () => "/users/tester",
    shared: (key) => {
      calls.shared.push(key);
      return null;
    },
    setShared: (key, value) => {
      calls.saved.push({ key, value });
      return null;
    },
    run: (name, args) => {
      calls.commands.push({ name, args });
      return null;
    },
    closeOverlay: (id) => {
      calls.closed.push(id);
      return null;
    },
    ...overrides,
  };
  return { api, calls };
}

test("native adapter reads only explicit config and scans configured local roots with argv", async () => {
  const { api, calls } = createApi();
  const adapter = createSessionizerAdapter(
    api,
    "/app/data/muxcle-sessionizer/config.json",
    "/app/mods/muxcle-sessionizer",
  );
  const updates = [];
  await adapter.discover(
    { roots: ["/workspaces/with spaces; echo unsafe"], remoteRoots: {}, homeRoots: [], connectedHomeRoots: [] },
    (state) => updates.push(state),
  );

  assert.deepEqual(calls.execs, [
    {
      command: "python3",
      args: ["-B", "discover.py", "discover", JSON.stringify(["/workspaces/with spaces; echo unsafe"])],
      options: { cwd: "/app/mods/muxcle-sessionizer", timeout: 10_000 },
    },
  ]);
  assert.equal(updates.at(-1).loading, false);
  assert.equal(
    calls.shared.every((key) => key === "muxcle-sessionizer.projects.v2"),
    true,
  );
});

test("remote roots are scanned only for connected exact aliases and cache retains core identity", async () => {
  const outputs = [
    '{"machines":[{"id":"core-1","name":"build"},{"id":"core-temp","name":"unconfigured-temp"}]}',
    '{"projects":[{"name":"app","path":"/remote/app"}],"warnings":[],"truncated":false}',
  ];
  const { api, calls } = createApi({
    exec: async (command, args, options) => {
      calls.execs.push({ command, args, options });
      return { code: 0, stdout: outputs.shift(), stderr: "" };
    },
  });
  const adapter = createSessionizerAdapter(api, "/config.json", "/mods/sessionizer");
  const states = [];
  await adapter.discover(
    { roots: [], remoteRoots: { build: ["/remote roots; $(data)"] }, homeRoots: [], connectedHomeRoots: [] },
    (state) => states.push(state),
  );

  assert.deepEqual(
    calls.execs.map(({ args }) => args),
    [
      ["-B", "discover.py", "machines"],
      ["-B", "discover.py", "remote", "build", JSON.stringify(["/remote roots; $(data)"])],
    ],
  );
  assert.equal(states.at(-1).projects[0].machine, "build");
  assert.equal(states.at(-1).projects[0].machineId, "core-1");
  assert.equal(calls.saved.at(-1).value.version, 2);
  assert.equal(calls.saved.at(-1).value.entries[0].machineId, "core-1");
  assert.deepEqual(calls.saved.at(-1).value.entries[0].roots, ["/remote roots; $(data)"]);
});

test("home-relative roots resolve inside local and connected machine Python environments", async () => {
  const outputs = [
    '{"machines":[{"id":"core-a","name":"build"},{"id":"core-b","name":"test"}]}',
    '{"projects":[{"name":"local-app","path":"/users/tester/work/local-app"}],"warnings":[],"truncated":false}',
    '{"projects":[{"name":"build-app","path":"/remote-build/home/work/build-app"}],"warnings":[],"truncated":false}',
    '{"projects":[{"name":"test-app","path":"/remote-test/home/work/test-app"}],"warnings":[],"truncated":false}',
  ];
  const { api, calls } = createApi({
    home: () => {
      throw new Error("remote home must be resolved by remote Python");
    },
    exec: async (command, args, options) => {
      calls.execs.push({ command, args, options });
      return { code: 0, stdout: outputs.shift(), stderr: "" };
    },
  });
  const adapter = createSessionizerAdapter(api, "/config.json", "/mods/sessionizer");
  const states = [];
  await adapter.discover(
    { roots: [], remoteRoots: {}, homeRoots: ["work", "other"], connectedHomeRoots: ["work", "other"] },
    (state) => states.push(state),
  );

  const scans = calls.execs
    .slice(1)
    .map(({ args }) => [args[2], args[2] === "remote" ? args[3] : null, JSON.parse(args.at(-1))]);
  assert.deepEqual(scans, [
    ["discover", null, ["~/work", "~/other"]],
    ["remote", "build", ["~/work", "~/other"]],
    ["remote", "test", ["~/work", "~/other"]],
  ]);
  assert.deepEqual(
    states.at(-1).projects.map(({ name, machine, machineId }) => [name, machine, machineId]),
    [
      ["local-app", null, null],
      ["build-app", "build", "core-a"],
      ["test-app", "test", "core-b"],
    ],
  );
  assert.deepEqual(
    Object.fromEntries(calls.saved.map(({ value }) => [value.entries[0].machine ?? "local", value.entries[0].roots])),
    { local: ["~/work", "~/other"], build: ["~/work", "~/other"], test: ["~/work", "~/other"] },
  );
});

test("connected home scans are deterministic and bounded to twelve permanent machines", async () => {
  const names = Array.from({ length: 13 }, (_, index) => `machine-${String(index).padStart(2, "0")}`);
  const outputs = [
    JSON.stringify({ machines: [...names].reverse().map((name) => ({ id: `core-${name}`, name })) }),
    ...Array.from({ length: 12 }, () => '{"projects":[],"warnings":[],"truncated":false}'),
  ];
  const { api, calls } = createApi({
    exec: async (command, args, options) => {
      calls.execs.push({ command, args, options });
      return { code: 0, stdout: outputs.shift(), stderr: "" };
    },
  });
  const adapter = createSessionizerAdapter(api, "/config.json", "/mods/sessionizer");
  const states = [];
  await adapter.discover({ roots: [], remoteRoots: {}, homeRoots: [], connectedHomeRoots: ["work"] }, (state) =>
    states.push(state),
  );

  assert.equal(calls.execs.length, 13);
  assert.deepEqual(
    calls.execs.slice(1).map(({ args }) => args[3]),
    names.slice(0, 12),
  );
  assert.match(states.at(-1).warnings.join(" "), /12 remote machines/);
});

test("machine-list failure preserves local projects and never scans a remote alias locally", async () => {
  const outputs = [
    { code: 1, stdout: "", stderr: "unavailable" },
    {
      code: 0,
      stdout: '{"projects":[{"name":"local","path":"/local/project"}],"warnings":[],"truncated":false}',
      stderr: "",
    },
  ];
  const { api, calls } = createApi({
    exec: async (command, args, options) => {
      calls.execs.push({ command, args, options });
      return outputs.shift();
    },
  });
  const adapter = createSessionizerAdapter(api, "/config.json", "/mods/sessionizer");
  const states = [];
  await adapter.discover(
    { roots: ["/local"], remoteRoots: { build: ["/remote"] }, homeRoots: [], connectedHomeRoots: [] },
    (state) => states.push(state),
  );

  assert.deepEqual(
    calls.execs.map(({ args }) => args),
    [
      ["-B", "discover.py", "machines"],
      ["-B", "discover.py", "discover", '["/local"]'],
    ],
  );
  assert.deepEqual(
    states.at(-1).projects.map(({ name, machine }) => [name, machine]),
    [["local", null]],
  );
  assert.match(states.at(-1).warnings.join(" "), /Could not verify connected machines/);
});

test("machine-scoped space lookup stays remote and actions always specify machine", async () => {
  const { api, calls } = createApi({
    home: () => {
      throw new Error("remote home must not come from this computer");
    },
    exec: async (command, args, options) => {
      calls.execs.push({ command, args, options });
      return { code: 0, stdout: '{"spaceId":null}', stderr: "" };
    },
  });
  const adapter = createSessionizerAdapter(api, "/config.json", "/mods/sessionizer");
  await adapter.findSpace("/remote/app", "build", [
    { id: "local", folder: "/remote/app", machine: null, active: true },
    { id: "remote-home", folder: "", machine: "build", active: true },
  ]);
  adapter.createSpace("/remote/app", "build");
  adapter.createSpace("/local/app", null);

  assert.deepEqual(calls.execs[0].args, [
    "-B",
    "discover.py",
    "remote-match",
    "build",
    JSON.stringify({ folder: "/remote/app", spaces: [{ id: "remote-home", folder: "", active: true }] }),
  ]);
  assert.deepEqual(calls.commands, [
    { name: "space.new", args: { folder: "/remote/app", machine: "build" } },
    { name: "space.new", args: { folder: "/local/app", machine: "" } },
  ]);
});

test("helper failures and oversized data fail closed without exposing stderr", async () => {
  const failing = createApi({ exec: async () => ({ code: 1, stdout: "", stderr: "private traceback" }) });
  const adapter = createSessionizerAdapter(failing.api, "/config.json", "/mods/sessionizer");
  await assert.rejects(adapter.findSpace("/work", null, []), /Project discovery failed/);
  const oversized = createApi();
  const oversizedAdapter = createSessionizerAdapter(oversized.api, "/config.json", "/mods/sessionizer");
  const oversizedStates = [];
  await oversizedAdapter.discover(
    { roots: [`/${"x".repeat(96 * 1024)}`], remoteRoots: {}, homeRoots: [], connectedHomeRoots: [] },
    (state) => oversizedStates.push(state),
  );
  assert.match(oversizedStates.at(-1).warnings.join(" "), /local: refresh failed/);
  assert.deepEqual(oversized.calls.execs, []);

  const output = createApi({ exec: async () => ({ code: 0, stdout: "x".repeat(512 * 1024 + 1), stderr: "" }) });
  const outputAdapter = createSessionizerAdapter(output.api, "/config.json", "/mods/sessionizer");
  const outputStates = [];
  await outputAdapter.discover({ roots: ["/work"], remoteRoots: {}, homeRoots: [], connectedHomeRoots: [] }, (state) =>
    outputStates.push(state),
  );
  assert.match(outputStates.at(-1).warnings.join(" "), /local: refresh failed/);
});

test("overlay cleanup is scoped and absent overlay ids are ignored", () => {
  const { api, calls } = createApi();
  createSessionizerAdapter(api, "/config.json", "/mods/sessionizer", "overlay-2").close();
  createSessionizerAdapter(api, "/config.json", "/mods/sessionizer").close();
  assert.deepEqual(calls.closed, ["overlay-2"]);
});
