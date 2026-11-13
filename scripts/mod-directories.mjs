import { lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ENTRYPOINT = /^mods\/([^/]+)\/main\.js$/;

export async function listModDirectories(root = ROOT) {
  const absoluteRoot = resolve(root);
  let trackedPaths;
  try {
    trackedPaths = execFileSync("git", ["-C", absoluteRoot, "ls-files", "-z", "--", "mods/*/main.js"], {
      encoding: "buffer",
    });
  } catch {
    throw new Error(`Cannot discover tracked mods in ${absoluteRoot}; run checks from the Herdr Term Git checkout.`);
  }

  const modules = new Set();
  for (const path of trackedPaths.toString("utf8").split("\0")) {
    if (!path) continue;
    const match = ENTRYPOINT.exec(path);
    if (!match) continue;
    const modDirectory = join(absoluteRoot, "mods", match[1]);
    let directoryMetadata;
    try {
      directoryMetadata = await lstat(modDirectory);
    } catch {
      throw new Error(`Tracked mod directory is missing: mods/${match[1]}.`);
    }
    if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
      throw new Error(`Tracked mod directory must be a real directory: mods/${match[1]}.`);
    }
    const entrypoint = join(absoluteRoot, path);
    let metadata;
    try {
      metadata = await lstat(entrypoint);
    } catch {
      throw new Error(`Tracked mod entrypoint is missing: ${path}. Restore the file before running checks.`);
    }
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`Tracked mod entrypoint must be a regular file: ${path}.`);
    }
    modules.add(`mods/${match[1]}`);
  }
  return [...modules].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${(await listModDirectories()).join(" ")}\n`);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
