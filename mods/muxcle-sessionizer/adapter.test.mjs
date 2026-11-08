import assert from "node:assert/strict";
import test from "node:test";
import { createSessionizerAdapter } from "../../.build/mods/muxcle-sessionizer/sessionizer/adapter.js";

function createApi(overrides = {}) {
  const calls = { reads: [], execs: [], commands: [], closed: [] };
  const api = {
    readTextFile: async (path) => {
      calls.reads.push(path);
      return null;
    },
    exec: async (command, args, options) => {
      calls.execs.push({ command, args, options });
      return { code: 0, stdout: '{"projects":[],"warnings":[],"truncated":false}', stderr: "" };
    },
    spaces: () => [],
    home: () => "/users/tester",
    run: (name, args) => {
      calls.commands.push({ name, args });
      return null;
    },
    closeOverlay: (id) => {
      calls.closed.push(id);
      return null;
    },
    ...overrides,
  };
  return { api, calls };
}

test("native adapter reads only the explicit config and launches Python with argv", async () => {
  const { api, calls } = createApi();
  const adapter = createSessionizerAdapter(api, "/app/data/muxcle-sessionizer/config.json", "/app/mods/muxcle-sessionizer", "overlay-1");
  const roots = ["/workspaces/with spaces; echo unsafe"];

  await adapter.readConfig();
  await adapter.discover(roots);

  assert.deepEqual(calls.reads, ["/app/data/muxcle-sessionizer/config.json"]);
  assert.deepEqual(calls.execs, [{
    command: "python3",
    args: ["-B", "discover.py", "discover", JSON.stringify(roots)],
    options: { cwd: "/app/mods/muxcle-sessionizer" },
  }]);
});

test("space lookup sends local paths only and maps empty local folders to home", async () => {
  const { api, calls } = createApi({
    exec: async (command, args, options) => {
      calls.execs.push({ command, args, options });
      return { code: 0, stdout: '{"spaceId":null}', stderr: "" };
    },
  });
  const adapter = createSessionizerAdapter(api, "/config.json", "/mods/sessionizer");

  await adapter.findLocalSpace("/work/app", [
    { id: "remote", folder: "/work/app", machine: "build", active: true },
    { id: "local-home", folder: "", machine: null, active: false },
  ]);

  const payload = JSON.parse(calls.execs[0].args[3]);
  assert.deepEqual(payload, {
    folder: "/work/app",
    spaces: [{ id: "local-home", folder: "/users/tester", active: false }],
  });
});

test("space actions use only native space commands and close the requested overlay", () => {
  const { api, calls } = createApi();
  const adapter = createSessionizerAdapter(api, "/config.json", "/mods/sessionizer", "overlay-2");

  adapter.selectSpace("local-7");
  adapter.createLocalSpace("/work/canonical-project");
  adapter.close();

  assert.deepEqual(calls.commands, [
    { name: "space.select", args: { id: "local-7" } },
    { name: "space.new", args: { folder: "/work/canonical-project", machine: "" } },
  ]);
  assert.deepEqual(calls.closed, ["overlay-2"]);
});

test("helper failures, oversized output, and oversized arguments fail closed", async () => {
  const failing = createApi({
    exec: async () => ({ code: 1, stdout: "", stderr: "private traceback" }),
  });
  const adapter = createSessionizerAdapter(failing.api, "/config.json", "/mods/sessionizer");
  await assert.rejects(adapter.discover(["/work"]), (error) => {
    assert.match(error.message, /Project discovery failed/);
    assert.doesNotMatch(error.message, /private traceback/);
    return true;
  });

  const tooMuchOutput = createApi({
    exec: async () => ({ code: 0, stdout: "x".repeat(512 * 1024 + 1), stderr: "" }),
  });
  const outputAdapter = createSessionizerAdapter(tooMuchOutput.api, "/config.json", "/mods/sessionizer");
  await assert.rejects(outputAdapter.discover(["/work"]), /too much data/);

  const largePayload = createApi();
  const inputAdapter = createSessionizerAdapter(largePayload.api, "/config.json", "/mods/sessionizer");
  await assert.rejects(inputAdapter.discover(["/" + "x".repeat(96 * 1024)]), /too large/);
  assert.deepEqual(largePayload.calls.execs, []);
});

test("an absent overlay id is not sent to closeOverlay", () => {
  const { api, calls } = createApi();
  const adapter = createSessionizerAdapter(api, "/config.json", "/mods/sessionizer");
  adapter.close();
  assert.deepEqual(calls.closed, []);
});
