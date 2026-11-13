import assert from "node:assert/strict";
import test from "node:test";
import { SessionizerController } from "../../.build/mods/muxcle-sessionizer/sessionizer/controller.js";

const config = '{"roots":["/workspaces"]}';
const localProject = {
  key: '[null,"/workspaces/app"]',
  name: "app",
  path: "/workspaces/app",
  machine: null,
  machineId: null,
  stale: false,
};

function createHarness(options = {}) {
  let currentSpaces = options.spaces ?? [];
  const calls = { discover: [], lookup: [], selected: [], created: [], closed: 0 };
  const adapter = {
    readConfig: options.readConfig ?? (async () => config),
    discover:
      options.discover ??
      (async (config, publish) => {
        calls.discover.push(config);
        publish({ projects: options.projects ?? [localProject], warnings: [], truncated: false, loading: false });
      }),

    spaces: () => currentSpaces,
    connectedMachines: options.connectedMachines ?? (async () => []),
    findSpace:
      options.findSpace ??
      (async (folder, machine, spaces) => {
        calls.lookup.push({ folder, machine, spaces: [...spaces] });
        return '{"spaceId":null}';
      }),
    selectSpace: (id) => calls.selected.push(id),
    createSpace: (folder, machine) => calls.created.push({ folder, machine }),
    close: () => {
      calls.closed += 1;
    },
  };
  return {
    calls,
    controller: new SessionizerController(adapter, "/app/data/muxcle-sessionizer/config.json"),
    setSpaces(spaces) {
      currentSpaces = spaces;
    },
  };
}

async function loadReady(harness) {
  await harness.controller.load();
  assert.equal(harness.controller.snapshot().status, "ready");
}

test("missing and empty configs show setup without default roots or discovery", async () => {
  for (const raw of [null, '{"roots":[]}', '{"roots":[],"remoteRoots":{},"homeRoots":[],"connectedHomeRoots":[]}']) {
    const harness = createHarness({ readConfig: async () => raw });
    await harness.controller.load();
    assert.equal(harness.controller.snapshot().status, "setup");
    assert.match(harness.controller.snapshot().message, /config.json/);
    assert.deepEqual(harness.calls.discover, []);
    assert.deepEqual(harness.calls.created, []);
  }
});

test("explicit home-relative roots are passed to discovery without defaults", async () => {
  const configured = {
    roots: [],
    remoteRoots: {},
    homeRoots: ["work", "other"],
    connectedHomeRoots: ["work", "other"],
  };
  const harness = createHarness({ readConfig: async () => JSON.stringify(configured) });

  await loadReady(harness);

  assert.deepEqual(harness.calls.discover, [
    {
      kind: "ready",
      roots: [],
      remoteRoots: {},
      homeRoots: ["work", "other"],
      connectedHomeRoots: ["work", "other"],
    },
  ]);
});

test("invalid config and discovery failures fail closed", async () => {
  const invalidConfig = createHarness({ readConfig: async () => '{"roots":["relative"]}' });
  await invalidConfig.controller.load();
  assert.equal(invalidConfig.controller.snapshot().status, "error");
  assert.deepEqual(invalidConfig.calls.discover, []);

  const invalidDiscovery = createHarness({
    discover: async () => {
      throw new Error("invalid output");
    },
  });
  await invalidDiscovery.controller.load();
  assert.equal(invalidDiscovery.controller.snapshot().status, "error");
  assert.deepEqual(invalidDiscovery.calls.created, []);
});

test("selects a live local space with the same canonical folder", async () => {
  const harness = createHarness({
    spaces: [{ id: "local-app", folder: "/workspaces/app", machine: null, active: false }],
    findSpace: async (folder, machine, spaces) => {
      harnessCalls.lookup.push({ folder, machine, spaces: [...spaces] });
      return '{"spaceId":"local-app"}';
    },
  });
  const harnessCalls = harness.calls;
  await loadReady(harness);
  assert.equal(await harness.controller.choose(localProject.key), true);
  assert.deepEqual(harness.calls.selected, ["local-app"]);
  assert.deepEqual(harness.calls.created, []);
  assert.equal(harness.calls.closed, 1);
});

test("ignores remote folder collisions when selecting local projects", async () => {
  const harness = createHarness({
    spaces: [{ id: "remote-app", folder: "/workspaces/app", machine: "build", active: true }],
  });
  await loadReady(harness);
  assert.equal(await harness.controller.choose(localProject.key), true);
  assert.deepEqual(harness.calls.lookup[0].spaces, []);
  assert.deepEqual(harness.calls.created, [{ folder: "/workspaces/app", machine: null }]);
});

test("opens remote projects only on the same connected core identity", async () => {
  const project = {
    ...localProject,
    key: '["core-1","/workspaces/app"]',
    machine: "build",
    machineId: "core-1",
    stale: false,
  };
  const harness = createHarness({
    readConfig: async () => '{"roots":[],"remoteRoots":{"build":["/workspaces"]}}',
    projects: [project],
    connectedMachines: async () => [{ id: "core-1", name: "build" }],
    findSpace: async (folder, machine, spaces) => {
      harness.calls.lookup.push({ folder, machine, spaces: [...spaces] });
      return '{"spaceId":null}';
    },
  });
  await loadReady(harness);
  assert.equal(await harness.controller.choose(project.key), true);
  assert.deepEqual(harness.calls.lookup[0].spaces, []);
  assert.deepEqual(harness.calls.created, [{ folder: "/workspaces/app", machine: "build" }]);
});

test("reuses a remote default space when its empty folder denotes that machine's home", async () => {
  const project = {
    ...localProject,
    key: '["core-1","/remote/home"]',
    name: "remote-home",
    path: "/remote/home",
    machine: "build",
    machineId: "core-1",
    stale: true,
  };
  const harness = createHarness({
    readConfig: async () => '{"roots":[],"remoteRoots":{"build":["/remote"]}}',
    projects: [project],
    spaces: [{ id: "remote-home-space", folder: "", machine: "build", active: true }],
    connectedMachines: async () => [{ id: "core-1", name: "build" }],
    findSpace: async (_folder, machine, spaces) => {
      assert.equal(machine, "build");
      assert.equal(spaces[0].folder, "");
      return '{"spaceId":"remote-home-space"}';
    },
  });
  await loadReady(harness);
  assert.equal(await harness.controller.choose(project.key), true);
  assert.deepEqual(harness.calls.selected, ["remote-home-space"]);
  assert.deepEqual(harness.calls.created, []);
});

test("a project outside the remote default space creates on that machine only", async () => {
  const project = {
    ...localProject,
    key: '["core-1","/remote/projects/app"]',
    path: "/remote/projects/app",
    machine: "build",
    machineId: "core-1",
    stale: true,
  };
  const harness = createHarness({
    readConfig: async () => '{"roots":[],"remoteRoots":{"build":["/remote"]}}',
    projects: [project],
    spaces: [{ id: "remote-home-space", folder: "", machine: "build", active: true }],
    connectedMachines: async () => [{ id: "core-1", name: "build" }],
    findSpace: async (_folder, machine, spaces) => {
      assert.equal(machine, "build");
      assert.equal(spaces[0].folder, "");
      return '{"spaceId":null}';
    },
  });
  await loadReady(harness);
  assert.equal(await harness.controller.choose(project.key), true);
  assert.deepEqual(harness.calls.selected, []);
  assert.deepEqual(harness.calls.created, [{ folder: project.path, machine: "build" }]);
});

test("rejects a stale or retargeted remote machine without local fallback", async () => {
  const project = {
    ...localProject,
    key: '["core-old","/workspaces/app"]',
    machine: "build",
    machineId: "core-old",
    stale: true,
  };
  const harness = createHarness({
    readConfig: async () => '{"roots":[],"remoteRoots":{"build":["/workspaces"]}}',
    projects: [project],
    connectedMachines: async () => [{ id: "core-new", name: "build" }],
  });
  await loadReady(harness);
  assert.equal(await harness.controller.choose(project.key), false);
  assert.match(harness.controller.snapshot().message, /no local space was opened/);
  assert.deepEqual(harness.calls.lookup, []);
  assert.deepEqual(harness.calls.created, []);
});

test("rechecks machine identity after lookup before dispatch", async () => {
  const project = {
    ...localProject,
    key: '["core-1","/workspaces/app"]',
    machine: "build",
    machineId: "core-1",
    stale: false,
  };
  let reads = 0;
  const harness = createHarness({
    readConfig: async () => '{"roots":[],"remoteRoots":{"build":["/workspaces"]}}',
    projects: [project],
    connectedMachines: async () => (++reads === 1 ? [{ id: "core-1", name: "build" }] : []),
    findSpace: async () => '{"spaceId":null}',
  });
  await loadReady(harness);
  assert.equal(await harness.controller.choose(project.key), false);
  assert.match(harness.controller.snapshot().message, /disconnected while selecting/);
  assert.deepEqual(harness.calls.created, []);
});

test("a removed remote selection stays non-actionable until explicit reselection", async () => {
  const remoteProject = {
    ...localProject,
    key: '["core-build","/workspaces/app"]',
    machine: "build",
    machineId: "core-build",
    stale: true,
  };
  let publishRefresh;
  const harness = createHarness({
    readConfig: async () => '{"roots":["/workspaces"],"remoteRoots":{"build":["/workspaces"]}}',
    discover: async (_config, publish) => {
      publishRefresh = publish;
      publish({ projects: [localProject, remoteProject], warnings: [], truncated: false, loading: true });
    },
  });
  await loadReady(harness);
  harness.controller.setQuery("app");
  harness.controller.moveSelection(1);
  assert.equal(harness.controller.snapshot().selectedKey, remoteProject.key);

  publishRefresh({ projects: [localProject], warnings: [], truncated: false, loading: true });
  publishRefresh({ projects: [localProject], warnings: [], truncated: false, loading: false });
  assert.equal(harness.controller.snapshot().selectedKey, null);
  assert.match(harness.controller.snapshot().message, /choose a project again/i);
  assert.equal(await harness.controller.chooseSelected(), false);
  assert.deepEqual(harness.calls.created, []);

  harness.controller.moveSelection(1);
  assert.equal(harness.controller.snapshot().selectedKey, localProject.key);
  assert.equal(await harness.controller.chooseSelected(), true);
  assert.deepEqual(harness.calls.created, [{ folder: localProject.path, machine: null }]);
});

test("cancel during the final machine check prevents the pending space action", async () => {
  const project = {
    ...localProject,
    key: '["core-1","/workspaces/app"]',
    machine: "build",
    machineId: "core-1",
    stale: false,
  };
  let resolveFinalCheck;
  let finalCheckStarted;
  const started = new Promise((resolve) => {
    finalCheckStarted = resolve;
  });
  const finalCheck = new Promise((resolve) => {
    resolveFinalCheck = resolve;
  });
  let reads = 0;
  const harness = createHarness({
    readConfig: async () => '{"roots":[],"remoteRoots":{"build":["/workspaces"]}}',
    projects: [project],
    connectedMachines: async () => {
      reads++;
      if (reads === 2) {
        finalCheckStarted();
        return finalCheck;
      }
      return [{ id: "core-1", name: "build" }];
    },
    findSpace: async () => '{"spaceId":null}',
  });
  await loadReady(harness);
  const selection = harness.controller.choose(project.key);
  await started;
  harness.controller.cancel();
  resolveFinalCheck([{ id: "core-1", name: "build" }]);
  assert.equal(await selection, false);
  assert.deepEqual(harness.calls.created, []);
});

test("a space added during the final machine check is reused instead of duplicated", async () => {
  const project = {
    ...localProject,
    key: '["core-1","/workspaces/app"]',
    machine: "build",
    machineId: "core-1",
    stale: false,
  };
  let resolveFinalCheck;
  let finalCheckStarted;
  const started = new Promise((resolve) => {
    finalCheckStarted = resolve;
  });
  const finalCheck = new Promise((resolve) => {
    resolveFinalCheck = resolve;
  });
  let reads = 0;
  const harness = createHarness({
    readConfig: async () => '{"roots":[],"remoteRoots":{"build":["/workspaces"]}}',
    projects: [project],
    connectedMachines: async () => {
      reads++;
      if (reads === 2) {
        finalCheckStarted();
        return finalCheck;
      }
      return [{ id: "core-1", name: "build" }];
    },
    findSpace: async (_folder, _machine, spaces) => JSON.stringify({ spaceId: spaces[0]?.id ?? null }),
  });
  await loadReady(harness);
  const selection = harness.controller.choose(project.key);
  await started;
  harness.setSpaces([{ id: "new-space", folder: "/workspaces/app", machine: "build", active: false }]);
  resolveFinalCheck([{ id: "core-1", name: "build" }]);
  assert.equal(await selection, true);
  assert.deepEqual(harness.calls.selected, ["new-space"]);
  assert.deepEqual(harness.calls.created, []);
});

test("stale row keys cannot launch a project hidden by a changed query", async () => {
  const harness = createHarness();
  await loadReady(harness);
  harness.controller.setQuery("does-not-match");
  assert.equal(await harness.controller.choose(localProject.key), false);
  assert.match(harness.controller.snapshot().message, /no longer visible/);
  assert.deepEqual(harness.calls.lookup, []);
});

test("a query change during the space check cannot launch the now-hidden project", async () => {
  let resolveLookup;
  const lookup = new Promise((resolve) => {
    resolveLookup = resolve;
  });
  const harness = createHarness({ findSpace: () => lookup });
  await loadReady(harness);
  const selection = harness.controller.choose(localProject.key);
  harness.controller.setQuery("does-not-match");
  resolveLookup('{"spaceId":null}');
  assert.equal(await selection, false);
  assert.match(harness.controller.snapshot().message, /no longer visible/);
  assert.deepEqual(harness.calls.created, []);
});

test("duplicate submits dispatch once while the space check is pending", async () => {
  let resolveLookup;
  const lookup = new Promise((resolve) => {
    resolveLookup = resolve;
  });
  const harness = createHarness({ findSpace: () => lookup });
  await loadReady(harness);
  const first = harness.controller.choose(localProject.key);
  assert.equal(await harness.controller.choose(localProject.key), false);
  resolveLookup('{"spaceId":null}');
  assert.equal(await first, true);
  assert.deepEqual(harness.calls.created, [{ folder: "/workspaces/app", machine: null }]);
  assert.equal(harness.calls.closed, 1);
});

test("cancel and host disposal prevent pending selections", async () => {
  for (const close of [true, false]) {
    let resolveLookup;
    const lookup = new Promise((resolve) => {
      resolveLookup = resolve;
    });
    const harness = createHarness({ findSpace: () => lookup });
    await loadReady(harness);
    const selection = harness.controller.choose(localProject.key);
    assert.equal(close ? harness.controller.cancel() : harness.controller.dispose(), true);
    resolveLookup('{"spaceId":null}');
    assert.equal(await selection, false);
    assert.deepEqual(harness.calls.created, []);
    assert.deepEqual(harness.calls.selected, []);
    assert.equal(harness.calls.closed, close ? 1 : 0);
  }
});

test("a disappeared project folder and invalid match result do not create a space", async () => {
  for (const output of ['{"spaceId":null,"error":"folder_missing"}', '{"spaceId":"unknown"}']) {
    const harness = createHarness({ findSpace: async () => output });
    await loadReady(harness);
    assert.equal(await harness.controller.choose(localProject.key), false);
    assert.deepEqual(harness.calls.created, []);
  }
});
