import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync, gunzipSync } from "node:zlib";
import { createPackages } from "./package.mjs";

const PNG_1X1 = makePng1x1();

function makePng1x1() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 0]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([name, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([length, name, data, crc]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function fixture(t, { previewIds = ["alpha", "all"] } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "herdr-package-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    "mods/alpha/mod.json": '{"place":"none"}\n',
    "mods/alpha/main.js": "export const alpha = true;\n",
    "mods/alpha/asset.svg": "<svg/>\n",
    "mods/alpha/example.test.mjs": "throw new Error('test only');\n",
    "mods/beta/mod.json": '{"place":"none"}\n',
    "mods/beta/main.js": "export const beta = true;\n",
    "mods/beta/test_helper.py": "raise RuntimeError('test only')\n",
    "keys.json": "{\"keys\":[]}\n",
    "layouts/tmux.json": "{\"layout\":true}\n",
    "recipes/alpha/RECIPE.md": "# Alpha\n",
    "recipes/all/RECIPE.md": "# All\n",
    "recipes/catalog.json": JSON.stringify({
      alpha: { mods: ["alpha"], files: [] },
      all: { mods: ["alpha", "beta"], files: ["keys.json", "layouts/tmux.json"] },
    }),
  };
  for (const [file, content] of Object.entries(files)) {
    const absolute = path.join(root, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  for (const id of previewIds) {
    const absolute = path.join(root, "recipes", id, "preview.png");
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, PNG_1X1);
  }
  await chmod(path.join(root, "mods/alpha/main.js"), 0o755);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync(
    "git",
    ["-c", "user.name=Herdr Tests", "-c", "user.email=herdr-tests@example.invalid", "commit", "-qm", "fixture"],
    { cwd: root },
  );
  return root;
}

function readArchive(archive) {
  const tar = gunzipSync(archive);
  const files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString().replace(/\0.*$/, "");
    const pathName = prefix ? `${prefix}/${name}` : name;
    const fullName = header[156] === "5".charCodeAt(0) ? `${pathName}/` : pathName;
    const size = Number.parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, "").trim(), 8);
    const dataStart = offset + 512;
    files.set(fullName, tar.subarray(dataStart, dataStart + size));
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

function namesInArchive(archive) {
  return [...readArchive(archive).keys()].sort();
}

function modeInArchive(archive, targetPath) {
  const tar = gunzipSync(archive);
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString().replace(/\0.*$/, "");
    const pathName = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, "").trim(), 8);
    if (pathName === targetPath) return Number.parseInt(header.subarray(100, 108).toString().replace(/\0.*$/, "").trim(), 8);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

test("creates deterministic app-home entries from catalog-selected tracked files", async (t) => {
  const root = await fixture(t);
  const outDir = path.join(root, "artifacts");
  const first = await createPackages({ root, outDir, version: "1.2.3" });
  const alphaArchive = path.join(outDir, "alpha-v1.2.3.tar.gz");
  const allArchive = path.join(outDir, "all-v1.2.3.tar.gz");
  const alphaFiles = readArchive(await readFile(alphaArchive));
  const allFiles = readArchive(await readFile(allArchive));

  assert.deepEqual(first.map(({ id }) => id), ["all", "alpha"]);
  assert.deepEqual(namesInArchive(await readFile(alphaArchive)), [
    "alpha-v1.2.3/",
    "alpha-v1.2.3/RECIPE.md",
    "alpha-v1.2.3/manifest.json",
    "alpha-v1.2.3/mods/",
    "alpha-v1.2.3/mods/alpha/",
    "alpha-v1.2.3/mods/alpha/asset.svg",
    "alpha-v1.2.3/mods/alpha/main.js",
    "alpha-v1.2.3/mods/alpha/mod.json",
    "alpha-v1.2.3/preview.png",
  ]);
  assert.equal(alphaFiles.get("alpha-v1.2.3/mods/alpha/main.js").toString(), "export const alpha = true;\n");
  assert.equal(alphaFiles.has("alpha-v1.2.3/mods/alpha/example.test.mjs"), false);
  assert.equal(allFiles.has("all-v1.2.3/mods/beta/main.js"), true);
  assert.equal(allFiles.has("all-v1.2.3/keys.json"), true);
  assert.equal(allFiles.has("all-v1.2.3/layouts/tmux.json"), true);
  assert.equal(allFiles.has("all-v1.2.3/mods/alpha/example.test.mjs"), false);
  assert.equal(modeInArchive(await readFile(alphaArchive), "alpha-v1.2.3/mods/alpha/main.js"), 0o755);
  assert.deepEqual(
    execFileSync("tar", ["-tzf", alphaArchive], { encoding: "utf8" })
      .trim()
      .split("\n")
      .map((name) => name.replace(/\/$/, ""))
      .sort(),
    namesInArchive(await readFile(alphaArchive)).map((name) => name.replace(/\/$/, "")),
  );
  const checksumFile = await readFile(`${alphaArchive}.sha256`, "utf8");
  assert.equal(
    checksumFile,
    `${createHash("sha256").update(await readFile(alphaArchive)).digest("hex")}  alpha-v1.2.3.tar.gz\n`,
  );

  const manifest = JSON.parse(allFiles.get("all-v1.2.3/manifest.json").toString());
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.id, "all");
  assert.equal(manifest.version, "1.2.3");
  assert.equal(manifest.previewIncluded, true);
  assert.equal(manifest.bundleFormatComplete, true);
  assert.equal(manifest.nativeUiVerified, false);
  assert.equal(manifest.gallerySubmitted, false);
  assert.equal(manifest.selectedSourcesDirty, false);
  assert.equal(manifest.baseCommit, execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim());
  assert.ok(manifest.files.some(({ path: file }) => file === "mods/beta/main.js"));

  await rm(outDir, { recursive: true });
  await createPackages({ root, outDir, version: "1.2.3" });
  assert.deepEqual(await readFile(alphaArchive), first[1].archive);
});

test("an individual entry does not require previews for unrelated entries", async (t) => {
  const root = await fixture(t, { previewIds: ["alpha"] });
  const outDir = path.join(root, "artifacts");
  const result = await createPackages({ root, outDir, version: "1.2.3", entryId: "alpha" });

  assert.deepEqual(result.map(({ id }) => id), ["alpha"]);
  assert.equal(await readFile(path.join(outDir, "alpha-v1.2.3.tar.gz")) instanceof Buffer, true);
  await assert.rejects(readFile(path.join(outDir, "all-v1.2.3.tar.gz")), { code: "ENOENT" });
});

test("rejects unknown catalog entries without creating outputs", async (t) => {
  const root = await fixture(t);
  const outDir = path.join(root, "artifacts");

  await assert.rejects(
    createPackages({ root, outDir, version: "1.2.3", entryId: "not-real" }),
    /Unknown recipe entry 'not-real'.*--help/,
  );
  await assert.rejects(import("node:fs/promises").then(({ readdir }) => readdir(outDir)), { code: "ENOENT" });
});

test("rejects a mod with no tracked main.js entrypoint", async (t) => {
  const root = await fixture(t);
  await rm(path.join(root, "mods/alpha/main.js"));
  execFileSync("git", ["add", "-A"], { cwd: root });

  await assert.rejects(
    createPackages({ root, outDir: path.join(root, "artifacts"), version: "1.2.3", entryId: "alpha" }),
    /Missing tracked Herdr entrypoint: mods\/alpha\/main\.js/,
  );
});

test("excludes untracked and ignored files from package membership", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "mods/alpha/untracked.js"), "export const secret = true;\n");
  await mkdir(path.join(root, "mods/alpha/__pycache__"), { recursive: true });
  await writeFile(path.join(root, "mods/alpha/__pycache__/stale.pyc"), "stale");
  const outDir = path.join(root, "artifacts");

  await createPackages({ root, outDir, version: "1.2.3" });
  const files = readArchive(await readFile(path.join(outDir, "alpha-v1.2.3.tar.gz")));
  assert.equal(files.has("alpha-v1.2.3/mods/alpha/untracked.js"), false);
  assert.equal(files.has("alpha-v1.2.3/mods/alpha/__pycache__/stale.pyc"), false);
});

test("requires tracked previews for release artifacts before writing any output", async (t) => {
  const root = await fixture(t, { previewIds: ["all"] });
  const outDir = path.join(root, "artifacts");

  await assert.rejects(
    createPackages({ root, outDir, version: "1.2.3" }),
    /Missing tracked preview.*recipes\/alpha\/preview\.png.*--draft/,
  );
  await assert.rejects(import("node:fs/promises").then(({ readdir }) => readdir(outDir)), {
    code: "ENOENT",
  });
});

test("draft artifacts omit absent previews and report incomplete bundle format", async (t) => {
  const root = await fixture(t, { previewIds: ["all"] });
  const outDir = path.join(root, "artifacts");
  await createPackages({ root, outDir, version: "1.2.3", draft: true });

  const files = readArchive(await readFile(path.join(outDir, "alpha-v1.2.3.tar.gz")));
  const manifest = JSON.parse(files.get("alpha-v1.2.3/manifest.json").toString());
  assert.equal(files.has("alpha-v1.2.3/preview.png"), false);
  assert.equal(manifest.previewIncluded, false);
  assert.equal(manifest.bundleFormatComplete, false);
  assert.equal(manifest.nativeUiVerified, false);
  assert.equal(manifest.gallerySubmitted, false);
  assert.equal(manifest.selectedSourcesDirty, false);
  assert.equal(manifest.draft, true);
});

test("rejects dirty selected sources for complete builds and records them in drafts", async (t) => {
  const root = await fixture(t);
  const source = path.join(root, "mods/alpha/main.js");
  await writeFile(source, "export const alpha = 'edited';\\n");
  const outDir = path.join(root, "artifacts");

  await assert.rejects(
    createPackages({ root, outDir, version: "1.2.3" }),
    /Selected release sources differ from HEAD: mods\/alpha\/main\.js.*--draft/,
  );
  await assert.rejects(import("node:fs/promises").then(({ readdir }) => readdir(outDir)), { code: "ENOENT" });

  await createPackages({ root, outDir, version: "1.2.3", draft: true });
  const files = readArchive(await readFile(path.join(outDir, "alpha-v1.2.3.tar.gz")));
  const manifest = JSON.parse(files.get("alpha-v1.2.3/manifest.json").toString());
  assert.equal(manifest.baseCommit, execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim());
  assert.equal(manifest.selectedSourcesDirty, true);
  assert.deepEqual(manifest.changedSources, ["mods/alpha/main.js"]);
  assert.equal(manifest.nativeUiVerified, false);
});

test("refuses to overwrite existing release artifacts", async (t) => {
  const root = await fixture(t);
  const outDir = path.join(root, "artifacts");
  await mkdir(outDir);
  const archive = path.join(outDir, "alpha-v1.2.3.tar.gz");
  await writeFile(archive, "keep this file");

  await assert.rejects(createPackages({ root, outDir, version: "1.2.3" }), /Refusing to overwrite/);
  assert.equal(await readFile(archive, "utf8"), "keep this file");
  await assert.rejects(readFile(path.join(outDir, "all-v1.2.3.tar.gz")), { code: "ENOENT" });
});

test("rejects unsafe catalog paths and invalid versions", async (t) => {
  const root = await fixture(t);
  await writeFile(
    path.join(root, "recipes/catalog.json"),
    JSON.stringify({ alpha: { mods: ["../alpha"], files: ["../../outside"] } }),
  );
  execFileSync("git", ["add", "recipes/catalog.json"], { cwd: root });

  await assert.rejects(createPackages({ root, outDir: path.join(root, "out"), version: "1.2.3" }), /Invalid mod ID/);
  await assert.rejects(createPackages({ root, outDir: path.join(root, "out"), version: "v1.2.3" }), /Version must be/);
});

test("rejects app-home output paths", async (t) => {
  const root = await fixture(t);
  const appHome = path.join(root, "home/.config/herdr-app");
  const outDir = path.join(appHome, "releases");

  await assert.rejects(
    createPackages({ root, outDir, version: "1.2.3", env: { HOME: path.join(root, "home") } }),
    /Refusing output inside Herdr app home/,
  );
  await assert.rejects(import("node:fs/promises").then(({ stat }) => stat(appHome)), { code: "ENOENT" });
});

test("refuses lexically app-home output that escapes through a child symlink", async (t) => {
  const root = await fixture(t);
  const home = path.join(root, "synthetic-home");
  const appHome = path.join(home, ".config/herdr-app");
  const externalDirectory = path.join(root, "external-output");
  await mkdir(appHome, { recursive: true });
  await mkdir(externalDirectory);
  await symlink(externalDirectory, path.join(appHome, "mods"), "dir");
  const outDir = path.join(appHome, "mods/export");

  await assert.rejects(
    createPackages({ root, outDir, version: "1.2.3", env: { HOME: home } }),
    /Refusing output inside Herdr app home/,
  );
  await assert.rejects(readFile(path.join(externalDirectory, "alpha-v1.2.3.tar.gz")), { code: "ENOENT" });
});

test("rejects symlinked tracked runtime files", async (t) => {
  const root = await fixture(t);
  await rm(path.join(root, "mods/alpha/main.js"));
  await writeFile(path.join(root, "outside.js"), "export const outside = true;\n");
  await import("node:fs/promises").then(({ symlink }) => symlink("../../outside.js", path.join(root, "mods/alpha/main.js")));
  execFileSync("git", ["add", "-A"], { cwd: root });

  await assert.rejects(
    createPackages({ root, outDir: path.join(root, "out"), version: "1.2.3" }),
    /Refusing symlink source file/,
  );
});

test("rejects a malformed supplied preview instead of publishing it", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "recipes/alpha/preview.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  execFileSync("git", ["add", "recipes/alpha/preview.png"], { cwd: root });

  await assert.rejects(
    createPackages({ root, outDir: path.join(root, "out"), version: "1.2.3" }),
    /Invalid PNG preview: recipes\/alpha\/preview\.png/,
  );
});

test("rejects a symlinked source directory", async (t) => {
  const root = await fixture(t);
  const source = path.join(root, "mods/alpha");
  const outside = path.join(root, "outside-mod");
  await mkdir(outside);
  await writeFile(path.join(outside, "mod.json"), '{"place":"none"}\\n');
  await writeFile(path.join(outside, "main.js"), "export const external = true;\\n");
  await rm(source, { recursive: true });
  await import("node:fs/promises").then(({ symlink }) => symlink(outside, source, "dir"));

  await assert.rejects(
    createPackages({ root, outDir: path.join(root, "out"), version: "1.2.3" }),
    /Refusing symlink source path: mods\/alpha\/main\.js/,
  );
});

test("rejects reserved package paths and non-file catalog entries", async (t) => {
  const root = await fixture(t);
  await writeFile(
    path.join(root, "recipes/catalog.json"),
    JSON.stringify({ alpha: { mods: ["alpha"], files: ["manifest.json"] } }),
  );
  execFileSync("git", ["add", "recipes/catalog.json"], { cwd: root });

  await assert.rejects(
    createPackages({ root, outDir: path.join(root, "out"), version: "1.2.3" }),
    /reserved package path/,
  );

  await writeFile(
    path.join(root, "recipes/catalog.json"),
    JSON.stringify({ alpha: { mods: ["alpha"], files: ["layouts/"] } }),
  );
  execFileSync("git", ["add", "recipes/catalog.json"], { cwd: root });
  await assert.rejects(
    createPackages({ root, outDir: path.join(root, "out"), version: "1.2.3" }),
    /Invalid app-home file path/,
  );
});

test("CLI help documents required preview recovery and draft mode", () => {
  const output = execFileSync(process.execPath, ["scripts/package.mjs", "--help"], {
    encoding: "utf8",
  });
  assert.match(output, /--version X\.Y\.Z/);
  assert.match(output, /--entry ID/);
  assert.match(output, /--draft/);
  assert.match(output, /recipes\/\<entry-id\>\/preview\.png/);
});
