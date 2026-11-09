import assert from "node:assert/strict";
import test from "node:test";
import { executeDocumentEqualization } from "../../.build/mods/muxcle-sizing/adapter.js";

const context = {
  space: "s",
  tab: "t",
  pane: "a",
  panes: ["a", "b"],
  terminals: ["ta", "tb"],
  machine: null,
};

test("runs the isolated helper with argv and an explicit working directory", async () => {
  const calls = [];
  const execute = async (...args) => {
    calls.push(args);
    return { code: 0, stdout: '{"changed":true,"splits":1}', stderr: "" };
  };

  assert.equal(
    await executeDocumentEqualization(execute, "/path with spaces/mod", context),
    '{"changed":true,"splits":1}',
  );
  assert.deepEqual(calls, [
    ["python3", ["-I", "-B", "equalize.py", JSON.stringify(context)], { cwd: "/path with spaces/mod" }],
  ]);
});

test("rejects oversized UTF-8 context before starting a process", async () => {
  let called = false;
  await assert.rejects(
    executeDocumentEqualization(
      async () => {
        called = true;
        throw new Error("must not run");
      },
      "/mod",
      { ...context, space: "é".repeat(50_000) },
    ),
    /too large/,
  );
  assert.equal(called, false);
});

test("surfaces failed, unconfirmed, and oversized helper results without retry", async () => {
  const results = [
    { code: 1, stdout: "", stderr: "Layout conflict" },
    { code: 0, stdout: "x".repeat(8_193), stderr: "" },
  ];
  for (const result of results) {
    let calls = 0;
    await assert.rejects(
      executeDocumentEqualization(
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

  let calls = 0;
  await assert.rejects(
    executeDocumentEqualization(
      async () => {
        calls += 1;
        throw new Error("transport failed");
      },
      "/mod",
      context,
    ),
    /outcome may be uncertain/,
  );
  assert.equal(calls, 1);
});
