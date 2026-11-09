import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  cp,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertNoSourceCollisions,
  combinePackKeymaps,
  createDeterministicArchive,
  createPackPackage,
  createPackage,
  createPackages,
  createPickerPackage,
  createHistoryPackage,
  createRotationPackage,
  createSizingPackage,
  createSessionizerPackage,
  createTmuxKeysPackage,
  verifyPackage,
} from "./package.mjs";
import { assertReleaseTag } from "./release-tag.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const expectedFiles = [
  "INSTALLATION.md",
  "install.py",
  "check-install-targets.sh",
  "docs/INSTALLATION.md",
  "layouts/muxcle.json",
  "mods/muxcle-compat/main.js",
  "mods/muxcle-compat/mod.json",
  "RECIPE.md",
  "manifest.json",
].sort();
const expectedTmuxKeysFiles = ["INSTALLATION.md", "install.py", "keys.json", "RECIPE.md", "manifest.json"].sort();
const expectedSessionizerFiles = [
  "check-install-targets.sh",
  "install.py",
  "config.example.json",
  "INSTALLATION.md",
  "keys.json",
  "mods/muxcle-sessionizer/discover.py",
  "mods/muxcle-sessionizer/main.js",
  "mods/muxcle-sessionizer/mod.json",
  "mods/muxcle-sessionizer/package-owner.json",
  "mods/muxcle-sessionizer/sessionizer/adapter.js",
  "mods/muxcle-sessionizer/sessionizer/controller.js",
  "mods/muxcle-sessionizer/sessionizer/model.js",
  "RECIPE.md",
  "manifest.json",
].sort();
const expectedPackFiles = [
  "INSTALLATION.md",
  "RECIPE.md",
  "install.py",
  "config.example.json",
  "keys.json",
  "layouts/muxcle-pack.json",
  "components/herdr-muxcle/INSTALLATION.md",
  "components/herdr-muxcle/RECIPE.md",
  "components/herdr-muxcle/check-install-targets.sh",
  "components/muxcle-tmux-keys/INSTALLATION.md",
  "components/muxcle-tmux-keys/RECIPE.md",
  "components/muxcle-tmux-keys/keys.json",
  "components/muxcle-sessionizer/INSTALLATION.md",
  "components/muxcle-sessionizer/RECIPE.md",
  "components/muxcle-sessionizer/check-install-targets.sh",
  "components/muxcle-sessionizer/config.example.json",
  "components/muxcle-sessionizer/keys.json",
  "components/muxcle-picker/INSTALLATION.md",
  "components/muxcle-picker/RECIPE.md",
  "components/muxcle-picker/check-install-targets.sh",
  "components/muxcle-picker/keys.json",
  "components/muxcle-history/INSTALLATION.md",
  "components/muxcle-history/RECIPE.md",
  "components/muxcle-history/check-install-targets.sh",
  "components/muxcle-history/keys.json",
  "components/muxcle-history/observer.json",
  "components/muxcle-rotation/INSTALLATION.md",
  "components/muxcle-rotation/RECIPE.md",
  "components/muxcle-rotation/check-install-targets.sh",
  "components/muxcle-rotation/keys.json",
  "components/muxcle-rotation/host.json",
  "components/muxcle-sizing/INSTALLATION.md",
  "components/muxcle-sizing/RECIPE.md",
  "components/muxcle-sizing/check-install-targets.sh",
  "components/muxcle-sizing/keys.json",
  "components/muxcle-sizing/host.json",
  "scaffold/INSTALLATION.md",
  "scaffold/check-install-targets.sh",
  "scaffold/docs/INSTALLATION.md",
  "scaffold/layouts/muxcle.json",
  "scaffold/mods/muxcle-compat/main.js",
  "scaffold/mods/muxcle-compat/mod.json",
  "scaffold/RECIPE.md",
  "mods/muxcle-sessionizer/discover.py",
  "mods/muxcle-sessionizer/main.js",
  "mods/muxcle-sessionizer/mod.json",
  "mods/muxcle-sessionizer/package-owner.json",
  "mods/muxcle-sessionizer/sessionizer/adapter.js",
  "mods/muxcle-sessionizer/sessionizer/controller.js",
  "mods/muxcle-sessionizer/sessionizer/model.js",
  "mods/muxcle-picker/main.js",
  "mods/muxcle-picker/model.js",
  "mods/muxcle-picker/mod.json",
  "mods/muxcle-picker/package-owner.json",
  "mods/muxcle-history/main.js",
  "mods/muxcle-history/model.js",
  "mods/muxcle-history/mod.json",
  "mods/muxcle-history/package-owner.json",
  "mods/muxcle-rotation/main.js",
  "mods/muxcle-rotation/model.js",
  "mods/muxcle-rotation/controller.js",
  "mods/muxcle-rotation/adapter.js",
  "mods/muxcle-rotation/rotate.py",
  "mods/muxcle-rotation/mod.json",
  "mods/muxcle-rotation/package-owner.json",
  "mods/muxcle-sizing/main.js",
  "mods/muxcle-sizing/model.js",
  "mods/muxcle-sizing/controller.js",
  "mods/muxcle-sizing/adapter.js",
  "mods/muxcle-sizing/equalize.py",
  "mods/muxcle-sizing/mod.json",
  "mods/muxcle-sizing/package-owner.json",
  "manifest.json",
].sort();

test("picker archive is independent, reproducible, and refuses unowned installation targets", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "muxcle-picker-package-"));
  try {
    const info = await createPickerPackage({ repositoryRoot, outputDirectory: temporary });
    const verified = verifyPackage({ outputDirectory: temporary, version: info.version, packageName: "muxcle-picker" });
    assert.deepEqual(
      verified.files,
      [
        "INSTALLATION.md",
        "RECIPE.md",
        "check-install-targets.sh",
        "keys.json",
        "install.py",
        "manifest.json",
        "mods/muxcle-picker/main.js",
        "mods/muxcle-picker/model.js",
        "mods/muxcle-picker/mod.json",
        "mods/muxcle-picker/package-owner.json",
      ].sort(),
    );

    const original = await readFile(info.archivePath);
    await changeTimes(info.bundleDirectory, 1);
    const repeatedArchive = join(temporary, "repeat.tar.gz");
    await createDeterministicArchive({
      packageDirectory: info.bundleDirectory,
      archivePath: repeatedArchive,
      packageName: "muxcle-picker",
    });
    assert.deepEqual(await readFile(repeatedArchive), original);

    const appHome = join(temporary, "home");
    const target = join(appHome, "mods/muxcle-picker");
    const checker = join(info.bundleDirectory, "check-install-targets.sh");
    const check = (mode = []) => spawnSync("sh", [checker, ...mode, appHome]).status;
    assert.equal(check(), 0);
    await mkdir(target, { recursive: true });
    assert.notEqual(check(), 0);
    assert.notEqual(check(["--update"]), 0);
    await writeFile(join(target, "package-owner.json"), '{"package":"muxcle-picker","schema":1}\n');
    assert.equal(check(["--update"]), 0);
    assert.equal(check(["--remove"]), 0);
    await rm(target, { recursive: true });
    await symlink(join(temporary, "missing"), target);
    assert.notEqual(check(), 0);
    assert.notEqual(check(["--update"]), 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("history archive is independent, reproducible, and scopes installation to its observer mod", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "muxcle-history-package-"));
  try {
    const info = await createHistoryPackage({ repositoryRoot, outputDirectory: temporary });
    const verified = verifyPackage({
      outputDirectory: temporary,
      version: info.version,
      packageName: "muxcle-history",
    });
    assert.deepEqual(
      verified.files,
      [
        "INSTALLATION.md",
        "RECIPE.md",
        "check-install-targets.sh",
        "keys.json",
        "install.py",
        "manifest.json",
        "observer.json",
        "mods/muxcle-history/main.js",
        "mods/muxcle-history/model.js",
        "mods/muxcle-history/mod.json",
        "mods/muxcle-history/package-owner.json",
      ].sort(),
    );
    const original = await readFile(info.archivePath);
    await changeTimes(info.bundleDirectory, 1);
    const repeated = join(temporary, "repeat.tar.gz");
    await createDeterministicArchive({
      packageDirectory: info.bundleDirectory,
      archivePath: repeated,
      packageName: "muxcle-history",
    });
    assert.deepEqual(await readFile(repeated), original);

    const appHome = join(temporary, "home");
    const target = join(appHome, "mods/muxcle-history");
    const checker = join(info.bundleDirectory, "check-install-targets.sh");
    const check = (mode = []) => spawnSync("sh", [checker, ...mode, appHome]).status;
    assert.equal(check(), 0);
    await mkdir(target, { recursive: true });
    await writeFile(join(appHome, "shared.json"), '{"unrelated":"keep"}\n');
    assert.notEqual(check(), 0);
    assert.notEqual(check(["--remove"]), 0);
    await writeFile(join(target, "package-owner.json"), '{"package":"muxcle-history","schema":1}\n');
    assert.equal(check(["--update"]), 0);
    assert.equal(check(["--remove"]), 0);
    assert.equal(await readFile(join(appHome, "shared.json"), "utf8"), '{"unrelated":"keep"}\n');
    await rm(target, { recursive: true });
    await symlink(join(temporary, "missing"), target);
    assert.notEqual(check(), 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("sizing archive is independent, reproducible, and protects existing installation state", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "muxcle-sizing-package-"));
  try {
    const info = await createSizingPackage({ repositoryRoot, outputDirectory: temporary });
    const verified = verifyPackage({ outputDirectory: temporary, version: info.version, packageName: "muxcle-sizing" });
    assert.deepEqual(
      verified.files,
      [
        "INSTALLATION.md",
        "RECIPE.md",
        "check-install-targets.sh",
        "keys.json",
        "host.json",
        "install.py",
        "manifest.json",
        "mods/muxcle-sizing/main.js",
        "mods/muxcle-sizing/model.js",
        "mods/muxcle-sizing/controller.js",
        "mods/muxcle-sizing/adapter.js",
        "mods/muxcle-sizing/equalize.py",
        "mods/muxcle-sizing/mod.json",
        "mods/muxcle-sizing/package-owner.json",
      ].sort(),
    );
    const original = await readFile(info.archivePath);
    await changeTimes(info.bundleDirectory, 1);
    const repeated = join(temporary, "repeat.tar.gz");
    await createDeterministicArchive({
      packageDirectory: info.bundleDirectory,
      archivePath: repeated,
      packageName: "muxcle-sizing",
    });
    assert.deepEqual(await readFile(repeated), original);

    const appHome = join(temporary, "home");
    const target = join(appHome, "mods/muxcle-sizing");
    const checker = join(info.bundleDirectory, "check-install-targets.sh");
    const check = (mode = []) => spawnSync("sh", [checker, ...mode, appHome]).status;
    assert.equal(check(), 0);
    await mkdir(target, { recursive: true });
    await writeFile(join(appHome, "settings.json"), '{"unrelated":true}\n');
    assert.notEqual(check(), 0);
    assert.notEqual(check(["--update"]), 0);
    await writeFile(
      join(target, "package-owner.json"),
      await readFile(join(info.bundleDirectory, "mods/muxcle-sizing/package-owner.json")),
    );
    assert.equal(check(["--update"]), 0);
    assert.equal(check(["--remove"]), 0);
    assert.equal(await readFile(join(appHome, "settings.json"), "utf8"), '{"unrelated":true}\n');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("packaged sizing helper scopes equalize and reciprocal resize writes through a fake core", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "muxcle-sizing-protocol-"));
  try {
    const info = await createSizingPackage({ repositoryRoot, outputDirectory: temporary });
    const stateFile = join(temporary, "state.json");
    const requestsFile = join(temporary, "requests.jsonl");
    const value = {
      spaces: [
        {
          id: "s",
          tabs: [
            {
              id: "t",
              root: {
                id: "root",
                type: "row",
                size: { weight: 5 },
                children: [
                  { id: "a", type: "block", size: { weight: 1 }, content: { terminal: "ta" } },
                  { id: "b", type: "block", size: { weight: 3 }, content: { terminal: "tb" } },
                ],
              },
            },
            { id: "other", metadata: "keep" },
          ],
        },
      ],
      unrelated: { keep: [1, 2] },
    };
    await writeFile(stateFile, JSON.stringify({ value, version: 8 }));
    const fakeCore = join(temporary, "hc");
    await writeFile(
      fakeCore,
      `#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
state_file = Path(os.environ["MOCK_DOCUMENT"])
for line in sys.stdin:
    request = json.loads(line)
    with open(os.environ["MOCK_REQUESTS"], "a") as log:
        log.write(json.dumps(request) + "\\n")
    state = json.loads(state_file.read_text())
    if request["method"] == "hello":
        result = {}
    else:
        assert request["params"]["name"] == "herdr-app"
        assert request["params"]["on"] == "remote"
        if request["method"] == "doc.get":
            result = state
        else:
            assert request["method"] == "doc.set"
            assert request["params"]["version"] == state["version"]
            state = {"value": request["params"]["value"], "version": state["version"] + 1}
            state_file.write_text(json.dumps(state))
            result = {"version": state["version"]}
    print(json.dumps({"id": request["id"], "result": result}))
`,
    );
    await chmod(fakeCore, 0o700);
    const context = {
      space: "remote/s",
      tab: "remote/t",
      pane: "remote/a",
      panes: ["remote/a", "remote/b"],
      terminals: ["remote/ta", "remote/tb"],
      machine: "remote",
    };
    const execute = (operation) =>
      spawnSync(
        "python3",
        [
          "-I",
          "-B",
          join(info.bundleDirectory, "mods/muxcle-sizing/equalize.py"),
          JSON.stringify(context),
          ...(operation === undefined ? [] : [operation]),
        ],
        {
          encoding: "utf8",
          timeout: 15000,
          env: {
            ...process.env,
            PATH: `${temporary}:${process.env.PATH}`,
            MOCK_DOCUMENT: stateFile,
            MOCK_REQUESTS: requestsFile,
          },
        },
      );

    const changed = execute();
    assert.equal(changed.status, 0, changed.stderr);
    assert.deepEqual(JSON.parse(changed.stdout), { changed: true, splits: 1 });
    const unchanged = execute();
    assert.equal(unchanged.status, 0, unchanged.stderr);
    assert.deepEqual(JSON.parse(unchanged.stdout), { changed: false, splits: 0 });

    const stored = JSON.parse(await readFile(stateFile, "utf8"));
    const expected = structuredClone(value);
    expected.spaces[0].tabs[0].root.children[1].size.weight = 1;
    assert.deepEqual(stored, { value: expected, version: 9 });

    const verifyResize = async (operation, expectedWeight) => {
      const before = JSON.parse(await readFile(stateFile, "utf8"));
      const result = execute(operation);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { changed: true, splits: 1 });
      const after = JSON.parse(await readFile(stateFile, "utf8"));
      const weight = after.value.spaces[0].tabs[0].root.children[0].size.weight;
      assert.ok(Math.abs(weight - expectedWeight) < 1e-6, `${operation}: unexpected weight ${weight}`);
      before.value.spaces[0].tabs[0].root.children[0].size.weight = weight;
      before.version += 1;
      assert.deepEqual(after, before);
    };
    await verifyResize("grow-width", 1.1);
    await verifyResize("shrink-width", 1);

    const vertical = JSON.parse(await readFile(stateFile, "utf8"));
    vertical.value.spaces[0].tabs[0].root.type = "column";
    vertical.version += 1;
    await writeFile(stateFile, JSON.stringify(vertical));
    await verifyResize("grow-height", 1.1);
    await verifyResize("shrink-height", 1);
    const missingAxis = execute("grow-width");
    assert.equal(missingAxis.status, 0, missingAxis.stderr);
    assert.deepEqual(JSON.parse(missingAxis.stdout), { changed: false, splits: 0 });

    const previousRequests = await readFile(requestsFile, "utf8");
    const invalid = execute("run-arbitrary-code");
    assert.notEqual(invalid.status, 0);
    assert.equal(await readFile(requestsFile, "utf8"), previousRequests);
    const requests = (await readFile(requestsFile, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(requests.filter((request) => request.method === "doc.set").length, 5);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("packaged ownership markers are accepted by each capability's update and remove guards", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "muxcle-owner-roundtrip-"));
  const capabilities = [
    [createSessionizerPackage, "muxcle-sessionizer"],
    [createPickerPackage, "muxcle-picker"],
    [createHistoryPackage, "muxcle-history"],
    [createRotationPackage, "muxcle-rotation"],
    [createSizingPackage, "muxcle-sizing"],
  ];
  try {
    for (const [create, name] of capabilities) {
      const info = await create({ repositoryRoot, outputDirectory: join(temporary, "dist") });
      const home = join(temporary, name);
      const target = join(home, "mods", name);
      await mkdir(target, { recursive: true });
      await writeFile(
        join(target, "package-owner.json"),
        await readFile(join(info.bundleDirectory, "mods", name, "package-owner.json")),
      );
      for (const mode of ["--update", "--remove"]) {
        const result = spawnSync("sh", [join(info.bundleDirectory, "check-install-targets.sh"), mode, home], {
          encoding: "utf8",
        });
        assert.equal(result.status, 0, `${name} ${mode}: ${result.stderr}`);
      }
      assert.deepEqual(await readdir(target), ["package-owner.json"]);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("sizing preflight refuses unowned folders and linked boundaries without changing them", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "muxcle-sizing-preflight-"));
  try {
    const home = join(temporary, "home");
    const target = join(home, "mods/muxcle-sizing");
    const checker = join(repositoryRoot, "packages/sizing/check-install-targets.sh");
    const check = (mode = []) => spawnSync("sh", [checker, ...mode, home]).status;
    assert.equal(check(), 0);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "keep.txt"), "unrelated");
    assert.notEqual(check(), 0);
    assert.notEqual(check(["--update"]), 0);
    await writeFile(join(target, "package-owner.json"), '{"package":"foreign","schema":1}\n');
    assert.notEqual(check(["--update"]), 0);
    await writeFile(join(target, "package-owner.json"), '{"package":"muxcle-sizing","schema":1}\n');
    assert.equal(check(["--update"]), 0);
    assert.equal(check(["--remove"]), 0);
    assert.equal(await readFile(join(target, "keep.txt"), "utf8"), "unrelated");

    const linked = join(temporary, "linked");
    await mkdir(linked);
    await writeFile(join(linked, "keep.txt"), "preserved");
    await rm(target, { recursive: true });
    await symlink(linked, target);
    for (const mode of [[], ["--update"], ["--remove"]]) assert.notEqual(check(mode), 0);
    assert.equal(await readFile(join(linked, "keep.txt"), "utf8"), "preserved");
    await rm(target);
    await rm(join(home, "mods"), { recursive: true });
    await symlink(linked, join(home, "mods"));
    assert.notEqual(check(), 0);
    await rm(join(home, "mods"));
    await rm(home, { recursive: true });
    await symlink(linked, home);
    assert.notEqual(check(), 0);
    assert.equal(await readFile(join(linked, "keep.txt"), "utf8"), "preserved");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("rotation archive is independent, reproducible, and protects existing mod paths", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "muxcle-rotation-package-"));
  try {
    const info = await createRotationPackage({ repositoryRoot, outputDirectory: temporary });
    const verified = verifyPackage({
      outputDirectory: temporary,
      version: info.version,
      packageName: "muxcle-rotation",
    });
    assert.deepEqual(
      verified.files,
      [
        "INSTALLATION.md",
        "RECIPE.md",
        "check-install-targets.sh",
        "keys.json",
        "install.py",
        "manifest.json",
        "host.json",
        "mods/muxcle-rotation/main.js",
        "mods/muxcle-rotation/model.js",
        "mods/muxcle-rotation/controller.js",
        "mods/muxcle-rotation/adapter.js",
        "mods/muxcle-rotation/rotate.py",
        "mods/muxcle-rotation/mod.json",
        "mods/muxcle-rotation/package-owner.json",
      ].sort(),
    );
    const original = await readFile(info.archivePath);
    await changeTimes(info.bundleDirectory, 1);
    const repeated = join(temporary, "repeat.tar.gz");
    await createDeterministicArchive({
      packageDirectory: info.bundleDirectory,
      archivePath: repeated,
      packageName: "muxcle-rotation",
    });
    assert.deepEqual(await readFile(repeated), original);

    const appHome = join(temporary, "home");
    const target = join(appHome, "mods/muxcle-rotation");
    const checker = join(info.bundleDirectory, "check-install-targets.sh");
    const check = (mode = []) => spawnSync("sh", [checker, ...mode, appHome]).status;
    assert.equal(check(), 0);
    await mkdir(target, { recursive: true });
    assert.notEqual(check(), 0);
    assert.notEqual(check(["--update"]), 0);
    await writeFile(join(target, "package-owner.json"), '{"package":"muxcle-rotation","schema":1}\n');
    assert.equal(check(["--update"]), 0);
    assert.equal(check(["--remove"]), 0);
    await rm(target, { recursive: true });
    await symlink(join(temporary, "missing"), target);
    assert.notEqual(check(), 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("whole-pack key composition rejects duplicate chords, including identical actions", () => {
  const keymap = combinePackKeymaps([
    { packageName: "muxcle-tmux-keys", keymap: { global: { "ctrl-a c": "tab.new" } } },
    { packageName: "muxcle-picker", keymap: { global: { "ctrl-a b": "mod.open:muxcle-picker" } } },
  ]);

  assert.deepEqual(keymap, {
    global: {
      "ctrl-a c": "tab.new",
      "ctrl-a b": "mod.open:muxcle-picker",
    },
  });
  assert.throws(
    () =>
      combinePackKeymaps([
        { packageName: "muxcle-tmux-keys", keymap: { global: { "ctrl-a c": "tab.new" } } },
        { packageName: "muxcle-picker", keymap: { global: { "ctrl-a c": "tab.new" } } },
      ]),
    /shortcut collision.*muxcle-tmux-keys.*muxcle-picker/,
  );
});

test("whole-pack source inventory rejects duplicate archive targets", () => {
  assert.throws(
    () =>
      assertNoSourceCollisions([
        ["first.json", "keys.json"],
        ["second.json", "keys.json"],
      ]),
    /archive target collision.*keys.json/,
  );
});

test("whole-pack archive composes all components without activating scaffold status", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-pack-test-"));
  try {
    const info = await createPackPackage({ repositoryRoot, outputDirectory: temporary });
    const verified = verifyPackage({ outputDirectory: temporary, version: info.version, packageName: "muxcle-pack" });
    const firstArchive = await readFile(info.archivePath);
    await changeTimes(info.bundleDirectory, 1);
    const repeatedArchive = join(temporary, "muxcle-pack-repeat.tar.gz");
    await createDeterministicArchive({
      packageDirectory: info.bundleDirectory,
      archivePath: repeatedArchive,
      packageName: "muxcle-pack",
    });
    assert.deepEqual(await readFile(repeatedArchive), firstArchive);
    const layout = JSON.parse(await readFile(join(info.bundleDirectory, "layouts/muxcle-pack.json"), "utf8"));
    const nodes = collectLayoutNodes(layout);
    const keymap = JSON.parse(await readFile(join(info.bundleDirectory, "keys.json"), "utf8"));
    const keySources = [
      "packages/tmux-keys/keys.json",
      "packages/sessionizer/keys.json",
      "packages/picker/keys.json",
      "packages/history/keys.json",
      "packages/rotation/keys.json",
      "packages/sizing/keys.json",
    ];
    const expectedKeymap = {};

    for (const source of keySources) {
      const snippet = JSON.parse(await readFile(join(repositoryRoot, source), "utf8"));
      for (const [section, bindings] of Object.entries(snippet)) {
        expectedKeymap[section] ??= {};
        Object.assign(expectedKeymap[section], bindings);
      }
    }

    assert.equal(info.name, "muxcle-pack");
    assert.deepEqual(verified.files, expectedPackFiles);
    assert.equal(
      await readFile(join(info.bundleDirectory, "INSTALLATION.md"), "utf8"),
      await readFile(join(repositoryRoot, "packages/pack/INSTALLATION.md"), "utf8"),
    );
    assert.equal(
      await readFile(join(info.bundleDirectory, "RECIPE.md"), "utf8"),
      await readFile(join(repositoryRoot, "packages/pack/RECIPE.md"), "utf8"),
    );
    assert.deepEqual(keymap, expectedKeymap);
    assert.deepEqual(
      await readFile(join(info.bundleDirectory, "config.example.json")),
      await readFile(join(repositoryRoot, "packages/sessionizer/config.example.json")),
    );
    assert.ok(verified.files.includes("mods/muxcle-sessionizer/main.js"));
    assert.equal(nodes.filter((node) => node.content?.mod === "muxcle-compat").length, 0);

    for (const [modName, sourcePath] of [
      ["muxcle-history", "packages/history/observer.json"],
      ["muxcle-rotation", "packages/rotation/host.json"],
      ["muxcle-sizing", "packages/sizing/host.json"],
    ]) {
      const placed = nodes.filter((node) => node.content?.mod === modName);
      const source = JSON.parse(await readFile(join(repositoryRoot, sourcePath), "utf8"));
      assert.equal(placed.length, 1);
      assert.deepEqual(placed[0], source);
    }

    for (const modName of [
      "muxcle-sessionizer",
      "muxcle-picker",
      "muxcle-history",
      "muxcle-rotation",
      "muxcle-sizing",
    ]) {
      const owner = JSON.parse(
        await readFile(join(info.bundleDirectory, "mods", modName, "package-owner.json"), "utf8"),
      );
      assert.deepEqual(owner, { package: modName, schema: 1 });
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("whole pack rejects an ownership marker that claims the aggregate package", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-pack-owner-test-"));
  const sourceRoot = join(temporary, "source");
  try {
    await mkdir(sourceRoot);
    await copyFile(join(repositoryRoot, "package.json"), join(sourceRoot, "package.json"));
    await symlink(join(repositoryRoot, "RECIPE.md"), join(sourceRoot, "RECIPE.md"));
    for (const directory of [".build", "docs", "layouts", "packages", "scripts"]) {
      await symlink(join(repositoryRoot, directory), join(sourceRoot, directory), "dir");
    }
    const modsDirectory = join(sourceRoot, "mods");
    await mkdir(modsDirectory);
    for (const modName of [
      "muxcle-compat",
      "muxcle-sessionizer",
      "muxcle-picker",
      "muxcle-history",
      "muxcle-rotation",
      "muxcle-sizing",
    ]) {
      const target = join(modsDirectory, modName);
      if (modName === "muxcle-picker") {
        await cp(join(repositoryRoot, "mods", modName), target, { recursive: true });
      } else {
        await symlink(join(repositoryRoot, "mods", modName), target, "dir");
      }
    }
    await writeFile(join(modsDirectory, "muxcle-picker/package-owner.json"), '{"package":"muxcle-pack","schema":1}\n');

    await assert.rejects(
      createPackPackage({ repositoryRoot: sourceRoot, outputDirectory: join(temporary, "dist") }),
      /Unexpected package ownership marker/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("package generation leaves existing app settings untouched", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-package-test-"));
  const outputDirectory = join(temporary, "dist");
  const appHome = join(temporary, "home");
  const existingSettings = join(appHome, "settings.json");
  const existingValue = '{"theme":"leave untouched"}\n';
  const previousHome = process.env.HERDR_APP_HOME;

  try {
    await mkdir(appHome);
    await writeFile(existingSettings, existingValue);
    process.env.HERDR_APP_HOME = appHome;

    const layout = JSON.parse(await readFile(join(repositoryRoot, "layouts/muxcle.json"), "utf8"));
    assert.equal(layout.type, "row");
    assert.deepEqual(collectMods(layout).sort(), ["muxcle-compat", "pane", "spaces", "tabs"]);

    const packageInfo = await createPackage({ repositoryRoot, outputDirectory });
    const verified = verifyPackage({ outputDirectory, version: packageInfo.version });

    assert.deepEqual(verified.files, expectedFiles);
    assert.equal(
      await readFile(join(packageInfo.bundleDirectory, "INSTALLATION.md"), "utf8"),
      await readFile(join(packageInfo.bundleDirectory, "docs/INSTALLATION.md"), "utf8"),
    );
    assert.equal(await readFile(existingSettings, "utf8"), existingValue);
  } finally {
    if (previousHome === undefined) delete process.env.HERDR_APP_HOME;
    else process.env.HERDR_APP_HOME = previousHome;
    await rm(temporary, { recursive: true, force: true });
  }
});

test("builds all package archives and runs the shared installer for each", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-packages-test-"));
  try {
    const packages = await createPackages({ repositoryRoot, outputDirectory: temporary });
    const [scaffold, tmuxKeys, sessionizer] = packages;
    const scaffoldCheck = verifyPackage({ outputDirectory: temporary, version: scaffold.version });
    const keysCheck = verifyPackage({
      outputDirectory: temporary,
      version: tmuxKeys.version,
      packageName: "muxcle-tmux-keys",
    });
    const sessionizerCheck = verifyPackage({
      outputDirectory: temporary,
      version: sessionizer.version,
      packageName: "muxcle-sessionizer",
    });
    const keysManifest = JSON.parse(await readFile(join(tmuxKeys.bundleDirectory, "manifest.json"), "utf8"));
    const keysSnippet = JSON.parse(await readFile(join(tmuxKeys.bundleDirectory, "keys.json"), "utf8"));
    const sessionizerManifest = JSON.parse(await readFile(join(sessionizer.bundleDirectory, "manifest.json"), "utf8"));
    const sessionizerKeys = JSON.parse(await readFile(join(sessionizer.bundleDirectory, "keys.json"), "utf8"));
    const installerSource = await readFile(join(repositoryRoot, "scripts/install.py"));

    assert.deepEqual(
      packages.map(({ name }) => name),
      [
        "herdr-muxcle",
        "muxcle-tmux-keys",
        "muxcle-sessionizer",
        "muxcle-picker",
        "muxcle-history",
        "muxcle-rotation",
        "muxcle-sizing",
        "muxcle-pack",
      ],
    );
    assert.equal(scaffold.name, "herdr-muxcle");
    assert.equal(tmuxKeys.name, "muxcle-tmux-keys");
    assert.equal(sessionizer.name, "muxcle-sessionizer");
    for (const packageInfo of packages) {
      assert.deepEqual(await readFile(join(packageInfo.bundleDirectory, "install.py")), installerSource);
    }
    assert.deepEqual(scaffoldCheck.files, expectedFiles);
    assert.deepEqual(keysCheck.files, expectedTmuxKeysFiles);
    assert.deepEqual(sessionizerCheck.files, expectedSessionizerFiles);
    assert.equal(keysManifest.name, "muxcle-tmux-keys");
    assert.equal(keysSnippet.global["ctrl-a c"], "tab.new");
    assert.equal(keysSnippet.terminal["ctrl-a ctrl-a"], `send:${String.fromCharCode(1)}`);
    assert.equal(sessionizerManifest.name, "muxcle-sessionizer");
    assert.equal(sessionizerKeys.global["ctrl-a ctrl-p"], "mod.open:muxcle-sessionizer");
    assert.ok(!keysCheck.files.some((path) => path.startsWith("layouts/") || path.startsWith("mods/")));
    assert.ok(!sessionizerCheck.files.some((path) => path.startsWith("layouts/") || path.includes("main.ts")));

    for (const packageInfo of packages) {
      const installTarget = join(temporary, `installer-${packageInfo.name}`);
      const result = spawnSync(
        "python3",
        [join(packageInfo.bundleDirectory, "install.py"), "--target", installTarget, "--apply"],
        {
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!(await readdir(installTarget)).includes("install.py"));
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Sessionizer preflight scopes fresh, update, and removal checks to its marked mod path", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-sessionizer-install-test-"));
  const outputDirectory = join(temporary, "dist");
  const appHome = join(temporary, "home");

  try {
    await mkdir(join(appHome, "mods"), { recursive: true });
    const packageInfo = await createSessionizerPackage({ repositoryRoot, outputDirectory });
    const checker = join(packageInfo.bundleDirectory, "check-install-targets.sh");
    const runCheck = (mode = "fresh") =>
      spawnSync("sh", [checker, ...(mode === "fresh" ? [] : [`--${mode}`]), appHome]);
    const target = join(appHome, "mods/muxcle-sessionizer");

    assert.equal(runCheck().status, 0);
    await mkdir(target);
    await writeFile(join(target, "mod.json"), "{}\n");
    assert.notEqual(runCheck().status, 0);
    assert.notEqual(runCheck("update").status, 0);
    assert.notEqual(runCheck("remove").status, 0);

    await rm(target, { recursive: true });
    await mkdir(target);
    await writeFile(join(target, "package-owner.json"), '{"package":"muxcle-sessionizer","schema":1}\n');
    assert.equal(runCheck("update").status, 0);
    assert.equal(runCheck("remove").status, 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("install preflight refuses existing targets, dangling links, and linked containers", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-install-test-"));
  const outputDirectory = join(temporary, "dist");
  const appHome = join(temporary, "home");

  try {
    await mkdir(appHome);
    const packageInfo = await createPackage({ repositoryRoot, outputDirectory });
    const checker = join(packageInfo.bundleDirectory, "check-install-targets.sh");
    const runCheck = (mode = "fresh") =>
      spawnSync("sh", [checker, ...(mode === "update" ? ["--update"] : []), appHome]);

    assert.equal(runCheck().status, 0);

    await mkdir(join(appHome, "layouts"));
    const existingLayout = join(appHome, "layouts/muxcle.json");
    await writeFile(existingLayout, "keep existing layout\n");
    assert.notEqual(runCheck().status, 0);
    assert.equal(await readFile(existingLayout, "utf8"), "keep existing layout\n");
    assert.equal(runCheck("update").status, 0);

    await rm(existingLayout);
    await symlink(join(temporary, "missing-layout"), existingLayout);
    assert.notEqual(runCheck("update").status, 0);
    assert.equal((await lstat(existingLayout)).isSymbolicLink(), true);

    await rm(existingLayout);
    await rm(join(appHome, "layouts"), { recursive: true });
    const linkedLayouts = join(temporary, "linked-layouts");
    await mkdir(linkedLayouts);
    await symlink(linkedLayouts, join(appHome, "layouts"));
    assert.notEqual(runCheck().status, 0);
    assert.deepEqual(await readdir(linkedLayouts), []);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("release tags must match the one package version", async () => {
  const { version } = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  assert.doesNotThrow(() => assertReleaseTag(`v${version}`, version));
  assert.throws(() => assertReleaseTag(`v${version}.1`, version), /must match package version/);
});

test("archive bytes stay identical when staged file and directory times change", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-repro-test-"));
  try {
    const packageInfo = await createPackage({ repositoryRoot, outputDirectory: temporary });
    const firstArchive = await readFile(packageInfo.archivePath);
    await changeTimes(packageInfo.bundleDirectory, 1);
    const secondArchive = join(temporary, "second-build.tar.gz");
    await createDeterministicArchive({ packageDirectory: packageInfo.bundleDirectory, archivePath: secondArchive });

    assert.deepEqual(await readFile(secondArchive), firstArchive);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Sessionizer archives are reproducible after staged timestamps change", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-sessionizer-repro-test-"));
  try {
    const packageInfo = await createSessionizerPackage({ repositoryRoot, outputDirectory: temporary });
    const firstArchive = await readFile(packageInfo.archivePath);
    assert.equal(firstArchive.readUInt32LE(4), 0, "gzip must not store a wall-clock timestamp");
    await changeTimes(packageInfo.bundleDirectory, 1);
    const secondArchive = join(temporary, "second-sessionizer-build.tar.gz");
    await createDeterministicArchive({
      packageDirectory: packageInfo.bundleDirectory,
      archivePath: secondArchive,
      packageName: "muxcle-sessionizer",
    });

    assert.deepEqual(await readFile(secondArchive), firstArchive);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Tmux keys archives are reproducible after staged timestamps change", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-tmux-repro-test-"));
  try {
    const packageInfo = await createTmuxKeysPackage({ repositoryRoot, outputDirectory: temporary });
    const firstArchive = await readFile(packageInfo.archivePath);
    await changeTimes(packageInfo.bundleDirectory, 1);
    const secondArchive = join(temporary, "second-tmux-build.tar.gz");
    await createDeterministicArchive({
      packageDirectory: packageInfo.bundleDirectory,
      archivePath: secondArchive,
      packageName: "muxcle-tmux-keys",
    });

    assert.deepEqual(await readFile(secondArchive), firstArchive);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("verification rejects a modified checksum", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-checksum-test-"));
  try {
    const packageInfo = await createPackage({ repositoryRoot, outputDirectory: temporary });
    await writeFile(packageInfo.checksumPath, "not the archive checksum\n");
    assert.throws(() => verifyPackage({ outputDirectory: temporary, version: packageInfo.version }), /checksum/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("repackaging the same version updates only its generated bundle", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-update-test-"));
  const outputDirectory = join(temporary, "dist");
  const unrelatedFile = join(outputDirectory, "keep-me.txt");

  try {
    await mkdir(outputDirectory);
    await writeFile(unrelatedFile, "unrelated output\n");

    const first = await createPackage({ repositoryRoot, outputDirectory });
    const second = await createPackage({ repositoryRoot, outputDirectory });
    const verified = verifyPackage({ outputDirectory, version: second.version });

    assert.equal(second.version, first.version);
    assert.deepEqual(verified.files, expectedFiles);
    assert.equal(await readFile(unrelatedFile, "utf8"), "unrelated output\n");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

async function changeTimes(directory, seconds) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await changeTimes(path, seconds + 100);
    await utimes(path, new Date(seconds * 1000), new Date(seconds * 1000));
    seconds += 100;
  }
  await utimes(directory, new Date(seconds * 1000), new Date(seconds * 1000));
}

function collectLayoutNodes(root) {
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  visit(root);
  return nodes;
}

function collectMods(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectMods(item, result);
    return result;
  }
  if (value && typeof value === "object") {
    if (typeof value.mod === "string") result.push(value.mod);
    for (const child of Object.values(value)) collectMods(child, result);
  }
  return result;
}
