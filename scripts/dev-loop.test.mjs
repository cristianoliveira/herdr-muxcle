import assert from "node:assert/strict";
import { cp, lstat, mkdtemp, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildModGeneration,
  currentModGeneration,
  inputFingerprint,
  listModGenerations,
  publishModGeneration,
  revertModGeneration,
  runCli,
  unlinkModGeneration,
  watchModGenerations,
} from "./dev-loop.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "muxcle-dev-loop-"));
  const repositoryRoot = join(root, "repo");
  const appHome = join(root, "app-home");
  const modName = "muxcle-probe";
  await mkdir(join(repositoryRoot, "mods", modName), { recursive: true });
  await mkdir(join(repositoryRoot, ".build"), { recursive: true });
  await mkdir(join(appHome, "mods"), { recursive: true });
  await writeFile(join(repositoryRoot, "package.json"), '{"version":"0.1.0"}\n');
  await writeFile(join(repositoryRoot, "mods", modName, "mod.json"), '{"title":"Probe"}\n');
  await writeFile(join(repositoryRoot, "mods", modName, "icon.svg"), "<svg>one</svg>\n");
  return { root, repositoryRoot, appHome, modName };
}

function fakePackageBuilder() {
  return async (modName, { repositoryRoot, outputDirectory }) => {
    const bundleDirectory = join(outputDirectory, "fixture-package");
    const modDirectory = join(bundleDirectory, "mods", modName);
    await mkdir(modDirectory, { recursive: true });
    await cp(join(repositoryRoot, ".build", "mods", modName), modDirectory, { recursive: true });
    await cp(join(repositoryRoot, "mods", modName, "mod.json"), join(modDirectory, "mod.json"));
    await cp(join(repositoryRoot, "mods", modName, "icon.svg"), join(modDirectory, "icon.svg"));
    return { bundleDirectory };
  };
}

function fakeCompiler(contents = "export const value = 1;\n") {
  return async ({ repositoryRoot, modName }) => {
    const output = join(repositoryRoot, ".build", "mods", modName);
    await mkdir(output, { recursive: true });
    await writeFile(join(output, "main.js"), contents);
    await writeFile(join(output, "helper.js"), "export const helper = true;\n");
  };
}

test("CLI help is self-discoverable and rejects options that a command cannot use", async () => {
  const output = { stdout: [], stderr: [] };
  const io = {
    stdout: { write: (value) => output.stdout.push(value) },
    stderr: { write: (value) => output.stderr.push(value) },
  };

  assert.equal(await runCli(["help"], io), 0);
  assert.match(output.stdout.join(""), /node scripts\/dev-loop\.mjs watch/);
  assert.equal(await runCli(["build", "--mod", "muxcle-picker", "--app-home", "/tmp/app"], io), 1);
  assert.equal(
    await runCli(["link", "--mod", "muxcle-picker", "--app-home", "/tmp/app", "--generation", "older"], io),
    1,
  );
  assert.match(output.stderr.join(""), /Run: node scripts\/dev-loop\.mjs help/);
});

test("build emits one immutable app-home-shaped generation with compiled code and runtime metadata/assets", async () => {
  const state = await fixture();
  try {
    const generation = await buildModGeneration(state.modName, {
      repositoryRoot: state.repositoryRoot,
      compile: fakeCompiler(),
      packageBuilder: fakePackageBuilder(),
      generationId: "first",
    });
    const modDirectory = join(generation.home, "mods", state.modName);
    assert.equal(await readFile(join(modDirectory, "main.js"), "utf8"), "export const value = 1;\n");
    assert.equal(await readFile(join(modDirectory, "helper.js"), "utf8"), "export const helper = true;\n");
    assert.equal(await readFile(join(modDirectory, "mod.json"), "utf8"), '{"title":"Probe"}\n');
    assert.equal(await readFile(join(modDirectory, "icon.svg"), "utf8"), "<svg>one</svg>\n");
    assert.deepEqual((await readdir(modDirectory)).sort(), ["helper.js", "icon.svg", "main.js", "mod.json"]);
    assert.equal((await lstat(modDirectory)).isDirectory(), true);
    assert.equal((await lstat(modDirectory)).isSymbolicLink(), false);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("compiler failure discards the partial staging tree and leaves the active generation intact", async () => {
  const state = await fixture();
  try {
    const good = await buildModGeneration(state.modName, {
      repositoryRoot: state.repositoryRoot,
      compile: fakeCompiler("export const value = 'good';\n"),
      packageBuilder: fakePackageBuilder(),
      generationId: "good",
    });
    await publishModGeneration(state.modName, state.appHome, good.id, { repositoryRoot: state.repositoryRoot });
    const before = await readlink(join(state.appHome, "mods", state.modName));

    await assert.rejects(
      buildModGeneration(state.modName, {
        repositoryRoot: state.repositoryRoot,
        compile: async ({ repositoryRoot, modName }) => {
          const partial = join(repositoryRoot, ".build", "mods", modName);
          await mkdir(partial, { recursive: true });
          await writeFile(join(partial, "main.js"), "partial output");
          throw new Error("compiler failed");
        },
        packageBuilder: fakePackageBuilder(),
        generationId: "bad",
      }),
      /compiler failed/,
    );

    assert.equal(await readlink(join(state.appHome, "mods", state.modName)), before);
    assert.equal(await readFile(join(good.modDirectory, "main.js"), "utf8"), "export const value = 'good';\n");
    assert.deepEqual(
      (await readdir(join(state.repositoryRoot, ".build", "dev-generations"))).filter((name) =>
        name.startsWith(".stage-"),
      ),
      [],
    );
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("source renames during a build discard the coherent snapshot instead of publishing mixed files", async () => {
  const state = await fixture();
  try {
    const metadata = join(state.repositoryRoot, "mods", state.modName, "mod.json");
    await assert.rejects(
      buildModGeneration(state.modName, {
        repositoryRoot: state.repositoryRoot,
        compile: async ({ repositoryRoot, modName }) => {
          const output = join(repositoryRoot, ".build", "mods", modName);
          await mkdir(output, { recursive: true });
          await writeFile(join(output, "main.js"), "export const value = 1;\n");
          await rm(metadata);
          await writeFile(join(state.repositoryRoot, "mods", state.modName, "mod-renamed.json"), "{}\n");
        },
        packageBuilder: fakePackageBuilder(),
        generationId: "renamed-midbuild",
      }),
      /source changed during build/,
    );
    assert.deepEqual(await listModGenerations(state.modName, { repositoryRoot: state.repositoryRoot }), []);
    assert.deepEqual(
      (await readdir(join(state.repositoryRoot, ".build", "dev-generations"))).filter((name) =>
        name.startsWith(".stage-"),
      ),
      [],
    );
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("linking refuses existing directories and foreign symlinks without changing either", async () => {
  const state = await fixture();
  const generation = await buildModGeneration(state.modName, {
    repositoryRoot: state.repositoryRoot,
    compile: fakeCompiler(),
    packageBuilder: fakePackageBuilder(),
    generationId: "first",
  });
  const target = join(state.appHome, "mods", state.modName);
  try {
    await mkdir(target);
    await writeFile(join(target, "keep.txt"), "keep\n");
    await assert.rejects(
      publishModGeneration(state.modName, state.appHome, generation.id, { repositoryRoot: state.repositoryRoot }),
      /refusing to replace/,
    );
    assert.equal(await readFile(join(target, "keep.txt"), "utf8"), "keep\n");

    await rm(target, { recursive: true });
    const foreign = join(state.root, "foreign-mod");
    await mkdir(foreign);
    await symlink(foreign, target, "dir");
    await assert.rejects(
      publishModGeneration(state.modName, state.appHome, generation.id, { repositoryRoot: state.repositoryRoot }),
      /not owned by this development loop/,
    );
    await assert.rejects(
      unlinkModGeneration(state.modName, state.appHome, { repositoryRoot: state.repositoryRoot }),
      /not owned by this development loop/,
    );
    assert.equal(await readlink(target), foreign);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("revert and unlink operate only on owned links and retain every generation", async () => {
  const state = await fixture();
  try {
    const first = await buildModGeneration(state.modName, {
      repositoryRoot: state.repositoryRoot,
      compile: fakeCompiler("export const value = 'first';\n"),
      packageBuilder: fakePackageBuilder(),
      generationId: "first",
    });
    const second = await buildModGeneration(state.modName, {
      repositoryRoot: state.repositoryRoot,
      compile: fakeCompiler("export const value = 'second';\n"),
      packageBuilder: fakePackageBuilder(),
      generationId: "second",
    });
    await publishModGeneration(state.modName, state.appHome, second.id, { repositoryRoot: state.repositoryRoot });
    await writeFile(join(second.modDirectory, "gpui-kit.d.ts"), "// generated by Native\n");
    await writeFile(join(second.modDirectory, "jsconfig.json"), '{"compilerOptions":{}}\n');
    assert.equal(
      (await currentModGeneration(state.modName, state.appHome, { repositoryRoot: state.repositoryRoot })).id,
      second.id,
    );
    await publishModGeneration(state.modName, state.appHome, second.id, { repositoryRoot: state.repositoryRoot });

    await revertModGeneration(state.modName, state.appHome, first.id, { repositoryRoot: state.repositoryRoot });
    assert.equal(
      (await currentModGeneration(state.modName, state.appHome, { repositoryRoot: state.repositoryRoot })).id,
      first.id,
    );
    assert.equal(await readFile(join(second.modDirectory, "main.js"), "utf8"), "export const value = 'second';\n");
    assert.equal(await readFile(join(second.modDirectory, "gpui-kit.d.ts"), "utf8"), "// generated by Native\n");
    assert.equal(await readFile(join(second.modDirectory, "jsconfig.json"), "utf8"), '{"compilerOptions":{}}\n');

    await unlinkModGeneration(state.modName, state.appHome, { repositoryRoot: state.repositoryRoot });
    assert.equal(
      await lstat(join(state.appHome, "mods", state.modName)).then(
        () => true,
        () => false,
      ),
      false,
    );
    assert.equal(await readFile(join(first.modDirectory, "main.js"), "utf8"), "export const value = 'first';\n");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("input fingerprint detects content edits and file additions/removals", async () => {
  const state = await fixture();
  try {
    const source = join(state.repositoryRoot, "mods", state.modName, "mod.json");
    const initial = await inputFingerprint(state.repositoryRoot);
    await writeFile(source, '{"title":"Edited"}\n');
    const edited = await inputFingerprint(state.repositoryRoot);
    assert.notEqual(edited, initial);
    await rm(source);
    await writeFile(join(state.repositoryRoot, "mods", state.modName, "mod-renamed.json"), "{}\n");
    assert.notEqual(await inputFingerprint(state.repositoryRoot), edited);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("watch does not publish a generation when stopped during a deferred build", async () => {
  const state = await fixture();
  const controller = new AbortController();
  let startBuild;
  let finishBuild;
  const buildStarted = new Promise((resolve) => {
    startBuild = resolve;
  });
  const buildResult = new Promise((resolve) => {
    finishBuild = resolve;
  });
  let publishCount = 0;
  try {
    const first = await buildModGeneration(state.modName, {
      repositoryRoot: state.repositoryRoot,
      compile: fakeCompiler(),
      packageBuilder: fakePackageBuilder(),
      generationId: "first",
    });
    await publishModGeneration(state.modName, state.appHome, first.id, { repositoryRoot: state.repositoryRoot });

    const fingerprints = ["initial", "changed", "settled"];
    const watch = watchModGenerations({
      modName: state.modName,
      appHome: state.appHome,
      repositoryRoot: state.repositoryRoot,
      signal: controller.signal,
      intervalMs: 0,
      debounceMs: 0,
      getFingerprint: async () => fingerprints.shift() ?? "settled",
      waitForPoll: async () => {},
      buildGeneration: async () => {
        startBuild();
        return buildResult;
      },
      publishGeneration: async () => {
        publishCount += 1;
      },
    });
    await buildStarted;
    controller.abort();
    finishBuild({ id: "stopped-build" });
    await watch;

    assert.equal(publishCount, 0);
  } finally {
    if (!controller.signal.aborted) controller.abort();
    await rm(state.root, { recursive: true, force: true });
  }
});

test("watch publishes successful changes, keeps last-good link after failure, and stops on abort", async () => {
  const state = await fixture();
  const controller = new AbortController();
  try {
    const first = await buildModGeneration(state.modName, {
      repositoryRoot: state.repositoryRoot,
      compile: fakeCompiler("export const value = 'first';\n"),
      packageBuilder: fakePackageBuilder(),
      generationId: "first",
    });
    await publishModGeneration(state.modName, state.appHome, first.id, { repositoryRoot: state.repositoryRoot });

    const fingerprints = ["initial", "change-1", "stable-1", "change-2", "stable-2"];
    let buildNumber = 0;
    let polls = 0;
    const errors = [];
    const watch = watchModGenerations({
      modName: state.modName,
      appHome: state.appHome,
      repositoryRoot: state.repositoryRoot,
      signal: controller.signal,
      intervalMs: 0,
      getFingerprint: async () => fingerprints.shift() ?? "broken",
      waitForPoll: async () => {
        polls += 1;
        if (polls === 5) controller.abort();
      },
      buildGeneration: async () => {
        buildNumber += 1;
        if (buildNumber === 2) throw new Error("compiler failed");
        return { id: `watch-${buildNumber}`, home: `/generation-${buildNumber}` };
      },
      publishGeneration: async (_mod, _home, id) => {
        if (id.startsWith("watch-")) await writeFile(join(state.root, "active-generation"), id);
      },
      onError: (error) => errors.push(error.message),
    });
    await watch;

    assert.equal(await readFile(join(state.root, "active-generation"), "utf8"), "watch-1");
    assert.deepEqual(errors, ["compiler failed"]);
    assert.equal(controller.signal.aborted, true);
  } finally {
    if (!controller.signal.aborted) controller.abort();
    await rm(state.root, { recursive: true, force: true });
  }
});
