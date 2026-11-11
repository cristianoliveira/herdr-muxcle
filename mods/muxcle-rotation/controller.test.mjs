import assert from "node:assert/strict";
import test from "node:test";
import { RotationController } from "../../.build/mods/muxcle-rotation/controller.js";

function snapshot() {
  return {
    focus: { space: "s", tab: "t", pane: "b", terminal: "tb", shown: null },
    tab: { id: "t", panes: 3, zoomed: false },
    machine: null,
    panes: ["a", "b", "c"].map((id) => ({ pane: id, terminal: `t${id}`, tab: "t", zoomed: false })),
  };
}

function harness(document = async () => '{"changed":true,"pane":"a"}', nativePairRotation = true) {
  let current = snapshot();
  const calls = { commands: [], documents: [], notices: [] };
  const controller = new RotationController(
    {
      snapshot: () => current,
      document: async (context) => {
        calls.documents.push(context);
        return document(context);
      },
      run: (action) => calls.commands.push(action),
      notice: (message) => calls.notices.push(message),
    },
    nativePairRotation,
  );
  return {
    controller,
    calls,
    setSnapshot(value) {
      current = value;
    },
  };
}

test("multi-pane rotation uses one helper and restores focus after confirmation", async () => {
  const { controller, calls } = harness();

  assert.equal(await controller.rotate(), true);

  assert.equal(calls.documents.length, 1);
  assert.deepEqual(calls.commands, [{ command: "pane.focus", args: { pane: "a" } }]);
  assert.deepEqual(calls.notices, []);
});

test("restores focus after the app observes the rotated pane order", async () => {
  const h = harness(async () => {
    const current = snapshot();
    h.setSnapshot({ ...current, panes: [current.panes[2], current.panes[0], current.panes[1]] });
    return '{"changed":true,"pane":"a"}';
  });

  assert.equal(await h.controller.rotate(), true);
  assert.deepEqual(h.calls.commands, [{ command: "pane.focus", args: { pane: "a" } }]);
});

test("navigation away prevents focus restoration without repeating the write", async () => {
  const h = harness(async () => {
    h.setSnapshot({ ...snapshot(), focus: { ...snapshot().focus, space: "other", tab: "other" } });
    return '{"changed":true,"pane":"a"}';
  });

  assert.equal(await h.controller.rotate(), true);
  assert.equal(h.calls.documents.length, 1);
  assert.deepEqual(h.calls.commands, []);
});

test("duplicate commands are ignored while a helper is pending", async () => {
  let complete;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  const h = harness(() => pending);

  const first = h.controller.rotate();
  assert.equal(await h.controller.rotate(), false);
  complete('{"changed":true,"pane":"a"}');

  assert.equal(await first, true);
  assert.equal(h.calls.documents.length, 1);
  assert.equal(h.calls.commands.length, 1);
});

test("host disposal does not restore focus after an in-flight write", async () => {
  let complete;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  const h = harness(() => pending);

  const operation = h.controller.rotate();
  h.controller.dispose();
  complete('{"changed":true,"pane":"a"}');

  assert.equal(await operation, true);
  assert.deepEqual(h.calls.commands, []);
  assert.equal(await h.controller.rotate(), false);
});

test("conflicts, malformed results, and unexpected targets never retry or focus", async () => {
  for (const document of [
    async () => {
      throw new Error("Layout conflict");
    },
    async () => "not json",
    async () => '{"changed":true,"pane":"foreign"}',
  ]) {
    const h = harness(document);
    assert.equal(await h.controller.rotate(), false);
    assert.equal(h.calls.documents.length, 1);
    assert.deepEqual(h.calls.commands, []);
    assert.equal(h.calls.notices.length, 1);
  }
});

test("a terminal replacement or unknown post-write order suppresses focus restoration", async () => {
  for (const change of [
    (state) => ({ ...state, panes: state.panes.map((pane) => ({ ...pane, terminal: "replacement" })) }),
    (state) => ({ ...state, panes: [state.panes[1], state.panes[0], state.panes[2]] }),
  ]) {
    const h = harness(async () => {
      h.setSnapshot(change(snapshot()));
      return '{"changed":true,"pane":"a"}';
    });
    assert.equal(await h.controller.rotate(), true);
    assert.deepEqual(h.calls.commands, []);
  }
});

test("single-pane and unsupported contexts never invoke the helper", async () => {
  const single = harness();
  single.setSnapshot({ ...snapshot(), tab: { id: "t", panes: 1, zoomed: false }, panes: snapshot().panes.slice(1, 2) });
  assert.equal(await single.controller.rotate(), false);
  assert.deepEqual(single.calls.documents, []);
  assert.deepEqual(single.calls.commands, []);
  assert.deepEqual(single.calls.notices, []);

  const unsupported = harness();
  unsupported.setSnapshot({ ...snapshot(), focus: null });
  assert.equal(await unsupported.controller.rotate(), false);
  assert.deepEqual(unsupported.calls.documents, []);
  assert.deepEqual(unsupported.calls.commands, []);
  assert.equal(unsupported.calls.notices.length, 1);
});

test("disabling native pair rotation uses one helper and keeps the terminal-only focus path", async () => {
  const h = harness(undefined, false);
  const before = snapshot();
  h.setSnapshot({ ...before, tab: { ...before.tab, panes: 2 }, panes: before.panes.slice(0, 2) });

  assert.equal(await h.controller.rotate(), true);
  assert.equal(h.calls.documents.length, 1);
  assert.deepEqual(h.calls.documents[0].panes, ["a", "b"]);
  assert.deepEqual(h.calls.documents[0].terminals, ["ta", "tb"]);
  assert.equal(
    h.calls.commands.some(({ command }) => command === "pane.swap"),
    false,
  );
  assert.deepEqual(h.calls.commands, [{ command: "pane.focus", args: { pane: "a" } }]);
});

test("a failed CAS opt-out never retries or falls back to native swaps", async () => {
  const h = harness(async () => {
    throw new Error("Layout conflict");
  }, false);
  const before = snapshot();
  h.setSnapshot({ ...before, tab: { ...before.tab, panes: 2 }, panes: before.panes.slice(0, 2) });

  assert.equal(await h.controller.rotate(), false);
  assert.equal(h.calls.documents.length, 1);
  assert.deepEqual(h.calls.commands, []);
  assert.equal(h.calls.notices.length, 1);
});

test("a fresh focus change cancels only focus restoration after two-pane CAS", async () => {
  const h = harness(async () => {
    const current = snapshot();
    h.setSnapshot({ ...current, focus: { ...current.focus, pane: "a", terminal: "ta" } });
    return '{"changed":true,"pane":"a"}';
  }, false);
  const before = snapshot();
  h.setSnapshot({ ...before, tab: { ...before.tab, panes: 2 }, panes: before.panes.slice(0, 2) });

  assert.equal(await h.controller.rotate(), true);
  assert.equal(h.calls.documents.length, 1);
  assert.deepEqual(h.calls.commands, []);
});

test("two-pane native rotation does not invoke the document helper", async () => {
  const h = harness(async () => {
    throw new Error("must not run");
  });
  h.setSnapshot({ ...snapshot(), tab: { id: "t", panes: 2, zoomed: false }, panes: snapshot().panes.slice(0, 2) });

  assert.equal(await h.controller.rotate(), true);
  assert.deepEqual(h.calls.documents, []);
  assert.equal(h.calls.commands.length, 3);
});
