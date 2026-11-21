import test from "node:test";
import assert from "node:assert/strict";

test("minimal pass", () => {
  assert.equal(1, 1);
});

test("minimal fail", () => {
  assert.equal(1, 2);
});
