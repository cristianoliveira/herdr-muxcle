import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const appPackage = {
  name: "herdr-muxcle",
  files: [
    "check-install-targets.sh",
    "docs/INSTALLATION.md",
    "layouts/muxcle.json",
    "mods/muxcle-compat/main.js",
    "mods/muxcle-compat/mod.json",
    "RECIPE.md",
  ],
  directories: ["", "docs", "layouts", "mods", "mods/muxcle-compat"],
  sources: [
    ["scripts/check-install-targets.sh", "check-install-targets.sh"],
    ["docs/INSTALLATION.md", "docs/INSTALLATION.md"],
    ["layouts/muxcle.json", "layouts/muxcle.json"],
    ["mods/muxcle-compat/mod.json", "mods/muxcle-compat/mod.json"],
    [".build/mods/muxcle-compat/main.js", "mods/muxcle-compat/main.js"],
    ["RECIPE.md", "RECIPE.md"],
  ],
};
const tmuxKeysPackage = {
  name: "muxcle-tmux-keys",
  files: ["INSTALLATION.md", "keys.json", "RECIPE.md"],
  directories: [""],
  sources: [
    ["packages/tmux-keys/INSTALLATION.md", "INSTALLATION.md"],
    ["packages/tmux-keys/keys.json", "keys.json"],
    ["packages/tmux-keys/RECIPE.md", "RECIPE.md"],
  ],
};
const sessionizerPackage = {
  name: "muxcle-sessionizer",
  files: [
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
  ],
  directories: ["", "mods", "mods/muxcle-sessionizer", "mods/muxcle-sessionizer/sessionizer"],
  sources: [
    ["packages/sessionizer/check-install-targets.sh", "check-install-targets.sh"],
    ["packages/sessionizer/config.example.json", "config.example.json"],
    ["packages/sessionizer/INSTALLATION.md", "INSTALLATION.md"],
    ["packages/sessionizer/keys.json", "keys.json"],
    ["mods/muxcle-sessionizer/discover.py", "mods/muxcle-sessionizer/discover.py"],
    [".build/mods/muxcle-sessionizer/main.js", "mods/muxcle-sessionizer/main.js"],
    ["mods/muxcle-sessionizer/mod.json", "mods/muxcle-sessionizer/mod.json"],
    ["mods/muxcle-sessionizer/package-owner.json", "mods/muxcle-sessionizer/package-owner.json"],
    [".build/mods/muxcle-sessionizer/sessionizer/adapter.js", "mods/muxcle-sessionizer/sessionizer/adapter.js"],
    [".build/mods/muxcle-sessionizer/sessionizer/controller.js", "mods/muxcle-sessionizer/sessionizer/controller.js"],
    [".build/mods/muxcle-sessionizer/sessionizer/model.js", "mods/muxcle-sessionizer/sessionizer/model.js"],
    ["packages/sessionizer/RECIPE.md", "RECIPE.md"],
  ],
};
const packagesByName = new Map([
  [appPackage.name, appPackage],
  [tmuxKeysPackage.name, tmuxKeysPackage],
  [sessionizerPackage.name, sessionizerPackage],
]);

export async function createPackage(options = {}) {
  return buildPackage(appPackage, options);
}

export async function createTmuxKeysPackage(options = {}) {
  return buildPackage(tmuxKeysPackage, options);
}

export async function createSessionizerPackage(options = {}) {
  return buildPackage(sessionizerPackage, options);
}

export async function createPackages(options = {}) {
  return [
    await createPackage(options),
    await createTmuxKeysPackage(options),
    await createSessionizerPackage(options),
  ];
}

async function buildPackage(definition, {
  repositoryRoot: root = repositoryRoot,
  outputDirectory = join(root, "dist"),
} = {}) {
  const packageMetadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const version = packageMetadata.version;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    throw new Error("package.json must define a stable semantic version");
  }

  const bundleName = `${definition.name}-v${version}`;
  const bundleDirectory = join(outputDirectory, bundleName);
  const archivePath = join(outputDirectory, `${bundleName}.tar.gz`);
  const checksumPath = `${archivePath}.sha256`;
  await mkdir(outputDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(outputDirectory, ".package-"));
  const stagedDirectory = join(temporaryDirectory, bundleName);
  const stagedArchive = join(temporaryDirectory, basename(archivePath));
  const stagedChecksum = `${stagedArchive}.sha256`;
  await mkdir(stagedDirectory, { recursive: true });

  try {
    for (const [source, target] of definition.sources) {
      const targetPath = join(stagedDirectory, target);
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(join(root, source), targetPath);
    }

    const manifest = {
      name: definition.name,
      version,
      testedHerdrAppVersion: "0.1.13",
      files: [...definition.files, "manifest.json"].sort(),
    };
    await writeFile(join(stagedDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await createDeterministicArchive({
      packageDirectory: stagedDirectory,
      archivePath: stagedArchive,
      packageName: definition.name,
    });
    const digest = await sha256(stagedArchive);
    await writeFile(stagedChecksum, `${digest}  ${basename(archivePath)}\n`);
    verifyPackage({ outputDirectory: temporaryDirectory, version, packageName: definition.name });

    await rm(bundleDirectory, { recursive: true, force: true });
    await rm(archivePath, { force: true });
    await rm(checksumPath, { force: true });
    await rename(stagedDirectory, bundleDirectory);
    await rename(stagedArchive, archivePath);
    await rename(stagedChecksum, checksumPath);
    return { name: definition.name, version, bundleDirectory, archivePath, checksumPath };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function createDeterministicArchive({ packageDirectory, archivePath, packageName = appPackage.name }) {
  const definition = getPackageDefinition(packageName);
  const bundleName = basename(packageDirectory);
  await normalizePackageTree(packageDirectory);

  const files = [...definition.files, "manifest.json"].map((path) => `${bundleName}/${path}`);
  const directories = definition.directories.map((path) => path
    ? `${bundleName}/${path}/`
    : `${bundleName}/`);
  const entries = [...files, ...directories].sort();
  const tarVersion = execFileSync("tar", ["--version"], { encoding: "utf8" });
  const ownership = tarVersion.includes("GNU tar")
    ? ["--owner=root:0", "--group=root:0"]
    : ["--uid=0", "--gid=0", "--uname=root", "--gname=root"];

  const tarBytes = execFileSync("tar", [
    "-cf", "-",
    "--format=ustar",
    ...ownership,
    "--no-recursion",
    "-C", dirname(packageDirectory),
    ...entries,
  ]);
  const compressed = execFileSync("gzip", ["-n", "-c"], { input: tarBytes });
  await writeFile(archivePath, compressed);
}

async function normalizePackageTree(directory) {
  const fixedTime = new Date("2000-01-01T00:00:00.000Z");
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await normalizePackageTree(path);
    else if (!entry.isFile()) throw new Error(`unsupported package entry: ${path}`);
    await chmod(path, entry.isDirectory() ? 0o755 : 0o644);
    await utimes(path, fixedTime, fixedTime);
  }
  await chmod(directory, 0o755);
  await utimes(directory, fixedTime, fixedTime);
}

export function verifyPackage({
  outputDirectory = join(repositoryRoot, "dist"),
  version,
  packageName = appPackage.name,
}) {
  if (!version) throw new Error("package version is required");
  const definition = getPackageDefinition(packageName);
  const bundleName = `${definition.name}-v${version}`;
  const archivePath = join(outputDirectory, `${bundleName}.tar.gz`);
  const checksumPath = `${archivePath}.sha256`;
  const entries = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((rawPath) => ({
      path: rawPath.replace(/\/$/, ""),
      directory: rawPath.endsWith("/"),
    }));
  const prefix = `${bundleName}/`;
  const files = entries.filter((entry) => !entry.directory).map((entry) => {
    if (!entry.path.startsWith(prefix)) throw new Error("archive contains an unexpected top-level path");
    return entry.path.slice(prefix.length);
  }).sort();
  const directories = entries.filter((entry) => entry.directory).map((entry) => {
    if (!entry.path.startsWith(bundleName)) throw new Error("archive contains an unexpected directory");
    return entry.path.slice(bundleName.length).replace(/^\//, "");
  }).sort();
  const expectedFiles = [...definition.files, "manifest.json"].sort();
  const expectedDirectories = [...definition.directories].sort();
  const expectedEntries = [
    ...expectedFiles.map((path) => `${bundleName}/${path}`),
    ...expectedDirectories.map((path) => path ? `${bundleName}/${path}/` : `${bundleName}/`),
  ].sort();
  const actualEntries = entries.map((entry) => `${entry.path}${entry.directory ? "/" : ""}`);
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)
    || JSON.stringify(files) !== JSON.stringify(expectedFiles)
    || JSON.stringify(directories) !== JSON.stringify(expectedDirectories)) {
    throw new Error(`unexpected package contents: ${files.join(", ")}`);
  }

  const manifest = JSON.parse(execFileSync("tar", ["-xOf", archivePath, `${bundleName}/manifest.json`], { encoding: "utf8" }));
  if (manifest.name !== definition.name
    || manifest.version !== version
    || JSON.stringify(manifest.files) !== JSON.stringify(expectedFiles)) {
    throw new Error("package manifest does not match the package contents");
  }

  const checksum = readFileSync(checksumPath, "utf8").trim();
  const expectedChecksum = `${sha256Sync(archivePath)}  ${basename(archivePath)}`;
  if (checksum !== expectedChecksum) throw new Error("package checksum does not match the archive");
  return { name: definition.name, version, files };
}

function getPackageDefinition(name) {
  const definition = packagesByName.get(name);
  if (!definition) throw new Error(`unknown package definition: ${name}`);
  return definition;
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256Sync(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const result of await createPackages()) {
    const verified = verifyPackage({ version: result.version, packageName: result.name });
    console.log(`Packaged ${result.archivePath}`);
    console.log(`${verified.files.length - 1} payload files; SHA-256 written to ${result.checksumPath}`);
  }
}
