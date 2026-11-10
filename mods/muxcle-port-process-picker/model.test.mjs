import assert from "node:assert/strict";
import test from "node:test";
import {
  PortProcessPickerModel,
  filterProcesses,
  localContext,
  parseInventory,
} from "../../.build/mods/muxcle-port-process-picker/model.js";

const focus = { space: "local", tab: "tab-1", pane: "pane-1", terminal: "t1", shown: null, agent: null };
const spaces = [
  {
    id: "local",
    machine: null,
    active: true,
    tabs: [{ id: "tab-1", active: true }],
  },
];
const panes = [{ pane: "pane-1", terminal: "t1", tab: "tab-1", zoomed: false }];
const layout = {
  id: "root",
  type: "row",
  children: [
    { id: "spaces", type: "block", content: { mod: "spaces" } },
    {
      id: "workspace",
      type: "column",
      children: [
        { id: "tabs", type: "block", content: { mod: "tabs" } },
        { id: "active-tab", type: "block", content: { tab: "active" } },
        { id: "status", type: "block", content: { mod: "muxcle-compat" } },
      ],
    },
  ],
};
const processA = {
  pid: 210,
  uid: 501,
  command: "node api.js",
  startedAt: "Tue Nov 10 10:11:12 2026",
  ports: [3000, 3001],
};
const processB = {
  pid: 211,
  uid: 501,
  command: "python server.py",
  startedAt: "Tue Nov 10 10:12:13 2026",
  ports: [8000],
};

function inventory(processes = [processA, processB]) {
  return JSON.stringify({ schema: 1, processes, warnings: [] });
}

test("local context proves an ordinary local visible terminal and refuses agent or conflicting surfaces", () => {
  assert.deepEqual(localContext(focus, spaces, panes, layout), {
    kind: "local",
    context: { space: "local", tab: "tab-1", pane: "pane-1", terminal: "t1" },
  });
  assert.equal(localContext({ ...focus, terminal: "server/t1" }, spaces, panes, layout).kind, "unavailable");
  assert.equal(localContext({ ...focus, shown: "t2" }, spaces, panes, layout).kind, "unavailable");
  assert.deepEqual(localContext({ ...focus, agent: "server/t9" }, spaces, panes, layout), {
    kind: "local",
    context: { space: "local", tab: "tab-1", pane: "pane-1", terminal: "t1" },
  });
  assert.equal(localContext({ ...focus, agent: undefined }, spaces, panes, layout).kind, "unavailable");
  assert.equal(localContext(null, spaces, panes, layout).kind, "unavailable");
  assert.equal(localContext(focus, [{ ...spaces[0], machine: "server" }], panes, layout).kind, "unavailable");
  assert.equal(localContext(focus, [{ ...spaces[0], active: false }], panes, layout).kind, "unavailable");
  assert.equal(localContext(focus, spaces, [{ ...panes[0], mod: "peek" }], layout).kind, "unavailable");
  assert.equal(
    localContext({ ...focus, agent: "server/t9" }, spaces, panes, {
      id: "root",
      type: "block",
      content: { agent: "focused" },
    }).kind,
    "unavailable",
  );
  assert.equal(
    localContext(focus, spaces, panes, { id: "root", type: "block", content: { agent: "remote/agent" } }).kind,
    "unavailable",
  );
  assert.equal(
    localContext(focus, spaces, panes, {
      id: "root",
      type: "column",
      children: [
        { id: "terminal", type: "block", content: { terminal: "t2" } },
        { id: "active", type: "block", content: { tab: "active" } },
      ],
    }).kind,
    "unavailable",
  );
  assert.equal(localContext(focus, spaces, panes, null).kind, "unavailable");
  assert.equal(
    localContext(focus, spaces, panes, {
      id: "stack",
      type: "stack",
      active: "terminal",
      children: [
        { id: "terminal", type: "block", content: { tab: "active" } },
        { id: "agent", type: "block", content: { agent: "remote/agent" } },
      ],
    }).kind,
    "local",
  );
  for (const active of ["hidden-agent", "stale-id"]) {
    assert.equal(
      localContext(focus, spaces, panes, {
        id: "stack",
        type: "stack",
        active,
        children: [
          { id: "hidden-agent", type: "block", hidden: true, content: { agent: "focused" } },
          { id: "terminal", type: "block", content: { tab: "active" } },
        ],
      }).kind,
      "local",
    );
  }
  assert.equal(
    localContext(focus, spaces, panes, {
      id: "stack",
      type: "stack",
      active: "stale-id",
      children: [
        { id: "agent", type: "block", content: { agent: "focused" } },
        { id: "terminal", type: "block", content: { tab: "active" } },
      ],
    }).kind,
    "unavailable",
  );
});

test("inventory parser validates bounded unique process evidence and never guesses malformed records", () => {
  assert.deepEqual(parseInventory(inventory()).processes, [processA, processB]);
  assert.throws(() => parseInventory("not json"), /inventory/i);
  assert.throws(() => parseInventory(inventory([processA, processA])), /duplicate/i);
  assert.throws(() => parseInventory(inventory([{ ...processA, pid: 0 }])), /process/i);
  assert.throws(() => parseInventory(inventory([{ ...processA, ports: [0] }])), /process/i);
  assert.throws(() => parseInventory(inventory([{ ...processA, command: "bad\ncommand" }])), /process/i);
  assert.throws(
    () => parseInventory(JSON.stringify({ schema: 1, processes: Array(501).fill(processA), warnings: [] })),
    /limit/i,
  );
});

test("search filters identity and ports without changing captured data", () => {
  assert.deepEqual(filterProcesses([processA, processB], "python 8000"), [processB]);
  assert.deepEqual(filterProcesses([processA, processB], "3001"), [processA]);
  assert.deepEqual(filterProcesses([processA, processB], "no-match"), []);
});

test("selection starts empty, supports distinct processes, and freezes the exact reviewed set", () => {
  const model = new PortProcessPickerModel();
  assert.equal(model.phase, "selecting");
  assert.equal(model.selectedPids.size, 0);
  model.setInventory(parseInventory(inventory()));
  assert.equal(model.toggle(210), true);
  assert.equal(model.toggle(211), true);
  const reviewed = model.startReview();
  assert.deepEqual(reviewed, [processA, processB]);
  assert.equal(model.phase, "reviewing");
  assert.equal(model.toggle(210), false);
  assert.equal(model.startReview(), null);
  assert.ok(Object.isFrozen(reviewed));
  assert.ok(Object.isFrozen(reviewed[0]));
});

test("selection has a fixed count and one process owns one selection regardless of port count", () => {
  const model = new PortProcessPickerModel();
  const processes = Array.from({ length: 33 }, (_unused, index) => ({
    ...processA,
    pid: processA.pid + index,
    ports: [3_000 + index, 4_000 + index],
  }));
  model.setInventory(parseInventory(inventory(processes)));
  for (const process of processes.slice(0, 32)) assert.equal(model.toggle(process.pid), true);
  assert.equal(model.toggle(processes[32].pid), false);
  assert.equal(model.selectedPids.size, 32);
});

test("graceful TERM is available only from review; force requires a separate review step", () => {
  const model = new PortProcessPickerModel();
  model.setInventory(parseInventory(inventory()));
  model.toggle(210);
  assert.equal(model.startSignal("TERM"), null);
  assert.deepEqual(model.startReview(), [processA]);
  assert.equal(model.startSignal("KILL"), null);
  assert.deepEqual(model.startSignal("TERM"), [processA]);
  assert.equal(model.phase, "signaling");

  const force = new PortProcessPickerModel();
  force.setInventory(parseInventory(inventory()));
  force.toggle(211);
  force.startReview();
  assert.equal(force.startForceReview(), true);
  assert.equal(force.phase, "force-reviewing");
  assert.equal(force.startSignal("TERM"), null);
  assert.deepEqual(force.startSignal("KILL"), [processB]);
});

test("plain Enter and cancellation never authorize a signal", () => {
  const model = new PortProcessPickerModel();
  model.setInventory(parseInventory(inventory()));
  model.toggle(210);
  assert.equal(model.keyAction("Enter"), "ignore");
  assert.equal(model.startSignal("TERM"), null);
  assert.equal(model.cancel(), true);
  assert.equal(model.phase, "cancelled");
  assert.equal(model.startSignal("TERM"), null);
});

test("results lock the review against accidental retries, including unknown outcomes", () => {
  const model = new PortProcessPickerModel();
  model.setInventory(parseInventory(inventory()));
  model.toggle(210);
  model.startReview();
  model.startSignal("TERM");
  model.finishSignal({ kind: "unknown", message: "The helper response was lost." });
  assert.equal(model.phase, "complete");
  assert.equal(model.startSignal("TERM"), null);
  assert.equal(model.startForceReview(), false);
});
