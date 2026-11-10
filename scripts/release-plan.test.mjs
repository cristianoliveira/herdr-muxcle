import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RELEASE_CATALOG } from "./package.mjs";
import { createReleasePlan, formatReleaseAssets, formatReleaseNotes } from "./release-plan.mjs";

const releasePlanScript = fileURLToPath(new URL("./release-plan.mjs", import.meta.url));

const repositoryUrl = "https://github.com/cristianoliveira/herdr-muxcle";
const packageNames = [
  "herdr-muxcle",
  "muxcle-tmux-keys",
  "muxcle-sessionizer",
  "muxcle-picker",
  "muxcle-history",
  "muxcle-rotation",
  "muxcle-sizing",
  "muxcle-repeat",
  "muxcle-project-popup",
  "muxcle-tab-tools",
  "muxcle-space-closer",
  "muxcle-pack",
];
const recipePaths = [
  "RECIPE.md",
  "packages/tmux-keys/RECIPE.md",
  "packages/sessionizer/RECIPE.md",
  "packages/picker/RECIPE.md",
  "packages/history/RECIPE.md",
  "packages/rotation/RECIPE.md",
  "packages/sizing/RECIPE.md",
  "packages/repeat/RECIPE.md",
  "packages/project-popup/RECIPE.md",
  "packages/tab-tools/RECIPE.md",
  "packages/space-closer/RECIPE.md",
  "packages/pack/RECIPE.md",
];

test("release plan derives archive names and recipe links from the package catalog", () => {
  const plan = createReleasePlan({ version: "0.1.0", repositoryUrl });

  assert.deepEqual(
    RELEASE_CATALOG.map(({ name }) => name),
    packageNames,
  );
  assert.deepEqual(
    RELEASE_CATALOG.map(({ installationPath }) => installationPath),
    recipePaths,
  );
  assert.ok(recipePaths.every((path) => existsSync(new URL(`../${path}`, import.meta.url))));
  assert.deepEqual(
    plan.packages.map(({ name }) => name),
    packageNames,
  );
  for (const item of plan.packages) {
    assert.equal(item.archiveName, `${item.name}-v0.1.0.tar.gz`);
    assert.equal(item.checksumName, `${item.archiveName}.sha256`);
    assert.equal(item.archiveUrl, `${repositoryUrl}/releases/download/v0.1.0/${item.archiveName}`);
    assert.equal(item.checksumUrl, `${item.archiveUrl}.sha256`);
    assert.ok(item.recipeUrl.startsWith(`${repositoryUrl}/blob/v0.1.0/`));
  }
});

test("release assets contain exactly one archive and checksum per catalog entry", () => {
  const plan = createReleasePlan({ version: "0.1.0", repositoryUrl });
  const assets = formatReleaseAssets(plan);

  assert.equal(assets.length, packageNames.length * 2);
  assert.deepEqual(
    assets,
    packageNames.flatMap((name) => [`dist/${name}-v0.1.0.tar.gz`, `dist/${name}-v0.1.0.tar.gz.sha256`]),
  );
});

test("release notes are deterministic and include every package recipe and artifact", () => {
  const plan = createReleasePlan({ version: "0.1.0", repositoryUrl });
  const first = formatReleaseNotes(plan);
  const second = formatReleaseNotes(createReleasePlan({ version: "0.1.0", repositoryUrl }));

  assert.equal(first, second);
  assert.match(first, /^# Herdr Muxcle v0\.1\.0\n/m);
  assert.ok(first.includes(`[package overview](${repositoryUrl}/blob/v0.1.0/README.md)`));
  assert.match(first, /optional static starter, not an all-in-one bundle/);
  assert.doesNotMatch(first, /all seven packages/i);
  for (const item of plan.packages) {
    assert.ok(first.includes(`[Recipe](${item.recipeUrl})`));
    assert.ok(first.includes(`[Archive](${item.archiveUrl})`));
    assert.ok(first.includes(`[SHA-256](${item.checksumUrl})`));
  }
});

test("CLI emits catalog assets for workflow use", () => {
  const result = spawnSync(
    process.execPath,
    [releasePlanScript, "--version", "0.1.0", "--format", "assets", "--repository-url", repositoryUrl],
    { encoding: "utf8" },
  );
  const plan = createReleasePlan({ version: "0.1.0", repositoryUrl });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), formatReleaseAssets(plan));
});

test("CLI help explains the safe local preview and unknown options fail clearly", () => {
  const help = spawnSync(process.execPath, [releasePlanScript, "--help"], { encoding: "utf8" });
  const invalid = spawnSync(process.execPath, [releasePlanScript, "--unknown"], { encoding: "utf8" });

  assert.equal(help.status, 0);
  assert.match(help.stdout, /make release-plan/);
  assert.match(help.stdout, /local preview/);
  assert.match(help.stdout, /node scripts\/release-plan\.mjs --help/);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /unknown option: --unknown/);
  assert.match(invalid.stderr, /Run node scripts\/release-plan\.mjs --help for usage/);
});

test("release plan rejects unstable versions and non-HTTPS repository URLs", () => {
  assert.throws(() => createReleasePlan({ version: "v0.1.0", repositoryUrl }), /stable X\.Y\.Z/);
  assert.throws(() => createReleasePlan({ version: "0.1.0-rc.1", repositoryUrl }), /stable X\.Y\.Z/);
  assert.throws(() => createReleasePlan({ version: "0.1.0", repositoryUrl: "http://github.com/acme/repo" }), /HTTPS/);
  assert.throws(
    () => createReleasePlan({ version: "0.1.0", repositoryUrl: `${repositoryUrl}?ref=main` }),
    /repository URL/,
  );
});
