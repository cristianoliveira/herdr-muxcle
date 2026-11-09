import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_CATALOG } from "./package.mjs";

const defaultRepositoryUrl = "https://github.com/cristianoliveira/herdr-muxcle";
const scriptPath = fileURLToPath(import.meta.url);

export function createReleasePlan({ version, repositoryUrl = defaultRepositoryUrl }) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    throw new Error("release plan requires a stable X.Y.Z version");
  }
  const repository = normalizeRepositoryUrl(repositoryUrl);
  const tag = `v${version}`;
  const downloads = `${repository}/releases/download/${tag}`;
  const packages = RELEASE_CATALOG.map((entry) => {
    if (!entry.title || !entry.summary || !isSafeGuidePath(entry.installationPath)) {
      throw new Error(`release catalog metadata is incomplete for ${entry.name}`);
    }
    const archiveName = `${entry.name}-v${version}.tar.gz`;
    const checksumName = `${archiveName}.sha256`;
    return {
      ...entry,
      archiveName,
      checksumName,
      archiveUrl: `${downloads}/${archiveName}`,
      checksumUrl: `${downloads}/${checksumName}`,
      installationGuide: `${repository}/blob/${tag}/${entry.installationPath}`,
    };
  });
  return { version, tag, repositoryUrl: repository, packages };
}

export function formatReleaseNotes(plan) {
  const overview = `${plan.repositoryUrl}/blob/${plan.tag}/INSTALLATION.md`;
  const rows = plan.packages.map((entry) => {
    const packageName = `\`${entry.name}\``;
    const guide = `[Install guide](${entry.installationGuide})`;
    const archive = `[Archive](${entry.archiveUrl})`;
    const checksum = `[SHA-256](${entry.checksumUrl})`;
    return `| ${entry.title} (${packageName}) | ${entry.summary} | ${guide} | ${archive} | ${checksum} |`;
  });
  return [
    `# Herdr Muxcle ${plan.tag}`,
    "",
    `Choose only the capabilities you need. The [unified installation overview](${overview}) compares all seven packages. The scaffold is an optional static starter, not an all-in-one bundle. Each package is a separate archive; check its guide for prerequisites and safe installation steps.`,
    "",
    "| Capability | Includes | Install guide | Archive | Checksum |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

export function formatReleaseAssets(plan, outputDirectory = "dist") {
  const prefix = outputDirectory.replace(/\/+$/, "");
  return plan.packages.flatMap(({ archiveName, checksumName }) => [
    `${prefix}/${archiveName}`,
    `${prefix}/${checksumName}`,
  ]);
}

function normalizeRepositoryUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("repository URL must be an HTTPS GitHub repository URL");
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\.git$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(path)
  ) {
    throw new Error("repository URL must be an HTTPS repository URL without credentials, query, or fragment");
  }
  return `${url.origin}${path}`;
}

function isSafeGuidePath(value) {
  return (
    typeof value === "string" &&
    !value.startsWith("/") &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

async function readPackageVersion() {
  const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  return metadata.version;
}

function printHelp() {
  console.log(
    [
      "Usage: node scripts/release-plan.mjs [--version X.Y.Z] [--format notes|assets] [--repository-url URL]",
      "",
      "Examples:",
      "  make release-plan",
      "  node scripts/release-plan.mjs --format notes --version 0.1.0",
      "  node scripts/release-plan.mjs --format assets --version 0.1.0",
      "",
      "Prerequisite: run from a repository checkout with Node.js available.",
      "This local preview does not build, tag, publish, push, or modify files; no GitHub CLI or credentials are used.",
      "For help after an error, run: node scripts/release-plan.mjs --help",
    ].join("\n"),
  );
}

async function runCli(arguments_) {
  const options = { format: "notes", version: undefined, repositoryUrl: undefined };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") return printHelp();
    if (argument === "--version" || argument === "--format" || argument === "--repository-url") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      options[argument.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${argument}`);
  }
  if (options.format !== "notes" && options.format !== "assets") {
    throw new Error(`unsupported format: ${options.format}; choose notes or assets`);
  }
  const version = options.version ?? (await readPackageVersion());
  const repositoryUrl = options.repositoryUrl ?? githubRepositoryUrl() ?? defaultRepositoryUrl;
  const plan = createReleasePlan({ version, repositoryUrl });
  const output = options.format === "assets" ? formatReleaseAssets(plan).join("\n") : formatReleaseNotes(plan);
  console.log(output);
}

function githubRepositoryUrl() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) return undefined;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must use owner/repository form");
  }
  return `https://github.com/${repository}`;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`${error.message}\nRun node scripts/release-plan.mjs --help for usage.`);
    process.exitCode = 1;
  });
}
