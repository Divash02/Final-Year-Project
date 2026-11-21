import test from "node:test";
import assert from "node:assert/strict";

test("should pass", () => {
  assert.equal(1, 1);
  console.log("PASS TEST RAN");
});

test("should fail", () => {
  assert.equal(1, 2);
});
