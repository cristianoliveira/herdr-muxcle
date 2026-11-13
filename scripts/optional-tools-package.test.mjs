import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createModPackage, createPackPackage, RELEASE_CATALOG, verifyPackage } from "./package.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

for (const [name, helper, key] of [
  ["muxcle-image-preview", "preview.py", "ctrl-a i"],
  ["muxcle-port-forward", "forward.py", "ctrl-a t"],
]) {
  test(`${name} is an independent reproducible payload with conflict-safe installation`, async () => {
    const temporary = await mkdtemp(join(tmpdir(), `${name}-package-`));
    try {
      const options = { repositoryRoot, outputDirectory: join(temporary, "dist") };
      const info = await createModPackage(name, options);
      const verified = verifyPackage({
        outputDirectory: options.outputDirectory,
        packageName: name,
        version: info.version,
      });
      assert.deepEqual(
        verified.files,
        [
          "RECIPE.md",
          "check-install-targets.sh",
          "keys.json",
          "manifest.json",
          ...["main.js", "model.js", "mod.json", "package-owner.json", helper].map((file) => `mods/${name}/${file}`),
        ].sort(),
      );
      const keys = JSON.parse(await readFile(join(info.bundleDirectory, "keys.json"), "utf8"));
      assert.equal(keys.global[key], `mod.open:${name}`);
      assert.ok(RELEASE_CATALOG.some((entry) => entry.name === name));
      const repeated = await createModPackage(name, { ...options, outputDirectory: join(temporary, "again") });
      assert.deepEqual(await readFile(repeated.archivePath), await readFile(info.archivePath));
      assert.equal(
        await readFile(join(info.bundleDirectory, `mods/${name}/${helper}`), "utf8"),
        await readFile(join(repositoryRoot, `mods/${name}/${helper}`), "utf8"),
      );

      const home = join(temporary, "app");
      const target = join(home, "mods", name);
      const script = join(info.bundleDirectory, "check-install-targets.sh");
      const check = (...args) => spawnSync("sh", [script, ...args, home], { encoding: "utf8" });
      assert.notEqual(spawnSync("sh", [script, "relative-home"], { cwd: temporary }).status, 0);
      assert.notEqual(spawnSync("sh", [script, "/"]).status, 0);
      const linkedHome = join(temporary, "linked-app");
      await mkdir(home);
      await symlink(home, linkedHome);
      assert.notEqual(spawnSync("sh", [script, `${linkedHome}/`]).status, 0);
      assert.equal(check().status, 0);
      assert.notEqual(spawnSync("sh", [script, home, "unexpected"]).status, 0);
      await mkdir(target, { recursive: true });
      assert.notEqual(check().status, 0);
      assert.notEqual(check("--update").status, 0);
      assert.notEqual(check("--remove").status, 0);
      await writeFile(join(target, "package-owner.json"), `${JSON.stringify({ package: name, schema: 1 })}\n`);
      assert.equal(check("--update").status, 0);
      assert.equal(check("--remove").status, 0);
      await rm(target, { recursive: true });
      await symlink(join(info.bundleDirectory, "mods", name), target);
      assert.notEqual(check("--update").status, 0);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}

test("optional image and SSH tools are not silently installed by the terminal-workflow pack", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "muxcle-optional-pack-"));
  try {
    const info = await createPackPackage({ repositoryRoot, outputDirectory: temporary });
    const verified = verifyPackage({ outputDirectory: temporary, packageName: info.name, version: info.version });
    assert.ok(
      !verified.files.some(
        (path) => path.startsWith("mods/muxcle-image-preview/") || path.startsWith("mods/muxcle-port-forward/"),
      ),
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
