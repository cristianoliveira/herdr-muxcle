import assert from "node:assert/strict";
import test from "node:test";
import { refreshProjects, restoreProjectCache } from "../../.build/mods/muxcle-sessionizer/sessionizer/discovery.js";

const result = (name, path) => ({ projects: [{ name, path }], warnings: [], truncated: false });

test("cached projects appear immediately and scans publish progressively in stable machine order", async () => {
  const states = [];
  let finishRemote;
  const cache = [
    { machine: "build", machineId: "core-build", roots: ["/remote"], updatedAt: 0, ...result("old", "/remote/old") },
  ];
  const running = refreshProjects({
    cache,
    roots: { "": ["/local"], build: ["/remote"] },
    connectedMachines: [{ id: "core-build", name: "build" }],
    now: () => 100_000,
    scan: (machine) =>
      machine === null
        ? Promise.resolve(result("local", "/local/project"))
        : new Promise((resolve) => {
            finishRemote = resolve;
          }),
    publish: (state) => states.push(state),
    persist: () => {},
  });
  assert.deepEqual(
    states[0].projects.map(({ name }) => name),
    ["old"],
  );
  assert.equal(states[0].projects[0].stale, true);
  await Promise.resolve();
  assert.ok(states.some((state) => state.projects.some(({ name }) => name === "local")));
  finishRemote(result("fresh", "/remote/fresh"));
  await running;
  assert.deepEqual(
    states.at(-1).projects.map(({ name }) => name),
    ["local", "fresh"],
  );
  assert.equal(states.at(-1).loading, false);
});

test("a remote alias named local stays distinct from this computer", async () => {
  const states = [];
  await refreshProjects({
    cache: [],
    roots: { "": ["/projects"], local: ["/projects"] },
    connectedMachines: [{ id: "core-local-alias", name: "local" }],
    scan: async (_machine) => result("same-path", "/projects/app"),
    publish: (state) => states.push(state),
    persist: () => {},
  });
  const projects = states.at(-1).projects;
  assert.equal(projects.length, 2);
  assert.notEqual(projects[0].key, projects[1].key);
  assert.deepEqual(
    projects.map(({ machine, machineId }) => [machine, machineId]),
    [
      [null, null],
      ["local", "core-local-alias"],
    ],
  );
});

test("aggregate result bounds preserve at least the first project from each machine", async () => {
  const states = [];
  await refreshProjects({
    cache: [],
    roots: { "": ["/local"], build: ["/remote"] },
    connectedMachines: [{ id: "core-build", name: "build" }],
    scan: async (machine) =>
      machine
        ? result("remote-project", "/remote/remote-project")
        : {
            projects: Array.from({ length: 500 }, (_, index) => ({ name: `local-${index}`, path: `/local/${index}` })),
            warnings: [],
            truncated: false,
          },
    publish: (state) => states.push(state),
    persist: () => {},
  });
  const state = states.at(-1);
  assert.equal(state.projects.length, 500);
  assert.ok(state.projects.some(({ machine }) => machine === "build"));
  assert.equal(state.truncated, true);
});

test("fresh cache skips scanning until its sixty-second lifetime expires", async () => {
  let scans = 0;
  const states = [];
  await refreshProjects({
    cache: [
      {
        machine: "build",
        machineId: "core-build",
        roots: ["/remote"],
        updatedAt: 40_001,
        ...result("cached", "/remote/cached"),
      },
    ],
    roots: { build: ["/remote"] },
    connectedMachines: [{ id: "core-build", name: "build" }],
    now: () => 100_000,
    scan: async () => {
      scans++;
      return result("fresh", "/remote/fresh");
    },
    publish: (state) => states.push(state),
    persist: () => {},
  });
  assert.equal(scans, 0);
  assert.equal(states.at(-1).projects[0].stale, false);
});

test("scan concurrency is capped at four machines", async () => {
  let active = 0;
  let peak = 0;
  const releases = [];
  const names = ["a", "b", "c", "d", "e", "f"];
  const running = refreshProjects({
    cache: [],
    roots: Object.fromEntries(names.map((name) => [name, [`/${name}`]])),
    connectedMachines: names.map((name) => ({ id: `core-${name}`, name })),
    scan: (machine) =>
      new Promise((resolve) => {
        active++;
        peak = Math.max(peak, active);
        releases.push(() => {
          active--;
          resolve(result(machine, `/${machine}/project`));
        });
      }),
    publish: () => {},
    persist: () => {},
  });
  await Promise.resolve();
  assert.equal(peak, 4);
  while (releases.length) {
    releases.shift()();
    await Promise.resolve();
  }
  await running;
  assert.equal(peak, 4);
});

test("offline cache is visible but stale, and a failed remote refresh never creates local output", async () => {
  const states = [];
  await refreshProjects({
    cache: [
      {
        machine: "local",
        machineId: "core-local",
        roots: ["/remote"],
        updatedAt: 0,
        ...result("cached", "/remote/project"),
      },
    ],
    roots: { local: ["/remote"] },
    connectedMachines: [],
    now: () => 100_000,
    scan: async () => assert.fail("offline machine must not be scanned"),
    publish: (state) => states.push(state),
    persist: () => {},
  });
  assert.equal(states[0].projects[0].machine, "local");
  assert.equal(states[0].projects[0].stale, true);
  assert.match(states.at(-1).warnings[0], /disconnected/);
});

test("a reconnect refreshes stale cached results only for the same permanent identity", async () => {
  const cache = [
    {
      machine: "build",
      machineId: "core-build",
      roots: ["/remote"],
      updatedAt: 0,
      ...result("cached", "/remote/cached"),
    },
  ];
  const states = [];
  await refreshProjects({
    cache,
    roots: { build: ["/remote"] },
    connectedMachines: [{ id: "core-build", name: "build" }],
    now: () => 100_000,
    scan: async () => result("reconnected", "/remote/reconnected"),
    publish: (state) => states.push(state),
    persist: () => {},
  });
  assert.equal(states[0].projects[0].stale, true);
  assert.deepEqual(
    states.at(-1).projects.map(({ name }) => name),
    ["reconnected"],
  );
  assert.equal(states.at(-1).projects[0].stale, false);
});

test("failed refresh retains and marks same-identity cached results stale", async () => {
  const states = [];
  await refreshProjects({
    cache: [
      {
        machine: "build",
        machineId: "core-build",
        roots: ["/remote"],
        updatedAt: 0,
        ...result("cached", "/remote/cached"),
      },
    ],
    roots: { build: ["/remote"] },
    connectedMachines: [{ id: "core-build", name: "build" }],
    now: () => 100_000,
    scan: async () => {
      throw new Error("transport failure");
    },
    publish: (state) => states.push(state),
    persist: () => {},
  });
  assert.equal(states.at(-1).projects[0].name, "cached");
  assert.equal(states.at(-1).projects[0].stale, true);
  assert.match(states.at(-1).warnings.join(" "), /cached projects retained as stale/);
});

test("cache entries are scoped to the exact configured roots and permanent core identity", async () => {
  const states = [];
  const cached = [
    { machine: "build", machineId: "old-core", roots: ["/old-root"], updatedAt: 1, ...result("old", "/old-root/old") },
  ];
  await refreshProjects({
    cache: cached,
    roots: { build: ["/new-root"] },
    connectedMachines: [{ id: "new-core", name: "build" }],
    now: () => 10,
    scan: async () => result("new", "/new-root/new"),
    publish: (state) => states.push(state),
    persist: () => {},
  });
  assert.deepEqual(states[0].projects, []);
  assert.deepEqual(
    states.at(-1).projects.map(({ name, machineId }) => [name, machineId]),
    [["new", "new-core"]],
  );
});

test("cache restoration accepts safe home-root specs and rejects traversing specs", () => {
  const base = {
    machine: null,
    machineId: null,
    updatedAt: 10,
    ...result("cached", "/users/tester/work/app"),
  };

  assert.equal(restoreProjectCache({ version: 2, entries: [{ ...base, roots: ["~/work"] }] }).length, 1);
  assert.deepEqual(restoreProjectCache({ version: 2, entries: [{ ...base, roots: ["~/../outside"] }] }), []);
  assert.deepEqual(restoreProjectCache({ version: 2, entries: [{ ...base, roots: ["~/work//projects"] }] }), []);
});

test("cache restoration rejects corrupt, duplicate, and oversized persisted data", () => {
  assert.deepEqual(restoreProjectCache({ version: 1, entries: [] }), []);
  const valid = {
    version: 2,
    entries: [
      { machine: "build", machineId: "core-build", roots: ["/remote"], updatedAt: 10, ...result("one", "/remote/one") },
    ],
  };
  assert.equal(restoreProjectCache(valid).length, 1);
  assert.deepEqual(
    restoreProjectCache({
      version: 2,
      entries: [
        ...valid.entries,
        {
          machine: "build",
          machineId: "core-build",
          roots: ["/remote"],
          updatedAt: 11,
          ...result("two", "/remote/two"),
        },
        {
          machine: null,
          machineId: null,
          roots: ["/local"],
          updatedAt: 10,
          projects: [{ name: "bad", path: "relative" }],
          warnings: [],
          truncated: false,
        },
      ],
    }),
    valid.entries,
  );
  assert.deepEqual(restoreProjectCache({ version: 2, entries: [], payload: "x".repeat(512 * 1024) }), []);
});
