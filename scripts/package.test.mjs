import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createDeterministicArchive,
  createPackage,
  createPackages,
  createPickerPackage,
  createHistoryPackage,
  createRotationPackage,
  createSessionizerPackage,
  createTmuxKeysPackage,
  verifyPackage,
} from "./package.mjs";
import { assertReleaseTag } from "./release-tag.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const expectedFiles = [
  "check-install-targets.sh",
  "docs/INSTALLATION.md",
  "layouts/muxcle.json",
  "mods/muxcle-compat/main.js",
  "mods/muxcle-compat/mod.json",
  "RECIPE.md",
  "manifest.json",
].sort();
const expectedTmuxKeysFiles = ["INSTALLATION.md", "keys.json", "RECIPE.md", "manifest.json"].sort();
const expectedSessionizerFiles = [
  "check-install-targets.sh",
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
    assert.equal(await readFile(existingSettings, "utf8"), existingValue);
  } finally {
    if (previousHome === undefined) delete process.env.HERDR_APP_HOME;
    else process.env.HERDR_APP_HOME = previousHome;
    await rm(temporary, { recursive: true, force: true });
  }
});

test("builds independent archives for the scaffold, Tmux keys, and Sessionizer packages", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "herdr-muxcle-packages-test-"));
  try {
    const [scaffold, tmuxKeys, sessionizer] = await createPackages({ repositoryRoot, outputDirectory: temporary });
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

    assert.equal(scaffold.name, "herdr-muxcle");
    assert.equal(tmuxKeys.name, "muxcle-tmux-keys");
    assert.equal(sessionizer.name, "muxcle-sessionizer");
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
