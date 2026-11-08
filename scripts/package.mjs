import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const packagedFiles = [
  "layouts/muxcle.json",
  "mods/muxcle-compat/main.js",
  "mods/muxcle-compat/mod.json",
  "RECIPE.md",
];
const packageDirectories = ["", "layouts", "mods", "mods/muxcle-compat"];

export async function createPackage({
  repositoryRoot: root = repositoryRoot,
  outputDirectory = join(root, "dist"),
} = {}) {
  const packageMetadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const version = packageMetadata.version;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    throw new Error("package.json must define a stable semantic version");
  }

  const bundleName = `herdr-muxcle-v${version}`;
  const bundleDirectory = join(outputDirectory, bundleName);
  const archivePath = join(outputDirectory, `${bundleName}.tar.gz`);
  const checksumPath = `${archivePath}.sha256`;
  await mkdir(outputDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(outputDirectory, ".package-"));
  const stagedDirectory = join(temporaryDirectory, bundleName);
  const stagedArchive = join(temporaryDirectory, basename(archivePath));
  const stagedChecksum = `${stagedArchive}.sha256`;
  await mkdir(join(stagedDirectory, "layouts"), { recursive: true });
  await mkdir(join(stagedDirectory, "mods/muxcle-compat"), { recursive: true });

  try {
    await copyFile(join(root, "layouts/muxcle.json"), join(stagedDirectory, "layouts/muxcle.json"));
    await copyFile(join(root, "mods/muxcle-compat/mod.json"), join(stagedDirectory, "mods/muxcle-compat/mod.json"));
    await copyFile(join(root, ".build/mods/muxcle-compat/main.js"), join(stagedDirectory, "mods/muxcle-compat/main.js"));
    await copyFile(join(root, "RECIPE.md"), join(stagedDirectory, "RECIPE.md"));

    const manifest = {
      name: "herdr-muxcle",
      version,
      testedHerdrAppVersion: "0.1.13",
      files: [...packagedFiles, "manifest.json"].sort(),
    };
    await writeFile(join(stagedDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    execFileSync("tar", ["-czf", stagedArchive, "-C", temporaryDirectory, bundleName]);
    const digest = await sha256(stagedArchive);
    await writeFile(stagedChecksum, `${digest}  ${basename(archivePath)}\n`);
    verifyPackage({ outputDirectory: temporaryDirectory, version });

    await rm(bundleDirectory, { recursive: true, force: true });
    await rm(archivePath, { force: true });
    await rm(checksumPath, { force: true });
    await rename(stagedDirectory, bundleDirectory);
    await rename(stagedArchive, archivePath);
    await rename(stagedChecksum, checksumPath);
    return { version, bundleDirectory, archivePath, checksumPath };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function verifyPackage({ outputDirectory = join(repositoryRoot, "dist"), version }) {
  if (!version) throw new Error("package version is required");

  const bundleName = `herdr-muxcle-v${version}`;
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
  const expectedFiles = [...packagedFiles, "manifest.json"].sort();
  const expectedDirectories = [...packageDirectories].sort();
  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)
    || JSON.stringify(directories) !== JSON.stringify(expectedDirectories)) {
    throw new Error(`unexpected package contents: ${files.join(", ")}`);
  }

  const manifest = JSON.parse(execFileSync("tar", ["-xOf", archivePath, `${bundleName}/manifest.json`], { encoding: "utf8" }));
  if (manifest.version !== version || JSON.stringify(manifest.files) !== JSON.stringify(expectedFiles)) {
    throw new Error("package manifest does not match the package contents");
  }

  const checksum = readFileSync(checksumPath, "utf8").trim();
  const expectedChecksum = `${sha256Sync(archivePath)}  ${basename(archivePath)}`;
  if (checksum !== expectedChecksum) throw new Error("package checksum does not match the archive");
  return { version, files };
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
  const result = await createPackage();
  const verified = verifyPackage({ version: result.version });
  console.log(`Packaged ${result.archivePath}`);
  console.log(`${verified.files.length} payload files; SHA-256 written to ${result.checksumPath}`);
}
