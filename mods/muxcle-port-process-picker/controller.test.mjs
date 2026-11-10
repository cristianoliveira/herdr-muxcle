import assert from "node:assert/strict";
import test from "node:test";
import { PortProcessPickerController } from "../../.build/mods/muxcle-port-process-picker/controller.js";

const context = { kind: "local", context: { space: "local", tab: "tab", pane: "pane", terminal: "t1" } };
const process = { pid: 210, uid: 501, command: "node api.js", startedAt: "Tue Nov 10 10:11:12 2026", ports: [3000] };
const inventory = { processes: [process], warnings: [] };

function adapter(overrides = {}) {
  const calls = [];
  return {
    calls,
    context: () => context,
    scan: async () => {
      calls.push("scan");
      return inventory;
    },
    signal: async (kind, targets) => {
      calls.push(["signal", kind, targets]);
      return { kind: "completed", signal: kind, results: [{ pid: 210, status: "sent", signal: kind }] };
    },
    ...overrides,
  };
}

test("does not scan on construction and refuses remote or unknown context before inventory", async () => {
  const api = adapter({ context: () => ({ kind: "unavailable", message: "local only" }) });
  const controller = new PortProcessPickerController(api);

  assert.deepEqual(api.calls, []);
  assert.deepEqual(await controller.scan(), { kind: "unavailable", message: "local only" });
  assert.deepEqual(api.calls, []);
});

test("scans only on demand and captures the local context that must remain unchanged", async () => {
  const api = adapter();
  const controller = new PortProcessPickerController(api);

  assert.deepEqual(await controller.scan(), { kind: "ready", count: 1, warnings: 0 });
  assert.deepEqual(api.calls, ["scan"]);
  assert.equal(controller.model.selectedPids.size, 0);
  assert.equal(controller.toggle(210), true);
});

test("a failed or refused rescan clears the prior inventory and selections", async () => {
  let scanCount = 0;
  const api = adapter({
    scan: async () => {
      scanCount += 1;
      if (scanCount > 1) throw new Error("inventory unavailable");
      return inventory;
    },
  });
  const controller = new PortProcessPickerController(api);
  await controller.scan();
  controller.toggle(210);

  assert.equal((await controller.scan()).kind, "unavailable");
  assert.deepEqual(controller.model.processes, []);
  assert.equal(controller.model.selectedPids.size, 0);
});

test("context changes before signal prevent any target action", async () => {
  let current = context;
  const api = adapter({ context: () => current });
  const controller = new PortProcessPickerController(api);
  await controller.scan();
  controller.toggle(210);
  controller.review();
  current = { kind: "unavailable", message: "remote focus" };

  const result = await controller.signal("TERM");
  assert.equal(result.kind, "changed");
  assert.match(result.message, /context/i);
  assert.ok(!api.calls.some((call) => Array.isArray(call) && call[0] === "signal"));
  assert.equal(controller.model.phase, "complete");
});

test("cancelled inventory results are discarded and never produce signal requests", async () => {
  let resolveInventory;
  const api = adapter({
    scan: () =>
      new Promise((resolve) => {
        resolveInventory = resolve;
      }),
  });
  const controller = new PortProcessPickerController(api);
  const pending = controller.scan();
  assert.equal(controller.busy, true);
  assert.equal(controller.cancel(), true);
  resolveInventory(inventory);

  assert.deepEqual(await pending, { kind: "cancelled" });
  assert.equal(controller.model.phase, "cancelled");
  assert.ok(!api.calls.some((call) => Array.isArray(call) && call[0] === "signal"));
});

test("force signaling requires its own review and always uses the exact frozen unique selection", async () => {
  const api = adapter();
  const controller = new PortProcessPickerController(api);
  await controller.scan();
  controller.toggle(210);
  assert.equal(controller.review(), true);
  assert.equal(controller.model.startSignal("KILL"), null);
  assert.equal(controller.forceReview(), true);
  const expected = controller.model.reviewSnapshot;
  assert.deepEqual(await controller.signal("KILL"), {
    kind: "completed",
    outcome: { kind: "completed", signal: "KILL", results: [{ pid: 210, status: "sent", signal: "KILL" }] },
  });
  assert.deepEqual(
    api.calls.find((call) => Array.isArray(call) && call[0] === "signal"),
    ["signal", "KILL", expected],
  );
});

test("signal exceptions become an unknown terminal outcome and cannot be retried", async () => {
  let signalCalls = 0;
  const api = adapter({
    signal: async () => {
      signalCalls += 1;
      throw new Error("timeout after dispatch");
    },
  });
  const controller = new PortProcessPickerController(api);
  await controller.scan();
  controller.toggle(210);
  controller.review();

  const result = await controller.signal("TERM");

  assert.equal(result.kind, "unknown");
  assert.equal(controller.model.phase, "complete");
  assert.deepEqual(await controller.signal("TERM"), { kind: "ignored" });
  assert.equal(signalCalls, 1);
});
