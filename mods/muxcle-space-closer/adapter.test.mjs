import assert from "node:assert/strict";
import test from "node:test";
import { createSpaceCloserAdapter } from "../../.build/mods/muxcle-space-closer/adapter.js";

const space = {
  id: "cloud/space-1",
  index: 1,
  name: "Cloud work",
  named: true,
  folder: "/srv/work",
  machine: "cloud",
  branch: null,
  active: false,
  status: null,
  tabs: [
    {
      id: "cloud/tab-1",
      index: 1,
      name: "Shell",
      named: false,
      active: true,
      status: null,
      panes: 2,
      zoomed: false,
      settled: false,
      settled_at: null,
      changed_at: null,
      working_since: null,
    },
  ],
};
const layoutState = [
  { name: null, layout: "ready" },
  { name: "cloud", layout: "ready" },
];
const validOutput = JSON.stringify({
  machines: [
    { id: "core-cloud-1", name: "cloud", state: "connected", temporary: false },
    { id: "core-lab-2", name: "lab", state: "connected", temporary: true },
  ],
});

function api(overrides = {}) {
  const calls = { hc: [], run: [] };
  const native = {
    spaces: () => [space],
    machines: () => layoutState,
    hc: async (args) => {
      calls.hc.push(args);
      return { code: 0, stdout: validOutput, stderr: "" };
    },
    run: (name, args) => calls.run.push({ name, args }),
    ...overrides,
  };
  return { adapter: createSpaceCloserAdapter(native), calls, native };
}

test("reads native snapshots and captures permanent peer identities through native hc", async () => {
  const { adapter, calls } = api();
  assert.deepEqual(adapter.spaces(), [space]);
  assert.deepEqual(adapter.machines(), layoutState);
  assert.deepEqual(await adapter.coreMachines(), [
    { id: "core-cloud-1", name: "cloud", state: "connected", temporary: false },
    { id: "core-lab-2", name: "lab", state: "connected", temporary: true },
  ]);
  assert.deepEqual(calls.hc, [["machine", "ls", "--json"]]);
});

test("dispatches only exact native space.close IDs with explicit confirmation", () => {
  const { adapter, calls } = api();
  adapter.closeSpace("cloud/space-1");
  assert.deepEqual(calls.run, [{ name: "space.close", args: { id: "cloud/space-1", confirmed: true } }]);
  assert.deepEqual(calls.hc, []);
});

test("machine metadata errors and malformed identity records fail closed without leaking stderr", async () => {
  for (const result of [
    { code: 1, stdout: "", stderr: "private connection detail" },
    { code: 0, stdout: "not JSON", stderr: "" },
    { code: 0, stdout: '{"machines":[{"name":"cloud","state":"connected"}]}', stderr: "" },
    {
      code: 0,
      stdout:
        '{"machines":[{"id":"x","name":"cloud","state":"connected"},{"id":"y","name":"cloud","state":"connected"}]}',
      stderr: "",
    },
  ]) {
    const { adapter, calls, native } = api();
    native.hc = async (args) => {
      calls.hc.push(args);
      return result;
    };
    await assert.rejects(adapter.coreMachines(), (error) => {
      assert.match(error.message, /machine identity|machine list/i);
      assert.doesNotMatch(error.message, /private connection detail/);
      return true;
    });
    assert.deepEqual(calls.run, []);
  }
});

test("rejects oversized machine-list output before parsing", async () => {
  const { adapter, calls, native } = api();
  native.hc = async (args) => {
    calls.hc.push(args);
    return { code: 0, stdout: " ".repeat(1_048_577), stderr: "" };
  };
  await assert.rejects(adapter.coreMachines(), /too large/);
  assert.deepEqual(calls.run, []);
});
