import { createHash } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = "recipes/catalog.json";
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MOD_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;

const HELP = `Herdr Term release packager

Usage:
  node scripts/package.mjs --version X.Y.Z [--entry ID] [--out DIR] [--draft]
  node scripts/package.mjs --help

Builds one app-home-shaped .tar.gz and .sha256 per entry in recipes/catalog.json.
The default output directory is dist/ at the repository root. Each entry contains
its RECIPE.md, selected mods/<id>/ directories, and explicit app-home files.
Developer prerequisites: Node.js and Git; no npm install or compiler is needed.
A genuine tracked recipes/<entry-id>/preview.png is required for a complete
bundle. A clean selected-source checkout is required unless --draft is used.
The manifest never claims native UI verification or gallery submission.

Options:
  --version X.Y.Z  Required release version (stable numeric version only)
  --entry ID       Build one catalog entry; defaults to every entry
  --out DIR        Output directory; defaults to dist/
  --draft          Permit missing previews and mark every artifact as a draft
  --help           Show this help

Examples:
  node scripts/package.mjs --version 0.3.0
  node scripts/package.mjs --version 0.3.0 --entry tmux-compat
  node scripts/package.mjs --version 0.3.0 --out /tmp/herdr-release --draft

Refusals:
  Existing artifacts are never overwritten. Output inside HERDR_APP_HOME (or
  ~/.config/herdr-app) is refused. Only Git-tracked source files are packaged.
`;

export async function createPackages({
  root = ROOT,
  outDir = join(root, "dist"),
  version,
  draft = false,
  env = process.env,
  entryId,
} = {}) {
  validateVersion(version);
  const absoluteRoot = await realpath(resolve(root));
  const tracked = readTrackedFiles(absoluteRoot);
  const catalog = await readCatalog(absoluteRoot, tracked);
  const plans = [];
  const selectedEntries = selectEntries(catalog, entryId);

  for (const [id, entry] of selectedEntries.sort(([left], [right]) => compareStrings(left, right))) {
    plans.push(await planEntry({ id, entry, root: absoluteRoot, tracked, version, draft }));
  }

  const absoluteOut = resolve(outDir);
  await assertOutputOutsideAppHome(absoluteOut, env);
  await assertOutputDirectory(absoluteOut);
  await assertTargetsAvailable(absoluteOut, plans);
  await mkdir(absoluteOut, { recursive: true });

  const stage = await mkdtemp(join(absoluteOut, ".herdr-package-"));
  const created = [];
  try {
    const staged = [];
    for (const plan of plans) {
      const archive = createArchive(plan);
      const archiveName = `${plan.id}-v${version}.tar.gz`;
      const checksumName = `${archiveName}.sha256`;
      const stagedArchive = join(stage, archiveName);
      const stagedChecksum = join(stage, checksumName);
      const checksum = `${sha256(archive)}  ${archiveName}\n`;
      await writeFile(stagedArchive, archive, { flag: "wx", mode: 0o644 });
      await writeFile(stagedChecksum, checksum, { flag: "wx", mode: 0o644 });
      staged.push({ plan, archive, checksum, stagedArchive, stagedChecksum, archiveName, checksumName });
    }

    for (const item of staged) {
      const archivePath = join(absoluteOut, item.archiveName);
      const checksumPath = join(absoluteOut, item.checksumName);
      await link(item.stagedArchive, archivePath);
      created.push(archivePath);
      await link(item.stagedChecksum, checksumPath);
      created.push(checksumPath);
      item.plan.archivePath = archivePath;
      item.plan.checksumPath = checksumPath;
      item.plan.archive = item.archive;
      item.plan.checksum = item.checksum;
    }
    return plans;
  } catch (error) {
    await Promise.all(created.map((file) => unlink(file).catch(() => {})));
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function planEntry({ id, entry, root, tracked, version, draft }) {
  validateEntry(id, entry);
  const payload = new Map();
  const recipePath = `recipes/${id}/RECIPE.md`;
  payload.set("RECIPE.md", await readTrackedSource(recipePath, root, tracked));

  for (const modId of entry.mods) {
    const modRoot = `mods/${modId}`;
    const mainPath = `${modRoot}/main.js`;
    if (!tracked.has(mainPath)) throw new Error(`Missing tracked Herdr entrypoint: ${mainPath}.`);
    await readTrackedSource(mainPath, root, tracked);
    const manifest = await readTrackedSource(`${modRoot}/mod.json`, root, tracked);
    try {
      JSON.parse(manifest.bytes.toString("utf8"));
    } catch {
      throw new Error(`Invalid Herdr mod metadata: ${modRoot}/mod.json.`);
    }

    const files = [...tracked.keys()]
      .filter((file) => file.startsWith(`${modRoot}/`) && !excludedModFile(file.slice(modRoot.length + 1)))
      .sort();
    if (!files.includes(`${modRoot}/mod.json`)) {
      throw new Error(`Missing tracked Herdr metadata: ${modRoot}/mod.json.`);
    }
    for (const file of files) {
      payload.set(file, await readTrackedSource(file, root, tracked));
    }
  }

  for (const file of entry.files) {
    validatePayloadPath(file);
    if (file.startsWith("mods/")) {
      throw new Error(`Catalog files must not duplicate mod directories: ${file}.`);
    }
    if (["RECIPE.md", "preview.png", "manifest.json"].includes(file)) {
      throw new Error(`Catalog file uses a reserved package path: ${file}.`);
    }
    payload.set(file, await readTrackedSource(file, root, tracked));
  }

  const previewPath = `recipes/${id}/preview.png`;
  const hasTrackedPreview = tracked.has(previewPath);
  if (!hasTrackedPreview && !draft) {
    throw new Error(
      `Missing tracked preview for '${id}': ${previewPath}. Add the genuine screenshot with 'git add -- ${previewPath}', or use --draft for a local draft artifact.`,
    );
  }
  if (hasTrackedPreview) {
    const preview = await readTrackedSource(previewPath, root, tracked);
    if (preview.bytes.length > MAX_PREVIEW_BYTES || !isPng(preview.bytes)) {
      throw new Error(`Invalid PNG preview: ${previewPath}. Supply a valid PNG screenshot.`);
    }
    payload.set("preview.png", preview);
  }

  const files = [...payload.entries()]
    .map(([path, source]) => ({
      path,
      bytes: source.bytes,
      mode: source.mode,
      source: source.source,
      sha256: sha256(source.bytes),
    }))
    .sort((left, right) => compareStrings(left.path, right.path));
  const changedSources = readChangedSources(root, [CATALOG_PATH, ...files.map(({ source }) => source)]);
  if (changedSources.length > 0 && !draft) {
    throw new Error(
      `Selected release sources differ from HEAD: ${changedSources.join(", ")}. Commit the intended sources before a complete build, or use --draft for a local artifact.`,
    );
  }
  const manifest = {
    schema: 1,
    id,
    version,
    baseCommit: readSourceCommit(root),
    draft: Boolean(draft),
    selectedSourcesDirty: changedSources.length > 0,
    changedSources,
    previewIncluded: hasTrackedPreview,
    bundleFormatComplete: hasTrackedPreview,
    nativeUiVerified: false,
    gallerySubmitted: false,
    files: files.map(({ path, source, bytes, mode, sha256: digest }) => ({
      path,
      source,
      size: bytes.length,
      mode: mode.toString(8),
      sha256: digest,
    })),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  files.push({
    path: "manifest.json",
    bytes: manifestBytes,
    mode: 0o644,
    source: "generated:manifest",
    sha256: sha256(manifestBytes),
  });
  files.sort((left, right) => compareStrings(left.path, right.path));

  return {
    id,
    version,
    archive: null,
    checksum: null,
    files,
    manifest,
  };
}

function selectEntries(catalog, entryId) {
  if (entryId === undefined) return Object.entries(catalog);
  if (typeof entryId !== "string" || !Object.hasOwn(catalog, entryId)) {
    const available = Object.keys(catalog).sort(compareStrings).join(", ");
    throw new Error(`Unknown recipe entry '${entryId}'. Available entries: ${available}. Run node scripts/package.mjs --help.`);
  }
  return [[entryId, catalog[entryId]]];
}

function validateEntry(id, entry) {
  if (!MOD_ID_PATTERN.test(id)) throw new Error(`Invalid recipe entry ID '${id}'.`);
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Invalid catalog entry '${id}': expected an object.`);
  }
  const keys = Object.keys(entry).sort();
  if (keys.join(",") !== "files,mods") {
    throw new Error(`Invalid catalog entry '${id}': expected exactly 'mods' and 'files'.`);
  }
  if (!Array.isArray(entry.mods) || entry.mods.length === 0) {
    throw new Error(`Invalid catalog entry '${id}': mods must be a non-empty array.`);
  }
  if (entry.mods.some((modId) => typeof modId !== "string" || !MOD_ID_PATTERN.test(modId))) {
    throw new Error(`Invalid mod ID in catalog entry '${id}'.`);
  }
  if (new Set(entry.mods).size !== entry.mods.length) {
    throw new Error(`Duplicate mod ID in catalog entry '${id}'.`);
  }
  if (!Array.isArray(entry.files) || entry.files.some((file) => typeof file !== "string")) {
    throw new Error(`Invalid catalog entry '${id}': files must be an array of root-relative paths.`);
  }
  for (const file of entry.files) validatePayloadPath(file);
  if (new Set(entry.files).size !== entry.files.length) {
    throw new Error(`Duplicate app-home file in catalog entry '${id}'.`);
  }
}

function validatePayloadPath(file) {
  if (
    typeof file !== "string" ||
    file.length === 0 ||
    file.includes("\\") ||
    file.includes("\0") ||
    /[\x00-\x1f\x7f]/.test(file) ||
    /[*?{}\[\]]/.test(file) ||
    isAbsolute(file) ||
    file.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Invalid app-home file path '${file}'. Use an explicit root-relative file path, not a directory or glob.`);
  }
}

function excludedModFile(relativePath) {
  const parts = relativePath.split("/");
  const name = parts.at(-1);
  return (
    parts.some((part) => part.startsWith(".")) ||
    parts.some((part) => part === "node_modules" || part === "__pycache__" || part === "tests") ||
    /(?:^|[.-])(?:test|spec)(?:[.-]|$)/i.test(name) ||
    /^test_.*\.py$/i.test(name) ||
    /_test\.py$/i.test(name) ||
    /\.(?:d\.ts|map)$/i.test(name) ||
    ["jsconfig.json", "package.json", "package-lock.json", "package-owner.json"].includes(name)
  );
}

async function readCatalog(root, tracked) {
  const { bytes } = await readTrackedSource(CATALOG_PATH, root, tracked);
  let catalog;
  try {
    catalog = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Invalid JSON in ${CATALOG_PATH}.`);
  }
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog) || Object.keys(catalog).length === 0) {
    throw new Error(`${CATALOG_PATH} must contain a non-empty object keyed by entry ID.`);
  }
  return catalog;
}

function readTrackedFiles(root) {
  let output;
  try {
    output = execFileSync("git", ["-C", root, "ls-files", "--stage", "-z"], { encoding: "buffer" });
  } catch {
    throw new Error(`Cannot list tracked release sources under ${root}; run this inside the Herdr Term Git checkout.`);
  }
  const files = new Map();
  for (const record of output.toString("utf8").split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    if (tab < 0) throw new Error("Git returned an invalid tracked-file record.");
    const [modeText, , stage] = record.slice(0, tab).split(" ");
    const file = record.slice(tab + 1);
    if (stage !== "0") throw new Error(`Cannot package an unmerged Git path: ${file}.`);
    files.set(file, Number.parseInt(modeText, 8));
  }
  return files;
}

async function readTrackedSource(file, root, tracked) {
  validatePayloadPath(file);
  const mode = tracked.get(file);
  if (mode === undefined) throw new Error(`Required source is not Git-tracked: ${file}. Run 'git add -- ${file}' for this intended source, then retry packaging.`);
  if (mode === 0o120000) throw new Error(`Refusing symlink source file: ${file}.`);
  const absolute = resolve(root, file);
  if (!isWithin(root, absolute)) throw new Error(`Source path escapes the checkout: ${file}.`);
  const segments = file.split("/");
  let current = root;
  let metadata;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    try {
      metadata = await lstat(current);
    } catch {
      throw new Error(`Tracked source file is missing from the worktree: ${file}.`);
    }
    if (metadata.isSymbolicLink()) throw new Error(`Refusing symlink source path: ${file}.`);
    if (index < segments.length - 1 && !metadata.isDirectory()) {
      throw new Error(`Expected a source directory in path: ${file}.`);
    }
  }
  if (!metadata.isFile()) throw new Error(`Expected a regular file: ${file}.`);
  const bytes = await readFile(absolute);
  return { bytes, mode: metadata.mode & 0o777, source: file };
}

function readSourceCommit(root) {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "--verify", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function readChangedSources(root, sources) {
  const uniqueSources = [...new Set(sources)];
  const output = execFileSync(
    "git",
    ["-C", root, "status", "--porcelain=v1", "-z", "--untracked-files=no", "--", ...uniqueSources],
    { encoding: "buffer" },
  );
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((record) => record.slice(3));
}

async function assertOutputOutsideAppHome(outDir, env) {
  const home = resolve(env.HOME || process.env.HOME || homedir());
  const configuredAppHome = env.HERDR_APP_HOME || join(home, ".config", "herdr-app");
  const outputLexical = resolve(outDir);
  const appHomeLexical = resolve(configuredAppHome);
  if (isWithin(appHomeLexical, outputLexical)) throw appHomeOutputError(outDir);

  const [outputCanonical, appHomeCanonical] = await Promise.all([
    resolvePotentialPath(outputLexical),
    resolvePotentialPath(appHomeLexical),
  ]);
  if (isWithin(appHomeCanonical, outputCanonical)) throw appHomeOutputError(outDir);
}

async function resolvePotentialPath(value) {
  const absolute = resolve(value);
  let current = absolute;
  const tail = [];
  while (true) {
    try {
      await lstat(current);
      const canonical = await realpath(current);
      return resolve(canonical, ...tail);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      tail.unshift(basename(current));
      current = parent;
    }
  }
}

function isWithin(parent, child) {
  const difference = relative(parent, child);
  return difference === "" || (!difference.startsWith(`..${sep}`) && difference !== ".." && !isAbsolute(difference));
}

function appHomeOutputError(outDir) {
  return new Error(`Refusing output inside Herdr app home: ${outDir}. Choose a repository-owned output directory instead.`);
}

async function assertOutputDirectory(outDir) {
  try {
    const metadata = await lstat(outDir);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`Output path must be a real directory, not a symlink or file: ${outDir}.`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function assertTargetsAvailable(outDir, plans) {
  for (const { id, version } of plans) {
    for (const name of [`${id}-v${version}.tar.gz`, `${id}-v${version}.tar.gz.sha256`]) {
      const target = join(outDir, name);
      try {
        await lstat(target);
        throw new Error(`Refusing to overwrite existing release artifact: ${target}. Choose a new version or output directory.`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
}

function createArchive(plan) {
  const rootName = `${plan.id}-v${plan.version}`;
  const entries = new Map();
  entries.set(`${rootName}/`, { directory: true, mode: 0o755, bytes: Buffer.alloc(0) });

  for (const file of plan.files) {
    const target = `${rootName}/${file.path}`;
    validatePayloadPath(target);
    const segments = target.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      const directory = `${segments.slice(0, index).join("/")}/`;
      const existing = entries.get(directory) ?? entries.get(directory.slice(0, -1));
      if (existing && !existing.directory) throw new Error(`Archive path conflicts with a file: ${directory}.`);
      if (!entries.has(directory)) entries.set(directory, { directory: true, mode: 0o755, bytes: Buffer.alloc(0) });
    }
    if (entries.has(target) || entries.has(`${target}/`)) {
      throw new Error(`Duplicate or conflicting archive path: ${target}.`);
    }
    entries.set(target, { directory: false, mode: file.mode, bytes: file.bytes });
  }

  const tar = createUstar([...entries.entries()].sort(([left], [right]) => compareStrings(left, right)));
  return gzipSync(tar, { level: 9, mtime: 0 });
}

function createUstar(entries) {
  const chunks = [];
  for (const [name, entry] of entries) {
    const header = makeHeader(name, entry);
    chunks.push(header);
    if (!entry.directory) {
      chunks.push(entry.bytes);
      const padding = (512 - (entry.bytes.length % 512)) % 512;
      if (padding) chunks.push(Buffer.alloc(padding));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function makeHeader(path, entry) {
  const header = Buffer.alloc(512);
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  let name = normalized;
  let prefix = "";
  if (Buffer.byteLength(name) > 100) {
    const split = name.lastIndexOf("/");
    if (split < 1) throw new Error(`Archive path is too long for USTAR: ${path}.`);
    prefix = name.slice(0, split);
    name = name.slice(split + 1);
  }
  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
    throw new Error(`Archive path is too long for USTAR: ${path}.`);
  }
  putString(header, 0, 100, name);
  putOctal(header, 100, 8, entry.mode & 0o777);
  putOctal(header, 108, 8, 0);
  putOctal(header, 116, 8, 0);
  putOctal(header, 124, 12, entry.bytes.length);
  putOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = entry.directory ? "5".charCodeAt(0) : "0".charCodeAt(0);
  putString(header, 257, 6, "ustar\0");
  putString(header, 263, 2, "00");
  putString(header, 265, 32, "root");
  putString(header, 297, 32, "root");
  if (prefix) putString(header, 345, 155, prefix);

  const checksum = header.reduce((total, byte) => total + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, "0");
  header.write(`${checksumText}\0 `, 148, 8, "ascii");
  return header;
}

function putString(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) throw new Error(`Archive header field is too long: ${value}.`);
  bytes.copy(buffer, offset);
}

function putOctal(buffer, offset, length, value) {
  const digits = value.toString(8).padStart(length - 1, "0");
  if (digits.length >= length) throw new Error(`Archive numeric field is too large: ${value}.`);
  buffer.write(`${digits}\0`, offset, length, "ascii");
}

function isPng(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return false;
  let offset = PNG_SIGNATURE.length;
  let hasHeader = false;
  let hasData = false;
  let hasEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const crcStart = dataStart + length;
    if (crcStart + 4 > bytes.length) return false;
    const type = bytes.toString("ascii", typeStart, dataStart);
    const expectedCrc = bytes.readUInt32BE(crcStart);
    if (crc32(bytes.subarray(typeStart, crcStart)) !== expectedCrc) return false;
    if (!hasHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      const width = bytes.readUInt32BE(dataStart);
      const height = bytes.readUInt32BE(dataStart + 4);
      if (width === 0 || height === 0) return false;
      hasHeader = true;
    } else if (type === "IHDR") {
      return false;
    }
    if (type === "IDAT") hasData = true;
    offset = crcStart + 4;
    if (type === "IEND") {
      hasEnd = length === 0 && offset === bytes.length;
      break;
    }
  }
  return hasHeader && hasData && hasEnd;
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

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateVersion(version) {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    throw new Error("Version must be a stable X.Y.Z value without a leading v. Example: --version 0.3.0.");
  }
}

function parseArgs(args) {
  const options = { draft: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--help" || flag === "-h") return { help: true };
    if (flag === "--draft") {
      options.draft = true;
      continue;
    }
    if (flag === "--version" || flag === "--entry" || flag === "--out") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}. Run node scripts/package.mjs --help.`);
      index += 1;
      if (flag === "--version") options.version = value;
      else if (flag === "--entry") options.entryId = value;
      else options.outDir = value;
      continue;
    }
    throw new Error(`Unknown option '${flag}'. Run node scripts/package.mjs --help.`);
  }
  if (!options.version) throw new Error("Missing --version. Example: node scripts/package.mjs --version 0.3.0.");
  return options;
}

async function main(args) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      process.stdout.write(HELP);
      return 0;
    }
    const result = await createPackages(options);
    for (const item of result) {
      process.stdout.write(`Created ${item.archivePath}\nSHA-256: ${item.checksumPath}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
