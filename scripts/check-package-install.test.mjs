import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const packageVersion = "0.2.0";
// Child PATHs use these absolute links and an owned fake/sentinel; keep herdr-app out.
const safeToolNames = ["cat", "cmp", "cp", "gzip", "mkdir", "mktemp", "node", "python3", "rm", "sh", "tar"];

const checkedPackages = [
  ["herdr-muxcle", "muxcle-compat"],
  ["muxcle-sessionizer", "muxcle-sessionizer"],
  ["muxcle-picker", "muxcle-picker"],
  ["muxcle-history", "muxcle-history"],
  ["muxcle-agent-intray", "muxcle-agent-intray"],
  ["muxcle-rotation", "muxcle-rotation"],
  ["muxcle-sizing", "muxcle-sizing"],
  ["muxcle-repeat", "muxcle-repeat"],
  ["muxcle-project-popup", "muxcle-project-popup"],
  ["muxcle-copy-mode", "muxcle-copy-mode"],
  ["muxcle-tab-tools", "muxcle-tab-tools"],
  ["muxcle-funzzy-status", "muxcle-funzzy-status"],
  ["muxcle-numbered-sidebars", "muxcle-numbered-sidebars"],
  ["muxcle-workspace-chrome", "muxcle-workspace-chrome"],
];

const fakeHerdrApp = `#!/bin/sh
set -eu
: "\${HC_SESSION:?HC_SESSION must be explicitly set for every check}"
[ "$HC_SESSION" != "caller-default-session" ] || { echo 'inherited HC_SESSION was not isolated' >&2; exit 91; }
case "$HERDR_APP_HOME" in
  "$TMPDIR"/*) ;;
  *) echo "app home is not private: $HERDR_APP_HOME" >&2; exit 92 ;;
esac
test -d "$HERDR_APP_HOME"
test "$#" -eq 2
test "$1" = check
target=$2
case "$target" in
  "$HERDR_APP_HOME"/mods/*) test -d "$target" ;;
  *) test -f "$target" ;;
esac
printf '%s\\t%s\\t%s\\n' "$HC_SESSION" "$HERDR_APP_HOME" "$target" >> "$TRACE_FILE"
case "$target" in
  *muxcle-agent-intray) printf '%s\\n' '{"intray.state":"keep","muxcle-agent-intray.state.v1":{"schema":1}}' > "$HERDR_APP_HOME/shared.json" ;;
esac
if [ -n "$FAKE_FAIL_TARGET" ]; then
  case "$target" in *"$FAKE_FAIL_TARGET"*) exit 17 ;; esac
fi
`;

const fallbackHerdrApp = `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$SENTINEL_TRACE_FILE"
exit 98
`;

test("all package install checks use private homes and fresh sessions", async (context) => {
  const fixture = await createFixture(context);
  for (const [bundleName, modName] of checkedPackages) {
    await createBundle(fixture, bundleName, modName);
  }

  const result = runInstallCheck(fixture);

  assert.equal(result.status, 0, result.stderr);
  const calls = await readCalls(fixture.traceFile);
  assert.equal(calls.length, 23);
  assert.ok(calls.every(({ session }) => session && session !== "caller-default-session"));
  assert.ok(calls.every(({ home }) => home.startsWith(`${fixture.root}${sep}`)));
  assert.equal(new Set(calls.map(({ session }) => session)).size, calls.length);
  for (const [, modName] of checkedPackages) {
    assert.ok(
      calls.some(({ target }) => target.includes(modName)),
      `missing initial check for ${modName}`,
    );
  }
});

test("package install check rejects a different owned executable without launching it", async (context) => {
  const fixture = await createFixture(context);
  await createBundle(fixture, "herdr-muxcle", "muxcle-compat");

  await assertGuardRejects(fixture, fixture.wrongPathValue);
});

test("package install check rejects a missing fake before the owned fallback", async (context) => {
  const fixture = await createFixture(context);
  await createBundle(fixture, "herdr-muxcle", "muxcle-compat");

  await assertGuardRejects(fixture, fixture.fallbackPathValue);
});

test("package install check rejects a non-executable fake before the owned fallback", async (context) => {
  const fixture = await createFixture(context);
  await createBundle(fixture, "herdr-muxcle", "muxcle-compat");

  await assertGuardRejects(fixture, fixture.nonExecutablePathValue);
});

test("package install check stops when an isolated mod check fails", async (context) => {
  const fixture = await createFixture(context);
  for (const [bundleName, modName] of checkedPackages) {
    await createBundle(fixture, bundleName, modName);
  }

  const result = runInstallCheck(fixture, {
    HC_SESSION: "caller-default-session",
    FAKE_FAIL_TARGET: "muxcle-picker",
  });

  assert.equal(result.status, 17, result.stderr);
  const calls = await readCalls(fixture.traceFile);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(({ session }) => session !== "caller-default-session"));
  assert.equal(new Set(calls.map(({ session }) => session)).size, calls.length);
});

async function createFixture(context) {
  const root = await mkdtemp(join(tmpdir(), "muxcle-package-install-check-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const distDirectory = join(root, "dist");
  const binDirectory = join(root, "bin");
  const safeToolDirectory = join(root, "safe-tools");
  const fallbackDirectory = join(root, "fallback");
  const wrongDirectory = join(root, "wrong-executable");
  const nonExecutableDirectory = join(root, "non-executable");
  const scriptsPath = join(root, "scripts");
  const traceFile = join(root, "herdr-app-calls.tsv");
  const helperTraceFile = join(root, "install-helper-calls.txt");
  const sentinelTraceFile = join(root, "fallback-herdr-app-calls.txt");
  await Promise.all(
    [
      distDirectory,
      binDirectory,
      safeToolDirectory,
      fallbackDirectory,
      wrongDirectory,
      nonExecutableDirectory,
      scriptsPath,
    ].map((directory) => mkdir(directory)),
  );

  for (const toolName of safeToolNames) {
    await symlink(resolveExecutable(toolName), join(safeToolDirectory, toolName));
  }

  const fakePath = join(binDirectory, "herdr-app");
  const fallbackPath = join(fallbackDirectory, "herdr-app");
  const wrongPath = join(wrongDirectory, "herdr-app");
  const nonExecutablePath = join(nonExecutableDirectory, "herdr-app");
  await writeFile(join(root, "package.json"), JSON.stringify({ version: packageVersion }));
  await writeFile(fakePath, fakeHerdrApp);
  await writeFile(fallbackPath, fallbackHerdrApp);
  await writeFile(wrongPath, fallbackHerdrApp);
  await writeFile(nonExecutablePath, "#!/bin/sh\nexit 0\n");
  await chmod(fakePath, 0o755);
  await chmod(fallbackPath, 0o755);
  await chmod(wrongPath, 0o755);
  await chmod(nonExecutablePath, 0o644);

  for (const scriptName of [
    "check-package-install.sh",
    "check-numbered-sidebars-load.sh",
    "check-workspace-chrome-load.sh",
  ]) {
    await copyFile(join(scriptsDirectory, scriptName), join(scriptsPath, scriptName));
  }

  const safePath = safeToolDirectory;
  return {
    root,
    distDirectory,
    fakePath,
    fakePathValue: `${binDirectory}${delimiter}${safePath}`,
    fallbackPathValue: `${fallbackDirectory}${delimiter}${safePath}`,
    wrongPathValue: `${wrongDirectory}${delimiter}${safePath}`,
    nonExecutablePathValue: `${nonExecutableDirectory}${delimiter}${fallbackDirectory}${delimiter}${safePath}`,
    tarPath: join(safeToolDirectory, "tar"),
    shellPath: join(safeToolDirectory, "sh"),
    traceFile,
    helperTraceFile,
    sentinelTraceFile,
  };
}

function resolveExecutable(name) {
  if (name === "herdr-app") throw new Error("herdr-app cannot be part of the safe test toolchain");
  if (name === "node") return realpathSync(process.execPath);

  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return realpathSync(candidate);
    } catch {}
  }

  throw new Error(`Required safe test executable not found: ${name}`);
}

async function createBundle(fixture, bundleName, modName) {
  const distDirectory = fixture.distDirectory;
  const bundleDirectory = join(distDirectory, `${bundleName}-v${packageVersion}`);
  const modDirectory = join(bundleDirectory, "mods", modName);
  await mkdir(modDirectory, { recursive: true });
  await writeFile(
    join(bundleDirectory, "check-install-targets.sh"),
    '#!/bin/sh\nset -eu\nprintf \'%s\\n\' "$*" >> "$HELPER_TRACE_FILE"\n',
  );
  await chmod(join(bundleDirectory, "check-install-targets.sh"), 0o755);
  await writeFile(join(modDirectory, "main.js"), "export default class CheckFixture {}\n");
  await writeFile(join(modDirectory, "model.js"), "export const checkFixture = true;\n");

  if (bundleName === "herdr-muxcle") {
    await mkdir(join(bundleDirectory, "layouts"), { recursive: true });
    await writeFile(join(bundleDirectory, "layouts", "muxcle.json"), "{}\n");
  }

  const archivePath = join(distDirectory, `${bundleName}-v${packageVersion}.tar.gz`);
  execFileSync(fixture.tarPath, ["-czf", archivePath, "-C", distDirectory, `${bundleName}-v${packageVersion}`]);
  await rm(bundleDirectory, { recursive: true, force: true });
}

function runInstallCheck(fixture, extraEnvironment = {}) {
  const env = {
    PATH: fixture.fakePathValue,
    TMPDIR: fixture.root,
    TRACE_FILE: fixture.traceFile,
    HELPER_TRACE_FILE: fixture.helperTraceFile,
    SENTINEL_TRACE_FILE: fixture.sentinelTraceFile,
    HERDR_APP_HOME: "/inherited-default-app-home",
    HC_SESSION: "caller-default-session",
    FAKE_FAIL_TARGET: "",
    ...extraEnvironment,
  };
  const resolvedApp = spawnSync(fixture.shellPath, ["-c", "command -v herdr-app"], {
    cwd: fixture.root,
    encoding: "utf8",
    env,
  });
  assert.equal(resolvedApp.status, 0, resolvedApp.stderr);
  assert.equal(realpathSync(resolvedApp.stdout.trim()), realpathSync(fixture.fakePath));

  return spawnSync(fixture.shellPath, ["./scripts/check-package-install.sh"], {
    cwd: fixture.root,
    encoding: "utf8",
    env,
  });
}

async function assertGuardRejects(fixture, path) {
  let failure;
  try {
    runInstallCheck(fixture, { PATH: path });
  } catch (error) {
    failure = error;
  }

  assert.deepEqual(await readCalls(fixture.traceFile), []);
  assert.deepEqual(await readTraceLines(fixture.helperTraceFile), []);
  assert.deepEqual(await readSentinelCalls(fixture.sentinelTraceFile), []);
  assert.ok(failure, "unsafe herdr-app resolution must fail before launching the package check");
}

async function readSentinelCalls(traceFile) {
  return readTraceLines(traceFile);
}

async function readTraceLines(traceFile) {
  try {
    return (await readFile(traceFile, "utf8")).trim().split("\n").filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readCalls(traceFile) {
  try {
    const output = await readFile(traceFile, "utf8");
    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [session, home, target] = line.split("\t");
        return { session, home, target };
      });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
