import assert from "node:assert/strict";
import test from "node:test";
import {
  filterProjects,
  parseProjectDiscovery,
  parseSessionizerConfig,
  parseSpaceMatch,
  safeDisplayText,
  sameLocalSpaceSnapshot,
  sameMachineSpaceSnapshot,
} from "../../.build/mods/muxcle-sessionizer/sessionizer/model.js";

const projects = [
  { key: "project-0", name: "workspace-app", path: "/workspaces/workspace-app" },
  { key: "project-1", name: "app", path: "/workspaces/app" },
  { key: "project-2", name: "api", path: "/workspaces/server-api" },
];

test("config parsing distinguishes missing, empty, valid, and malformed roots", () => {
  assert.deepEqual(parseSessionizerConfig(null), { kind: "missing" });
  assert.deepEqual(parseSessionizerConfig('{"roots":[]}'), { kind: "empty" });
  assert.deepEqual(parseSessionizerConfig('{"roots":["/workspaces"]}'), {
    kind: "ready",
    roots: ["/workspaces"],
    remoteRoots: {},
    homeRoots: [],
    connectedHomeRoots: [],
  });
  assert.deepEqual(
    parseSessionizerConfig(
      '{"roots":[],"homeRoots":["work","other/client projects"],"connectedHomeRoots":["work","other"]}',
    ),
    {
      kind: "ready",
      roots: [],
      remoteRoots: {},
      homeRoots: ["work", "other/client projects"],
      connectedHomeRoots: ["work", "other"],
    },
  );
  assert.deepEqual(
    parseSessionizerConfig('{"roots":[],"remoteRoots":{"build":["/remote"]},"connectedHomeRoots":["work"]}'),
    {
      kind: "ready",
      roots: [],
      remoteRoots: { build: ["/remote"] },
      homeRoots: [],
      connectedHomeRoots: ["work"],
    },
  );
  for (const root of [
    "/absolute",
    "../outside",
    "work/../../outside",
    "work//projects",
    "./work",
    "~/work",
    "work\\\\projects",
    "one/two/three/four/five",
  ]) {
    assert.equal(parseSessionizerConfig(JSON.stringify({ roots: [], homeRoots: [root] })).kind, "invalid", root);
    assert.equal(
      parseSessionizerConfig(JSON.stringify({ roots: [], connectedHomeRoots: [root] })).kind,
      "invalid",
      root,
    );
  }
  assert.equal(parseSessionizerConfig(JSON.stringify({ roots: [], homeRoots: ["x".repeat(2_049)] })).kind, "invalid");
  assert.equal(
    parseSessionizerConfig(
      JSON.stringify({
        roots: Array.from({ length: 11 }, (_, index) => `/root-${index}`),
        homeRoots: ["local"],
        connectedHomeRoots: ["remote"],
      }),
    ).kind,
    "invalid",
  );
  assert.deepEqual(parseSessionizerConfig('{"roots":[],"remoteRoots":{"build":["/work"]}}'), {
    kind: "ready",
    roots: [],
    remoteRoots: { build: ["/work"] },
    homeRoots: [],
    connectedHomeRoots: [],
  });
  assert.equal(parseSessionizerConfig('{"roots":[],"remoteRoots":{"local":["/work"]}}').kind, "ready");
  assert.equal(parseSessionizerConfig('{"roots":[],"remoteRoots":{"build":["relative"]}}').kind, "invalid");
  assert.equal(parseSessionizerConfig('{"roots":[],"remoteRoots":null}').kind, "invalid");
  assert.equal(parseSessionizerConfig("not-json").kind, "invalid");
  assert.equal(parseSessionizerConfig('{"roots":["relative/path"]}').kind, "invalid");
  assert.equal(parseSessionizerConfig('{"roots":[],"home":"/tmp"}').kind, "invalid");
  assert.equal(parseSessionizerConfig(`${" ".repeat(16_385)}{}`).kind, "invalid");
});

test("discovery output is validated and duplicate canonical paths get one stable row key", () => {
  const result = parseProjectDiscovery(
    JSON.stringify({
      projects: [
        { name: "one", path: "/work/one" },
        { name: "alias", path: "/work/one" },
        { name: "two", path: "/work/two" },
      ],
      warnings: [],
      truncated: false,
    }),
  );

  assert.deepEqual(result.projects, [
    { key: '[null,"/work/one"]', name: "one", path: "/work/one", machine: null, machineId: null, stale: false },
    { key: '[null,"/work/two"]', name: "two", path: "/work/two", machine: null, machineId: null, stale: false },
  ]);
  assert.throws(
    () => parseProjectDiscovery('{"projects":[{"name":"bad","path":"relative"}],"warnings":[],"truncated":false}'),
    /invalid data/,
  );
  assert.throws(() => parseProjectDiscovery("not-json"), /invalid data/);
  assert.throws(() => parseProjectDiscovery("x".repeat(512 * 1024 + 1)), /too much data/);
});

test("fuzzy filtering ranks direct matches, supports subsequences, and is deterministic", () => {
  assert.deepEqual(
    filterProjects(projects, "app").map(({ key }) => key),
    ["project-1", "project-0"],
  );
  assert.deepEqual(
    filterProjects(projects, "wsa").map(({ key }) => key),
    ["project-0"],
  );
  assert.deepEqual(
    filterProjects(projects, "server api").map(({ key }) => key),
    ["project-2"],
  );
  assert.deepEqual(filterProjects(projects, "not-found"), []);
  assert.deepEqual(filterProjects(projects, ""), projects);
  assert.deepEqual(filterProjects(projects, "app"), filterProjects(projects, "app"));
});

test("space snapshots ignore remote collisions but detect changed local folders", () => {
  const before = [
    { id: "remote", folder: "/work/app", machine: "build", active: true },
    { id: "local", folder: "/work/other", machine: null, active: false },
  ];
  const remoteChanged = [{ id: "remote-2", folder: "/work/app", machine: "build", active: true }, before[1]];
  const localChanged = [before[0], { ...before[1], folder: "/work/app" }];

  assert.equal(sameLocalSpaceSnapshot(before, remoteChanged), true);
  assert.equal(sameLocalSpaceSnapshot(before, localChanged), false);
  assert.equal(sameMachineSpaceSnapshot(before, remoteChanged, "build"), false);
  assert.equal(sameMachineSpaceSnapshot(before, remoteChanged, null), true);
});

test("space-match output and displayed text stay bounded and safe", () => {
  assert.deepEqual(parseSpaceMatch('{"spaceId":null}'), { kind: "match", spaceId: null });
  assert.deepEqual(parseSpaceMatch('{"spaceId":"local-1"}'), { kind: "match", spaceId: "local-1" });
  assert.deepEqual(parseSpaceMatch('{"spaceId":null,"error":"folder_missing"}'), { kind: "folder-missing" });
  assert.throws(() => parseSpaceMatch('{"spaceId":"unknown","error":"unexpected"}'), /invalid data/);
  assert.equal(safeDisplayText("one\n\u0000two"), "one two");
});
