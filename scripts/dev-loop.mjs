import { createHash, randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const moduleNamePattern = /^[a-z0-9][a-z0-9-]*$/;
const generatedNamePattern = /^[a-z0-9][a-z0-9-]*$/;
const ownerFile = ".muxcle-dev-loop.json";
const generationFile = ".muxcle-dev-generation.json";
const ignoredDirectories = new Set([".build", ".git", ".pi", ".tmp", "__pycache__", "dist", "node_modules"]);
const watchedPaths = [
  "package.json",
  "package-lock.json",
  "RECIPE.md",
  "tsconfig.json",
  "fixtures",
  "layouts",
  "mods",
  "packages",
  "scripts",
  "src",
  "types",
];

export const HELP = `Optional TypeScript-to-native development loop

Usage:
  node scripts/dev-loop.mjs build --mod <mod>
  node scripts/dev-loop.mjs link --mod <mod> --app-home <existing-home>
  node scripts/dev-loop.mjs activate --mod <mod> --app-home <existing-home>
  node scripts/dev-loop.mjs watch --mod <mod> --app-home <existing-home>
  node scripts/dev-loop.mjs status --mod <mod> --app-home <existing-home>
  node scripts/dev-loop.mjs revert --mod <mod> --app-home <existing-home> --generation <id>
  node scripts/dev-loop.mjs unlink --mod <mod> --app-home <existing-home>
  node scripts/dev-loop.mjs help

Examples:
  node scripts/dev-loop.mjs build --mod muxcle-picker
  node scripts/dev-loop.mjs link --mod muxcle-picker --app-home /tmp/herdr-app-home
  node scripts/dev-loop.mjs watch --mod muxcle-picker --app-home /tmp/herdr-app-home
  node scripts/dev-loop.mjs status --mod muxcle-picker --app-home /tmp/herdr-app-home
  node scripts/dev-loop.mjs revert --mod muxcle-picker --app-home /tmp/herdr-app-home --generation <older-id>
  node scripts/dev-loop.mjs unlink --mod muxcle-picker --app-home /tmp/herdr-app-home

Prerequisites:
  Node.js 22.23.4, npm 10.9.9, locked TypeScript dependencies, and a Muxcle checkout.
  Run: npm ci --ignore-scripts
  Build/link/watch require an individually packaged mod source. Python, hc, Neovim,
  clipboard permission, and mounted observers remain capability-specific runtime needs.

Safety and limits:
  build creates a complete immutable app-home-shaped generation; it does not edit an app home.
  link/activate changes only mods/<mod> to a whole-directory symlink into this checkout's
  managed generation. It does not edit settings, keys, layouts, or start/restart Herdr/Core.
  The app home and its mods/ container must already be real directories. Existing real mod
  folders and unowned links are refused. unlink removes only a verified managed link.
  watch requires an existing managed link, polls tracked source inputs, and swaps that link
  only after a complete successful build. A failed compile keeps the last-good link. Press
  Ctrl-C to stop; there is no daemon or separate stop command. Old generations are retained.
  status diagnoses the current link; revert explicitly selects a retained generation.
  Activation means exposing one mod folder only; it does not switch a layout or mount a host.
  Native symlink reload and asset cache behavior are version/platform-specific and must be
  verified separately. This tool never promises automatic process restart or asset refresh.
  Do not point it at a personal/default app home during isolated development checks.
`;

export async function buildModGeneration(
  modName,
  {
    repositoryRoot: sourceRoot = repositoryRoot,
    compile = compileProject,
    packageBuilder,
    generationId,
    now = () => new Date(),
  } = {},
) {
  assertModName(modName);
  const projectRoot = await realpath(sourceRoot);
  const managed = await ensureManagedRoot(projectRoot);
  const stage = await mkdtemp(join(managed.directory, `.stage-${modName}-`));
  const overlay = join(stage, "project");
  const packageOutput = join(stage, "packages");
  let published = false;

  try {
    const sourceFingerprint = await inputFingerprint(projectRoot);
    await createSourceOverlay(projectRoot, overlay);
    if (
      (await inputFingerprint(overlay)) !== sourceFingerprint ||
      (await inputFingerprint(projectRoot)) !== sourceFingerprint
    ) {
      throw new Error("source changed during build snapshot; retry after edits settle");
    }

    await compile({ projectRoot, repositoryRoot: overlay, modName, outputDirectory: join(overlay, ".build") });
    const selectedPackageBuilder = packageBuilder ?? (await importSnapshotPackageBuilder(overlay));
    const packageInfo = await selectedPackageBuilder(modName, {
      repositoryRoot: overlay,
      outputDirectory: packageOutput,
    });
    if ((await inputFingerprint(projectRoot)) !== sourceFingerprint) {
      throw new Error("source changed during build; generation discarded, retry after edits settle");
    }
    const bundle = resolve(packageInfo.bundleDirectory);
    if (!isWithin(packageOutput, bundle))
      throw new Error("package builder returned a path outside its staging directory");
    const packagedMod = join(bundle, "mods", modName);
    await assertRuntimeMod(packagedMod);

    const home = join(stage, "home");
    const homeMods = join(home, "mods");
    const modDirectory = join(homeMods, modName);
    await mkdir(homeMods, { recursive: true });
    await cp(packagedMod, modDirectory, { recursive: true, errorOnExist: true, force: false });
    await rm(overlay, { recursive: true, force: true });
    await rm(packageOutput, { recursive: true, force: true });

    const id = generationId ?? createGenerationId(modName, now());
    assertGenerationId(id);
    const createdAt = now().toISOString();
    await writeFile(
      join(stage, generationFile),
      `${JSON.stringify({ schema: 1, projectId: managed.projectId, id, modName, createdAt }, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    const destination = join(managed.directory, id);
    await rename(stage, destination);
    published = true;
    return {
      id,
      modName,
      root: destination,
      home: join(destination, "home"),
      modDirectory: join(destination, "home", "mods", modName),
      createdAt,
    };
  } finally {
    if (!published) await rm(stage, { recursive: true, force: true });
  }
}

export async function publishModGeneration(
  modName,
  appHome,
  generationId,
  { repositoryRoot: sourceRoot = repositoryRoot } = {},
) {
  assertModName(modName);
  const projectRoot = await realpath(sourceRoot);
  const generation = await readGeneration(projectRoot, modName, generationId);
  await assertRuntimeMod(generation.modDirectory, { allowNativeGenerated: true });
  const { modsDirectory, target } = await resolveAppTarget(appHome, modName);
  const existing = await lstatOrNull(target);

  if (existing && !existing.isSymbolicLink()) {
    throw new Error(`refusing to replace existing mod path that is not a symlink: ${target}`);
  }

  const existingTarget = existing ? await readlink(target) : null;
  if (existing) {
    const active = await currentModGeneration(modName, appHome, { repositoryRoot: projectRoot });
    if (!active) throw new Error(`mod link is not owned by this development loop: ${target}`);
    if (active.id === generation.id) return active;
  }

  const linkPath = join(modsDirectory, `.${modName}.dev-loop-${randomUUID()}`);
  if (!existing) {
    // Exclusive symlink creation preserves any path created after our preflight.
    await symlink(generation.modDirectory, target, "dir");
  } else {
    try {
      await symlink(generation.modDirectory, linkPath, "dir");
      const latest = await lstatOrNull(target);
      if (!latest?.isSymbolicLink() || !sameLink(existing, latest) || (await readlink(target)) !== existingTarget) {
        throw new Error(`mod link changed while publishing; refusing to replace: ${target}`);
      }
      await rename(linkPath, target);
    } finally {
      await rm(linkPath, { force: true });
    }
  }

  return generation;
}

export async function currentModGeneration(modName, appHome, { repositoryRoot: sourceRoot = repositoryRoot } = {}) {
  assertModName(modName);
  const projectRoot = await realpath(sourceRoot);
  const { target } = await resolveAppTarget(appHome, modName);
  const info = await lstatOrNull(target);
  if (!info) return null;
  if (!info.isSymbolicLink()) throw new Error(`mod path is not a development link: ${target}`);

  const linkTarget = resolve(dirname(target), await readlink(target));
  const managed = await ensureManagedRoot(projectRoot, { create: false });
  if (!managed || !isWithin(managed.directory, linkTarget)) {
    throw new Error(`mod link is not owned by this development loop: ${target}`);
  }
  const generationId = relative(managed.directory, linkTarget).split(sep)[0];
  assertGenerationId(generationId);
  const generation = await readGeneration(projectRoot, modName, generationId);
  if (linkTarget !== resolve(generation.modDirectory)) {
    throw new Error(`mod link does not point to its owned generation: ${target}`);
  }
  return generation;
}

export async function unlinkModGeneration(modName, appHome, { repositoryRoot: sourceRoot = repositoryRoot } = {}) {
  const active = await currentModGeneration(modName, appHome, { repositoryRoot: sourceRoot });
  if (!active) return false;
  const { target } = await resolveAppTarget(appHome, modName);
  const before = await lstat(target);
  if (!before.isSymbolicLink() || resolve(dirname(target), await readlink(target)) !== resolve(active.modDirectory)) {
    throw new Error(`mod link changed while unlinking; refusing to remove: ${target}`);
  }
  await unlink(target);
  return true;
}

export async function revertModGeneration(modName, appHome, generationId, options = {}) {
  return publishModGeneration(modName, appHome, generationId, options);
}

export async function listModGenerations(modName, { repositoryRoot: sourceRoot = repositoryRoot } = {}) {
  assertModName(modName);
  const projectRoot = await realpath(sourceRoot);
  const managed = await ensureManagedRoot(projectRoot, { create: false });
  if (!managed) return [];
  const entries = await readdir(managed.directory, { withFileTypes: true });
  const generations = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    try {
      generations.push(await readGeneration(projectRoot, modName, entry.name));
    } catch (error) {
      if (!String(error?.message).startsWith("generation belongs to another mod")) throw error;
    }
  }
  return generations.sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
}

export async function inputFingerprint(root = repositoryRoot) {
  const projectRoot = resolve(root);
  const hash = createHash("sha256");
  const files = [];
  for (const input of watchedPaths) await collectInput(join(projectRoot, input), input, files);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function watchModGenerations({
  modName,
  appHome,
  repositoryRoot: sourceRoot = repositoryRoot,
  signal,
  intervalMs = 500,
  debounceMs = 250,
  getFingerprint = inputFingerprint,
  waitForPoll = delay,
  buildGeneration = buildModGeneration,
  publishGeneration = publishModGeneration,
  onError = (error) => console.error(`BUILD FAILED; previous link remains active: ${error.message}`),
}) {
  assertModName(modName);
  if (!signal || typeof signal.aborted !== "boolean")
    throw new TypeError("watch requires an AbortSignal; press Ctrl-C to stop");
  const active = await currentModGeneration(modName, appHome, { repositoryRoot: sourceRoot });
  if (!active) throw new Error("watch requires an existing managed mod link; run link first");
  let observed = await getFingerprint(sourceRoot);

  while (!signal.aborted) {
    await waitForPoll(intervalMs, signal);
    if (signal.aborted) break;
    let next = await getFingerprint(sourceRoot);
    if (next === observed) continue;
    await waitForPoll(debounceMs, signal);
    if (signal.aborted) break;
    next = await getFingerprint(sourceRoot);
    observed = next;
    try {
      const generation = await buildGeneration(modName, { repositoryRoot: sourceRoot });
      if (signal.aborted) break;
      await publishGeneration(modName, appHome, generation.id, { repositoryRoot: sourceRoot });
      console.log(`Published ${modName} generation ${generation.id}`);
    } catch (error) {
      if (signal.aborted) break;
      onError(error);
    }
  }
}

async function compileProject({ projectRoot, repositoryRoot: overlayRoot, outputDirectory }) {
  const compiler = join(projectRoot, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  await lstat(compiler).catch(() => {
    throw new Error("TypeScript compiler is missing. Install locked development tools with: npm ci --ignore-scripts");
  });
  await mkdir(outputDirectory, { recursive: true });
  try {
    await execFile(compiler, ["--project", join(overlayRoot, "tsconfig.json"), "--outDir", outputDirectory], {
      cwd: overlayRoot,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const diagnostic = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(diagnostic || error.message, { cause: error });
  }
}

async function createSourceOverlay(projectRoot, overlayRoot) {
  await mkdir(overlayRoot, { recursive: false });
  for (const relativePath of watchedPaths) {
    const source = join(projectRoot, relativePath);
    if (!(await lstatOrNull(source))) continue;
    await copySnapshotEntry(source, join(overlayRoot, relativePath));
  }
  await mkdir(join(overlayRoot, ".build"), { recursive: true });
}

async function copySnapshotEntry(source, destination) {
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`development snapshot refuses source symlinks: ${source}`);
  if (info.isFile()) {
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
    return;
  }
  if (!info.isDirectory()) throw new Error(`development snapshot contains unsupported input: ${source}`);

  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ignoredDirectories.has(entry.name)) continue;
    await copySnapshotEntry(join(source, entry.name), join(destination, entry.name));
  }
}

async function importSnapshotPackageBuilder(overlayRoot) {
  const moduleUrl = `${pathToFileURL(join(overlayRoot, "scripts", "package.mjs")).href}?snapshot=${randomUUID()}`;
  const packageModule = await import(moduleUrl);
  if (typeof packageModule.createModPackage !== "function") {
    throw new Error("source snapshot does not export createModPackage");
  }
  return packageModule.createModPackage;
}

async function ensureManagedRoot(projectRoot, { create = true } = {}) {
  const buildDirectory = join(projectRoot, ".build");
  if (create) await mkdir(buildDirectory, { recursive: true });
  const buildInfo = await lstatOrNull(buildDirectory);
  if (!buildInfo) return null;
  if (!buildInfo.isDirectory() || buildInfo.isSymbolicLink())
    throw new Error(`build output must be a real directory: ${buildDirectory}`);

  const directory = join(buildDirectory, "dev-generations");
  if (create) await mkdir(directory, { recursive: true });
  const rootInfo = await lstatOrNull(directory);
  if (!rootInfo) return null;
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error(`generation storage must be a real directory: ${directory}`);
  const projectId = createHash("sha256").update(projectRoot).digest("hex");
  const marker = join(directory, ownerFile);
  let value = await readJsonOrNull(marker);
  if (!value && create) {
    const entries = await readdir(directory);
    if (entries.length > 0) throw new Error(`refusing to adopt unmarked generation storage: ${directory}`);
    const content = { schema: 1, projectId };
    try {
      await writeFile(marker, `${JSON.stringify(content)}\n`, { flag: "wx", mode: 0o600 });
      value = content;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      value = await readJsonOrNull(marker);
    }
  }
  if (!value) return null;
  if (value.schema !== 1 || value.projectId !== projectId)
    throw new Error(`generation storage belongs to another checkout: ${directory}`);
  return { directory, projectId };
}

async function readGeneration(projectRoot, modName, generationId) {
  assertModName(modName);
  assertGenerationId(generationId);
  const managed = await ensureManagedRoot(projectRoot, { create: false });
  if (!managed) throw new Error(`generation is unavailable: ${generationId}`);
  const root = join(managed.directory, generationId);
  const rootInfo = await lstatOrNull(root);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error(`generation is unavailable: ${generationId}`);
  const markerPath = join(root, generationFile);
  const markerInfo = await lstatOrNull(markerPath);
  if (!markerInfo?.isFile() || markerInfo.isSymbolicLink())
    throw new Error(`generation ownership is unverified: ${generationId}`);
  const marker = await readJson(markerPath);
  if (marker.schema !== 1 || marker.projectId !== managed.projectId || marker.id !== generationId) {
    throw new Error(`generation ownership is unverified: ${generationId}`);
  }
  if (marker.modName !== modName) throw new Error(`generation belongs to another mod: ${generationId}`);
  const home = join(root, "home");
  const modDirectory = join(home, "mods", modName);
  await assertRuntimeMod(modDirectory, { allowNativeGenerated: true });
  return { id: generationId, modName, root, home, modDirectory, createdAt: marker.createdAt };
}

async function assertRuntimeMod(modDirectory, { allowNativeGenerated = false } = {}) {
  const root = await lstatOrNull(modDirectory);
  if (!root?.isDirectory() || root.isSymbolicLink())
    throw new Error(`packaged mod directory is missing or linked: ${modDirectory}`);
  const pending = [modDirectory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const nativeGenerated = allowNativeGenerated && ["gpui-kit.d.ts", "jsconfig.json"].includes(entry.name);
      if (
        entry.name === "node_modules" ||
        (!nativeGenerated && (entry.name.endsWith(".ts") || entry.name === "jsconfig.json"))
      ) {
        throw new Error(
          `development payload contains source or development dependencies: ${join(current, entry.name)}`,
        );
      }
      const path = join(current, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`development payload must not contain symlinks: ${path}`);
      if (info.isDirectory()) pending.push(path);
      else if (!info.isFile()) throw new Error(`development payload contains unsupported entry: ${path}`);
    }
  }
}

async function resolveAppTarget(appHome, modName) {
  if (typeof appHome !== "string" || appHome.length === 0) throw new TypeError("--app-home PATH is required");
  const home = resolve(appHome);
  const homeInfo = await lstatOrNull(home);
  if (!homeInfo?.isDirectory() || homeInfo.isSymbolicLink())
    throw new Error(`app home must be an existing real directory: ${home}`);
  const modsDirectory = join(home, "mods");
  const modsInfo = await lstatOrNull(modsDirectory);
  if (!modsInfo?.isDirectory() || modsInfo.isSymbolicLink())
    throw new Error(`app home mods/ must be an existing real directory: ${modsDirectory}`);
  return { modsDirectory, target: join(modsDirectory, modName) };
}

async function collectInput(path, relativePath, output) {
  const info = await lstatOrNull(path);
  if (!info) return;
  if (info.isSymbolicLink()) {
    output.push({ relativePath, contents: Buffer.from(`symlink:${await readlink(path)}`) });
    return;
  }
  if (info.isFile()) {
    output.push({ relativePath, contents: await readFile(path) });
    return;
  }
  if (!info.isDirectory() || ignoredDirectories.has(basename(path)) || basename(path).startsWith(".")) return;
  const entries = await readdir(path, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ignoredDirectories.has(entry.name)) continue;
    await collectInput(join(path, entry.name), join(relativePath, entry.name), output);
  }
}

async function delay(milliseconds, signal) {
  if (signal.aborted) return;
  await new Promise((resolveDelay) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolveDelay();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

async function lstatOrNull(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readJsonOrNull(path) {
  const info = await lstatOrNull(path);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`ownership marker must be a regular file: ${path}`);
  return readJson(path);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`invalid development ownership marker ${path}: ${error.message}`, { cause: error });
  }
}

function assertModName(value) {
  if (typeof value !== "string" || !moduleNamePattern.test(value)) throw new Error(`invalid mod name: ${value}`);
}

function assertGenerationId(value) {
  if (typeof value !== "string" || !generatedNamePattern.test(value) || value.startsWith(".")) {
    throw new Error(`invalid generation id: ${value}`);
  }
}

function createGenerationId(modName, date) {
  const stamp = date.toISOString().replace(/[-:.]/g, "").toLowerCase();
  return `${modName}-${stamp}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function isWithin(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function sameLink(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function parseArguments(args) {
  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args.includes("--help")) {
    return { command: "help" };
  }
  const [command, ...rest] = args;
  if (!["build", "link", "activate", "watch", "status", "revert", "unlink"].includes(command)) {
    throw new Error(`unknown command: ${command}`);
  }
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!["--mod", "--app-home", "--generation"].includes(key)) throw new Error(`unknown option: ${key}`);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
    const option = key.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    if (options[option] !== undefined) throw new Error(`${key} may be provided only once`);
    options[option] = value;
    index += 1;
  }
  if (!options.mod) throw new Error(`${command} requires --mod <mod>`);
  if (command !== "build" && !options.appHome) throw new Error(`${command} requires --app-home PATH`);
  if (command === "build" && (options.appHome || options.generation)) throw new Error("build accepts only --mod <mod>");
  if (command !== "revert" && options.generation) throw new Error(`${command} does not accept --generation`);
  if (command === "revert" && !options.generation) throw new Error("revert requires --generation <id>");
  return { command: command === "activate" ? "link" : command, options };
}

export async function runCli(args = process.argv.slice(2), io = process) {
  let parsed;
  try {
    parsed = parseArguments(args);
    if (parsed.command === "help") {
      io.stdout.write(HELP);
      return 0;
    }
    const { command, options } = parsed;
    if (command === "build") {
      const generation = await buildModGeneration(options.mod);
      io.stdout.write(`Built ${options.mod} generation ${generation.id}\n${generation.home}\n`);
      return 0;
    }
    if (command === "link") {
      const generations = await listModGenerations(options.mod);
      const generation = generations.at(-1);
      if (!generation) throw new Error(`no retained generation for ${options.mod}; build it first`);
      await publishModGeneration(options.mod, options.appHome, generation.id);
      io.stdout.write(`Linked ${options.mod} generation ${generation.id}; no layout or key was changed\n`);
      return 0;
    }
    if (command === "status") {
      const [current, generations] = await Promise.all([
        currentModGeneration(options.mod, options.appHome),
        listModGenerations(options.mod),
      ]);
      io.stdout.write(
        `${JSON.stringify({ mod: options.mod, active: current?.id ?? null, retained: generations.map(({ id, createdAt }) => ({ id, createdAt })) }, null, 2)}\n`,
      );
      return 0;
    }
    if (command === "unlink") {
      const removed = await unlinkModGeneration(options.mod, options.appHome);
      io.stdout.write(
        removed ? `Unlinked ${options.mod}; generations were retained\n` : `${options.mod} is not linked\n`,
      );
      return 0;
    }
    if (command === "revert") {
      await revertModGeneration(options.mod, options.appHome, options.generation);
      io.stdout.write(`Reverted ${options.mod} to generation ${options.generation}\n`);
      return 0;
    }
    if (command === "watch") {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      io.stdout.write(`Watching ${options.mod}; press Ctrl-C to stop\n`);
      try {
        await watchModGenerations({ modName: options.mod, appHome: options.appHome, signal: controller.signal });
      } finally {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
      io.stdout.write(`Stopped watching ${options.mod}; retained generations were not removed\n`);
      return 0;
    }
    throw new Error(`unsupported command: ${command}`);
  } catch (error) {
    io.stderr.write(`${error.message}\nRun: node scripts/dev-loop.mjs help\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
