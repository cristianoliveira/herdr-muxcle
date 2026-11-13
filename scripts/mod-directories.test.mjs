import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listModDirectories } from "./mod-directories.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "herdr-mod-list-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "mods"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

async function writeEntrypoint(root, id) {
  const file = path.join(root, "mods", id, "main.js");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "export default class Mod {}\n");
  return file;
}

test("discovers only direct mod main.js files tracked by Git", async (t) => {
  const root = await fixture(t);
  await writeEntrypoint(root, "tmux-compat");
  await writeEntrypoint(root, "funzzy-status");
  await writeEntrypoint(root, "legacy-generated");
  await writeEntrypoint(root, "nested/deeper");
  execFileSync("git", ["add", "mods/tmux-compat/main.js", "mods/funzzy-status/main.js", "mods/nested/deeper/main.js"], { cwd: root });

  assert.deepEqual(await listModDirectories(root), ["mods/funzzy-status", "mods/tmux-compat"]);
});

test("rejects a tracked entrypoint missing from the working tree", async (t) => {
  const root = await fixture(t);
  const entrypoint = await writeEntrypoint(root, "broken");
  execFileSync("git", ["add", "mods/broken/main.js"], { cwd: root });
  await rm(entrypoint);

  await assert.rejects(listModDirectories(root), /Tracked mod entrypoint is missing: mods\/broken\/main\.js/);
});

test("ignores untracked symlinked legacy mod directories", async (t) => {
  const root = await fixture(t);
  await writeEntrypoint(root, "actual");
  const source = path.join(root, "outside");
  await mkdir(source);
  await writeFile(path.join(source, "main.js"), "export default class Mod {}\n");
  await import("node:fs/promises").then(({ symlink }) => symlink(source, path.join(root, "mods/legacy"), "dir"));
  execFileSync("git", ["add", "mods/actual/main.js"], { cwd: root });

  assert.deepEqual(await listModDirectories(root), ["mods/actual"]);
});
