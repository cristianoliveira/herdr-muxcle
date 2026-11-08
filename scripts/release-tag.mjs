import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function assertReleaseTag(tag, version) {
  const expected = `v${version}`;
  if (tag !== expected) {
    throw new Error(`release tag ${tag ?? "(missing)"} must match package version: ${expected}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2];
  const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assertReleaseTag(tag, version);
  console.log(`Release tag ${tag} matches package version ${version}`);
}
