import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLabel } from "../../.build/src/lib/example.js";

test("normalizes surrounding and repeated whitespace", () => {
  assert.equal(normalizeLabel("  API   server "), "API server");
});

test("converts non-string values before normalizing", () => {
  assert.equal(normalizeLabel(42), "42");
});
