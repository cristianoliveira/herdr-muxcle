import assert from "node:assert/strict";
import test from "node:test";
import { executeDocumentRotation } from "../../.build/mods/muxcle-rotation/adapter.js";

const context = {
  space: "s",
  tab: "t",
  pane: "a",
  panes: ["a", "b", "c"],
  terminals: ["ta", "tb", "tc"],
  machine: null,
};

test("runs the isolated helper with argv and an explicit working directory", async () => {
  const calls = [];
  const execute = async (...args) => {
    calls.push(args);
    return { code: 0, stdout: '{"changed":true,"pane":"c"}', stderr: "" };
  };

  assert.equal(await executeDocumentRotation(execute, "/path with spaces/mod", context), '{"changed":true,"pane":"c"}');
  assert.deepEqual(calls, [
    ["python3", ["-I", "-B", "rotate.py", JSON.stringify(context)], { cwd: "/path with spaces/mod" }],
  ]);
});

test("rejects oversized UTF-8 context before launching any process", async () => {
  let called = false;
  const execute = async () => {
    called = true;
    throw new Error("must not run");
  };

  await assert.rejects(executeDocumentRotation(execute, "/mod", { ...context, space: "é".repeat(50000) }), /too large/);
  assert.equal(called, false);
});

test("an unconfirmed process failure is surfaced without retry", async () => {
  let calls = 0;
  await assert.rejects(
    executeDocumentRotation(
      async () => {
        calls += 1;
        throw new Error("process lost");
      },
      "/mod",
      context,
    ),
    /could not be confirmed/,
  );
  assert.equal(calls, 1);
});

test("surfaces helper failure or oversized output without retry", async () => {
  for (const result of [
    { code: 1, stdout: "", stderr: "Layout conflict" },
    { code: 0, stdout: "x".repeat(8193), stderr: "" },
  ]) {
    let calls = 0;
    await assert.rejects(
      executeDocumentRotation(
        async () => {
          calls += 1;
          return result;
        },
        "/mod",
        context,
      ),
    );
    assert.equal(calls, 1);
  }
});
