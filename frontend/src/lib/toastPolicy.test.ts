import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOAST_DURATIONS, defaultDuration } from "../lib/toastPolicy";

describe("TOAST_DURATIONS policy", () => {
  it("defines the four standard durations", () => {
    assert.equal(TOAST_DURATIONS.success, 4000);
    assert.equal(TOAST_DURATIONS.info, 5000);
    assert.equal(TOAST_DURATIONS.warning, 6000);
    assert.equal(TOAST_DURATIONS.error, 7000);
    assert.equal(TOAST_DURATIONS.camera, 5000);
  });
});

describe("defaultDuration helper", () => {
  it("returns the policy defaults", () => {
    assert.equal(defaultDuration("success"), TOAST_DURATIONS.success);
    assert.equal(defaultDuration("info"), TOAST_DURATIONS.info);
    assert.equal(defaultDuration("warning"), TOAST_DURATIONS.warning);
    assert.equal(defaultDuration("error"), TOAST_DURATIONS.error);
  });

  it("honours an explicit override", () => {
    assert.equal(defaultDuration("error", 1000), 1000);
    assert.equal(defaultDuration("success", null), TOAST_DURATIONS.success);
    assert.equal(defaultDuration("success", undefined), TOAST_DURATIONS.success);
  });
});