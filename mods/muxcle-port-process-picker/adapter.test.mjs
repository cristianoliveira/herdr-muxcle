import assert from "node:assert/strict";
import test from "node:test";
import {
  createPortProcessPickerAdapter,
  parseSignalOutcome,
} from "../../.build/mods/muxcle-port-process-picker/adapter.js";

const process = { pid: 210, uid: 501, command: "node api.js", startedAt: "Tue Nov 10 10:11:12 2026", ports: [3000] };
const context = { space: "local", tab: "tab", pane: "pane", terminal: "t1", agent: null };
const inventoryReply = JSON.stringify({ schema: 1, processes: [process], warnings: [] });
const successfulSignal = (signal = "TERM") =>
  JSON.stringify({
    schema: 1,
    signal,
    results: [{ pid: 210, status: "sent", signal }],
  });

function api(overrides = {}) {
  const calls = [];
  return {
    calls,
    appHome: () => "/home/agent's $(touch NEVER)",
    focused: () => ({ ...context, shown: null }),
    spaces: () => [{ id: "local", machine: null, active: true, tabs: [{ id: "tab", active: true }] }],
    panes: () => [{ ...context, zoomed: false }],
    layout: () => ({ id: "root", type: "block", content: { tab: "active" } }),
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      return { code: 0, stdout: inventoryReply, stderr: "" };
    },
    ...overrides,
  };
}

test("adapter construction reads no OS inventory and remote focus yields a local-context refusal", () => {
  const native = api({ focused: () => ({ ...context, terminal: "server/t1", shown: null }) });
  const adapter = createPortProcessPickerAdapter(native);

  assert.deepEqual(native.calls, []);
  assert.equal(adapter.context().kind, "unavailable");
  assert.deepEqual(native.calls, []);
});

test("global agent selection does not override a visible local tab", () => {
  const native = api({ focused: () => ({ ...context, shown: null, agent: "server/t9" }) });
  const adapter = createPortProcessPickerAdapter(native);

  assert.equal(adapter.context().kind, "local");
  assert.deepEqual(native.calls, []);
});

test("visible focused or static agent bodies are refused before a helper can run", () => {
  for (const overrides of [
    {
      focused: () => ({ ...context, shown: null, agent: "server/t9" }),
      layout: () => ({ id: "root", type: "block", content: { agent: "focused" } }),
    },
    { layout: () => ({ id: "root", type: "block", content: { agent: "remote/agent" } }) },
  ]) {
    const native = api(overrides);
    const adapter = createPortProcessPickerAdapter(native);

    assert.equal(adapter.context().kind, "unavailable");
    assert.deepEqual(native.calls, []);
  }
});

test("inventory runs only the isolated packaged helper from a trusted non-project cwd", async () => {
  const native = api();
  const adapter = createPortProcessPickerAdapter(native);

  const result = await adapter.scan();

  assert.deepEqual(result.processes, [process]);
  assert.deepEqual(native.calls, [
    {
      command: "python3",
      args: ["-I", "-S", "/home/agent's $(touch NEVER)/mods/muxcle-port-process-picker/port_processes.py", "list"],
      options: { cwd: "/", on: null, timeout: 15_000 },
    },
  ]);
});

test("signal sends only the reviewed identity set and validates exact helper results", async () => {
  const native = api({
    exec: async (command, args, options) => {
      native.calls.push({ command, args, options });
      return { code: 0, stdout: successfulSignal("KILL"), stderr: "" };
    },
  });
  const adapter = createPortProcessPickerAdapter(native);

  assert.deepEqual(await adapter.signal("KILL", [process]), {
    kind: "completed",
    signal: "KILL",
    results: [{ pid: 210, status: "sent" }],
  });
  const call = native.calls[0];
  assert.equal(call.command, "python3");
  assert.equal(call.args[3], "signal");
  assert.equal(call.args[call.args.indexOf("--kind") + 1], "KILL");
  assert.deepEqual(JSON.parse(call.args[call.args.indexOf("--review-json") + 1]), [process]);
  assert.deepEqual(call.options, { cwd: "/", on: null, timeout: 30_000 });
});

test("helper failures and malformed or partial results fail closed", async () => {
  const failed = createPortProcessPickerAdapter(
    api({
      exec: async () => ({ code: 2, stdout: "", stderr: "permission denied" }),
    }),
  );
  await assert.rejects(failed.scan(), /permission denied/i);

  assert.throws(() => parseSignalOutcome("not json", "TERM", [process]), /invalid JSON/i);
  assert.throws(() => parseSignalOutcome(successfulSignal("KILL"), "TERM", [process]), /unsupported response/i);
  assert.throws(
    () => parseSignalOutcome(JSON.stringify({ schema: 1, signal: "TERM", results: [] }), "TERM", [process]),
    /incomplete/i,
  );
  assert.throws(
    () =>
      parseSignalOutcome(
        JSON.stringify({
          schema: 1,
          signal: "TERM",
          results: [{ pid: 210, status: "sent", signal: "KILL" }],
        }),
        "TERM",
        [process],
      ),
    /mismatched/i,
  );
});

test("invalid app home never starts a helper", async () => {
  const native = api({ appHome: () => "relative/home" });
  const adapter = createPortProcessPickerAdapter(native);

  await assert.rejects(adapter.scan(), /absolute app-home/i);
  assert.deepEqual(native.calls, []);
});
