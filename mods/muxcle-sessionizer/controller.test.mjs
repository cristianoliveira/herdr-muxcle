import assert from "node:assert/strict";
import test from "node:test";
import { SessionizerController } from "../../.build/mods/muxcle-sessionizer/sessionizer/controller.js";

const config = '{"roots":["/workspaces"]}';
const discovery = JSON.stringify({
  projects: [{ name: "app", path: "/workspaces/app" }],
  warnings: [],
  truncated: false,
});

function createHarness(options = {}) {
  let currentSpaces = options.spaces ?? [];
  const calls = { discover: [], lookup: [], selected: [], created: [], closed: 0 };
  const adapter = {
    readConfig: options.readConfig ?? (async () => config),
    discover:
      options.discover ??
      (async (roots) => {
        calls.discover.push([...roots]);
        return discovery;
      }),
    spaces: () => currentSpaces,
    findLocalSpace:
      options.findLocalSpace ??
      (async (folder, spaces) => {
        calls.lookup.push({ folder, spaces: [...spaces] });
        return '{"spaceId":null}';
      }),
    selectSpace: (id) => calls.selected.push(id),
    createLocalSpace: (folder) => calls.created.push(folder),
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
  for (const raw of [null, '{"roots":[]}']) {
    const harness = createHarness({ readConfig: async () => raw });
    await harness.controller.load();
    const state = harness.controller.snapshot();

    assert.equal(state.status, "setup");
    assert.match(state.message, /config.json/);
    assert.deepEqual(harness.calls.discover, []);
    assert.deepEqual(harness.calls.created, []);
  }
});

test("invalid config and malformed helper output fail closed", async () => {
  const invalidConfig = createHarness({ readConfig: async () => '{"roots":["relative"]}' });
  await invalidConfig.controller.load();
  assert.equal(invalidConfig.controller.snapshot().status, "error");
  assert.deepEqual(invalidConfig.calls.discover, []);

  const invalidDiscovery = createHarness({ discover: async () => "not-json" });
  await invalidDiscovery.controller.load();
  assert.equal(invalidDiscovery.controller.snapshot().status, "error");
  assert.match(invalidDiscovery.controller.snapshot().message, /invalid data/);
  assert.deepEqual(invalidDiscovery.calls.created, []);
});

test("selects a live local space with the same canonical folder", async () => {
  const harness = createHarness({
    spaces: [{ id: "local-app", folder: "/workspaces/app", machine: null, active: false }],
    findLocalSpace: async (folder, spaces) => {
      harnessCalls.lookup.push({ folder, spaces: [...spaces] });
      return '{"spaceId":"local-app"}';
    },
  });
  const harnessCalls = harness.calls;
  await loadReady(harness);

  assert.equal(await harness.controller.choose("project-0"), true);
  assert.deepEqual(harness.calls.selected, ["local-app"]);
  assert.deepEqual(harness.calls.created, []);
  assert.equal(harness.calls.closed, 1);
});

test("ignores remote folder collisions and creates only one explicit local space", async () => {
  const harness = createHarness({
    spaces: [{ id: "remote-app", folder: "/workspaces/app", machine: "build", active: true }],
    findLocalSpace: async (folder, spaces) => {
      harness.calls.lookup.push({ folder, spaces: [...spaces] });
      return '{"spaceId":null}';
    },
  });
  await loadReady(harness);

  assert.equal(await harness.controller.choose("project-0"), true);
  assert.deepEqual(harness.calls.lookup[0].spaces, []);
  assert.deepEqual(harness.calls.created, ["/workspaces/app"]);
  assert.deepEqual(harness.calls.selected, []);
  assert.equal(harness.calls.closed, 1);
});

test("rechecks spaces after discovery lookup before creating a new space", async () => {
  const harness = createHarness({
    findLocalSpace: async (_folder, spaces) => {
      harness.calls.lookup.push([...spaces]);
      if (harness.calls.lookup.length === 1) {
        harness.setSpaces([{ id: "local-app", folder: "/workspaces/app", machine: null, active: true }]);
        return '{"spaceId":null}';
      }
      return '{"spaceId":"local-app"}';
    },
  });
  await loadReady(harness);

  assert.equal(await harness.controller.choose("project-0"), true);
  assert.equal(harness.calls.lookup.length, 2);
  assert.deepEqual(harness.calls.selected, ["local-app"]);
  assert.deepEqual(harness.calls.created, []);
});

test("stale row keys cannot launch a project hidden by a changed query", async () => {
  const harness = createHarness();
  await loadReady(harness);
  harness.controller.setQuery("does-not-match");

  assert.equal(await harness.controller.choose("project-0"), false);
  assert.match(harness.controller.snapshot().message, /no longer visible/);
  assert.deepEqual(harness.calls.lookup, []);
  assert.deepEqual(harness.calls.created, []);
});

test("duplicate submits dispatch once while the local-space check is pending", async () => {
  let resolveLookup;
  const lookup = new Promise((resolve) => {
    resolveLookup = resolve;
  });
  const harness = createHarness({
    findLocalSpace: () => lookup,
  });
  await loadReady(harness);

  const first = harness.controller.choose("project-0");
  const second = await harness.controller.choose("project-0");
  assert.equal(second, false);
  resolveLookup('{"spaceId":null}');

  assert.equal(await first, true);
  assert.deepEqual(harness.calls.created, ["/workspaces/app"]);
  assert.equal(harness.calls.closed, 1);
});

test("cancel during lookup closes once and prevents a later command", async () => {
  let resolveLookup;
  const lookup = new Promise((resolve) => {
    resolveLookup = resolve;
  });
  const harness = createHarness({ findLocalSpace: () => lookup });
  await loadReady(harness);

  const selection = harness.controller.choose("project-0");
  assert.equal(harness.controller.cancel(), true);
  resolveLookup('{"spaceId":null}');

  assert.equal(await selection, false);
  assert.equal(harness.controller.snapshot().status, "closed");
  assert.deepEqual(harness.calls.created, []);
  assert.deepEqual(harness.calls.selected, []);
  assert.equal(harness.calls.closed, 1);
});

test("host disposal prevents a pending selection without closing the host again", async () => {
  let resolveLookup;
  const lookup = new Promise((resolve) => {
    resolveLookup = resolve;
  });
  const harness = createHarness({ findLocalSpace: () => lookup });
  await loadReady(harness);

  const selection = harness.controller.choose("project-0");
  assert.equal(harness.controller.dispose(), true);
  assert.equal(harness.controller.dispose(), false);
  resolveLookup('{"spaceId":null}');

  assert.equal(await selection, false);
  assert.equal(harness.controller.snapshot().status, "closed");
  assert.deepEqual(harness.calls.created, []);
  assert.deepEqual(harness.calls.selected, []);
  assert.equal(harness.calls.closed, 0);
});

test("a disappeared project folder and invalid match result do not create a space", async () => {
  const missing = createHarness({ findLocalSpace: async () => '{"spaceId":null,"error":"folder_missing"}' });
  await loadReady(missing);
  assert.equal(await missing.controller.choose("project-0"), false);
  assert.match(missing.controller.snapshot().message, /no longer available/);
  assert.deepEqual(missing.calls.created, []);

  const malformed = createHarness({ findLocalSpace: async () => '{"spaceId":"remote-id"}' });
  await loadReady(malformed);
  assert.equal(await malformed.controller.choose("project-0"), false);
  assert.match(malformed.controller.snapshot().message, /unknown local space/);
  assert.deepEqual(malformed.calls.created, []);
});
