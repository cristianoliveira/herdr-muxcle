import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPackage, verifyPackage } from "./package.mjs";
import { assertReleaseTag } from "./release-tag.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const expectedFiles = [
  "layouts/muxcle.json",
  "mods/muxcle-compat/main.js",
  "mods/muxcle-compat/mod.json",
  "RECIPE.md",
  "manifest.json",
].sort();

test("packages the native app-home payload and preserves existing settings", async () => {
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

test("release tags must match the one package version", async () => {
  const { version } = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  assert.doesNotThrow(() => assertReleaseTag(`v${version}`, version));
  assert.throws(() => assertReleaseTag(`v${version}.1`, version), /must match package version/);
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
