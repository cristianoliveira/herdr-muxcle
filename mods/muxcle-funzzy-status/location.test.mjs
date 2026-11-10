import assert from "node:assert/strict";
import test from "node:test";
import { WatcherLocations, matchesWatcherProcess } from "../../.build/mods/muxcle-funzzy-status/location.js";

const space = (id, { folder = "/work/app", machine = null, named = true, name = "Custom tab" } = {}) => ({
  id,
  name: id,
  folder,
  machine,
  active: false,
  tabs: [{ id: `${id}-tab`, name, named }],
});
const pane = (id, terminal, tab) => ({ pane: id, terminal, tab });
const terminal = (address, cwd, argv = ["/usr/bin/fzz", "watch"]) =>
  JSON.stringify({
    address,
    state: "live",
    title: "not used as evidence",
    foreground: { cwd, argv },
  });
const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function harness({ spaces = [], panes = [], exec } = {}) {
  const state = { spaces, panes };
  const calls = [];
  const locations = new WatcherLocations({
    spaces: () => state.spaces,
    panes: () => state.panes,
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      return exec ? exec(command, args, options) : ok(terminal(args[1], "/work/app"));
    },
  });
  return { locations, state, calls };
}

test("watcher hints require exact foreground cwd, address, live state, and command", () => {
  const target = { terminal: "term-1", folder: "/work/app" };
  assert.equal(matchesWatcherProcess(JSON.parse(terminal("term-1", "/work/app")), target), true);
  assert.equal(matchesWatcherProcess(JSON.parse(terminal("term-2", "/work/app")), target), false);
  assert.equal(matchesWatcherProcess(JSON.parse(terminal("term-1", "/work/other")), target), false);
  assert.equal(matchesWatcherProcess(JSON.parse(terminal("term-1", "/work/app", ["fzz", "run"])), target), false);
  assert.equal(matchesWatcherProcess({ ...JSON.parse(terminal("term-1", "/work/app")), state: "dead" }, target), false);
});

test("finds one local foreground watcher and preserves its custom tab name", async () => {
  const { locations, calls } = harness({
    spaces: [
      space("local", { name: "Build" }),
      space("remote", { machine: "build-box" }),
      space("home", { folder: "" }),
    ],
    panes: [
      pane("pane-local", "term-local", "local-tab"),
      pane("pane-remote", "term-remote", "remote-tab"),
      pane("pane-home", "term-home", "home-tab"),
    ],
  });

  await locations.refresh();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    command: "hc",
    args: ["get", "term-local", "--json"],
    options: { on: null, timeout: 3000 },
  });
  assert.deepEqual(locations.unique("/work/app"), {
    terminal: "term-local",
    pane: "pane-local",
    tab: "local-tab",
    name: "Build",
  });
  assert.equal(locations.unique(""), null);
});

test("multiple foreground matches remain ambiguous and never choose an arbitrary pane", async () => {
  const { locations } = harness({
    spaces: [space("one", { name: "One" }), space("two", { name: "Two" })],
    panes: [pane("pane-1", "term-1", "one-tab"), pane("pane-2", "term-2", "two-tab")],
  });

  await locations.refresh();

  assert.equal(locations.forFolder("/work/app").length, 2);
  assert.equal(locations.unique("/work/app"), null);
});

test("limits local metadata reads and refuses a unique hint when the scan is truncated", async () => {
  const spaces = Array.from({ length: 40 }, (_, index) => space(`s${index}`, { folder: `/work/${index}` }));
  const panes = spaces.map((item, index) => pane(`p${index}`, `t${index}`, `${item.id}-tab`));
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const { locations } = harness({
    spaces,
    panes,
    exec: async (_command, args) => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      const index = Number(args[1].slice(1));
      return ok(terminal(args[1], `/work/${index}`));
    },
  });

  await locations.refresh();

  assert.equal(calls, 32);
  assert.ok(maxActive <= 4);
  assert.equal(locations.unique("/work/0"), null);
});

test("drops stale location results after spaces close or the location controller closes", async () => {
  const pending = deferred();
  const { locations, state } = harness({
    spaces: [space("local")],
    panes: [pane("pane-local", "term-local", "local-tab")],
    exec: async () => pending.promise,
  });

  const refresh = locations.refresh();
  state.spaces = [];
  state.panes = [];
  pending.resolve(ok(terminal("term-local", "/work/app")));
  await refresh;
  assert.equal(locations.unique("/work/app"), null);

  state.spaces = [space("local")];
  state.panes = [pane("pane-local", "term-local", "local-tab")];
  const afterReopen = deferred();
  // A fresh instance demonstrates controller-close invalidation during an in-flight read.
  const closed = harness({
    spaces: state.spaces,
    panes: state.panes,
    exec: async () => afterReopen.promise,
  });
  const closeRefresh = closed.locations.refresh();
  closed.locations.close();
  afterReopen.resolve(ok(terminal("term-local", "/work/app")));
  await closeRefresh;
  assert.equal(closed.locations.unique("/work/app"), null);
});

test("overlapping refreshes share one bounded metadata pass", async () => {
  const pending = deferred();
  let calls = 0;
  const { locations } = harness({
    spaces: [space("local")],
    panes: [pane("pane-local", "term-local", "local-tab")],
    exec: async () => {
      calls += 1;
      return pending.promise;
    },
  });

  const first = locations.refresh();
  await locations.refresh();
  assert.equal(calls, 1);
  pending.resolve(ok(terminal("term-local", "/work/app")));
  await first;
});
