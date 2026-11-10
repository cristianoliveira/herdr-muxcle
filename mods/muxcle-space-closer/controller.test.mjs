import assert from "node:assert/strict";
import test from "node:test";
import { SpaceCloserController } from "../../.build/mods/muxcle-space-closer/controller.js";
import { filterSpaces } from "../../.build/mods/muxcle-space-closer/model.js";

const spaces = [
  {
    id: "local-space",
    name: "Local",
    folder: "/work/local",
    machine: null,
    tabs: [{ id: "local-tab", name: "Code", panes: 2 }],
  },
  {
    id: "build/remote-space",
    name: "Build",
    folder: "/srv/build",
    machine: "build",
    tabs: [{ id: "build/tab", name: "Shell", panes: 3 }],
  },
];
const layouts = [
  { name: null, layout: "ready" },
  { name: "build", layout: "ready" },
];
const peers = [{ id: "core-build-1", name: "build", state: "connected" }];
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
function harness(overrides = {}) {
  let currentSpaces = spaces;
  const calls = { coreMachines: 0, close: [] };
  const adapter = {
    spaces: () => currentSpaces,
    machines: () => layouts,
    coreMachines: async () => {
      calls.coreMachines += 1;
      return peers;
    },
    closeSpace: (id) => calls.close.push(id),
    ...overrides,
  };
  return {
    calls,
    controller: new SpaceCloserController(adapter),
    setSpaces(value) {
      currentSpaces = value;
    },
    adapter,
  };
}

test("begins with no selection and requires a reviewed snapshot", async () => {
  const { controller, calls } = harness();
  assert.equal(controller.selectedIds.size, 0);
  assert.equal((await controller.review()).kind, "empty");
  assert.equal((await controller.confirm()).kind, "ignored");
  assert.deepEqual(calls.close, []);
});

test("reviewed close submits exact selected IDs once and never claims execution success", async () => {
  const { controller, calls } = harness();
  controller.toggle("local-space");
  controller.toggle("build/remote-space");
  assert.equal((await controller.review()).kind, "ready");
  assert.equal(controller.phase, "reviewing");
  assert.equal(controller.toggle("local-space"), false);
  assert.equal(controller.selectedIds.size, 2);

  const result = await controller.confirm();
  assert.equal(result.kind, "submitted");
  assert.equal(result.attempted, 2);
  assert.equal(result.dispatchErrors, 0);
  assert.equal(result.completion, "unknown");
  assert.deepEqual(calls.close, ["local-space", "build/remote-space"]);
  assert.equal(controller.phase, "submitted");
  assert.equal((await controller.confirm()).kind, "ignored");
  assert.deepEqual(calls.close, ["local-space", "build/remote-space"]);
});

test("filters keep hidden selections and a disappeared selection is pruned before review", async () => {
  const { controller, calls, setSpaces } = harness();
  controller.toggle("local-space");
  controller.toggle("build/remote-space");
  assert.deepEqual(
    filterSpaces(controller.spaces(), "Build").map(({ id }) => id),
    ["build/remote-space"],
  );
  assert.equal(controller.selectedIds.has("local-space"), true);

  setSpaces([spaces[1]]);
  const result = await controller.review();
  assert.equal(result.kind, "missing");
  assert.equal(controller.selectedIds.has("local-space"), false);
  assert.equal(controller.selectedIds.has("build/remote-space"), true);
  assert.deepEqual(calls.close, []);
});

test("review captures the latest state after an asynchronous identity lookup", async () => {
  const { controller, adapter, setSpaces } = harness();
  const gate = deferred();
  adapter.coreMachines = () => gate.promise;
  controller.toggle("build/remote-space");
  const pending = controller.review();
  setSpaces([{ ...spaces[1], name: "Updated while checking" }]);
  gate.resolve(peers);

  assert.equal((await pending).kind, "ready");
  assert.equal(controller.reviewSnapshot[0].name, "Updated while checking");
  assert.equal(controller.phase, "reviewing");
});

test("new arrivals never join the immutable review", async () => {
  const { controller, calls, setSpaces } = harness();
  controller.toggle("local-space");
  assert.equal((await controller.review()).kind, "ready");
  setSpaces([...spaces, { id: "late", name: "Late arrival", folder: "/late", machine: null, tabs: [] }]);

  const result = await controller.confirm();
  assert.equal(result.kind, "submitted");
  assert.equal(calls.coreMachines, 0);
  assert.deepEqual(calls.close, ["local-space"]);
});

test("changed, deleted, or newly retargeted reviewed targets require a new review", async () => {
  const changes = [
    { spaces: [{ ...spaces[0], name: "Renamed" }, spaces[1]] },
    { spaces: [spaces[1]] },
    { peers: [{ id: "core-build-2", name: "build", state: "connected" }] },
    {
      layouts: [
        { name: null, layout: "ready" },
        { name: "build", layout: "unavailable" },
      ],
    },
  ];
  for (const change of changes) {
    const { controller, calls, setSpaces, adapter } = harness();
    controller.toggle("local-space");
    controller.toggle("build/remote-space");
    assert.equal((await controller.review()).kind, "ready");
    if (change.spaces) setSpaces(change.spaces);
    if (change.peers) adapter.coreMachines = async () => change.peers;
    if (change.layouts) adapter.machines = () => change.layouts;

    const result = await controller.confirm();
    assert.equal(result.kind, "changed");
    assert.equal(result.attempted, 0);
    assert.deepEqual(calls.close, []);
    assert.equal(controller.phase, "selecting");
  }
});

test("back and cancel clear review authorization; cancel during final check prevents dispatch", async () => {
  const back = harness();
  back.controller.toggle("local-space");
  assert.equal((await back.controller.review()).kind, "ready");
  assert.equal(back.controller.back(), true);
  assert.equal((await back.controller.confirm()).kind, "ignored");
  assert.deepEqual(back.calls.close, []);

  const cancelled = harness();
  cancelled.controller.toggle("local-space");
  assert.equal((await cancelled.controller.review()).kind, "ready");
  assert.equal(cancelled.controller.cancel(), true);
  assert.equal((await cancelled.controller.confirm()).kind, "ignored");
  assert.deepEqual(cancelled.calls.close, []);

  const pendingReview = harness();
  pendingReview.controller.toggle("build/remote-space");
  const reviewGate = deferred();
  pendingReview.adapter.coreMachines = () => reviewGate.promise;
  const review = pendingReview.controller.review();
  pendingReview.controller.cancel();
  reviewGate.resolve(peers);
  assert.equal((await review).kind, "cancelled");
  assert.deepEqual(pendingReview.calls.close, []);

  const pending = harness();
  pending.controller.toggle("build/remote-space");
  assert.equal((await pending.controller.review()).kind, "ready");
  const gate = deferred();
  pending.adapter.coreMachines = () => gate.promise;
  const confirmation = pending.controller.confirm();
  pending.controller.cancel();
  gate.resolve(peers);
  assert.equal((await confirmation).kind, "cancelled");
  assert.deepEqual(pending.calls.close, []);
});

test("duplicate confirmation while identities are being checked does not add work", async () => {
  const { controller, adapter, calls } = harness();
  controller.toggle("build/remote-space");
  assert.equal((await controller.review()).kind, "ready");
  const gate = deferred();
  adapter.coreMachines = () => {
    calls.coreMachines += 1;
    return gate.promise;
  };
  const first = controller.confirm();
  assert.equal((await controller.confirm()).kind, "ignored");
  gate.resolve(peers);
  assert.equal((await first).kind, "submitted");
  assert.equal(calls.coreMachines, 2);
  assert.deepEqual(calls.close, ["build/remote-space"]);
});

test("partial synchronous dispatch failure is reported and never retried", async () => {
  const { controller, calls, adapter } = harness();
  adapter.closeSpace = (id) => {
    calls.close.push(id);
    if (id === "build/remote-space") throw new Error("native dispatch unavailable");
  };
  controller.toggle("local-space");
  controller.toggle("build/remote-space");
  await controller.review();

  const result = await controller.confirm();
  assert.equal(result.kind, "submitted");
  assert.equal(result.attempted, 2);
  assert.equal(result.dispatchErrors, 1);
  assert.equal(result.completion, "unknown");
  assert.equal((await controller.confirm()).kind, "ignored");
  assert.deepEqual(calls.close, ["local-space", "build/remote-space"]);
});

test("unavailable peer metadata refuses review without calling close", async () => {
  const { controller, adapter, calls } = harness();
  adapter.coreMachines = async () => {
    throw new Error("hc unavailable");
  };
  controller.toggle("build/remote-space");
  assert.equal((await controller.review()).kind, "unavailable");
  assert.equal(controller.phase, "selecting");
  assert.deepEqual(calls.close, []);
});
