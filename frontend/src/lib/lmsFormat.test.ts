import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCountdown,
  formatDeadline,
  formatMark,
  formatPercentage,
} from "./lmsFormat";

/*
 * These tests exist to pin one rule: an absent value must never be displayed as
 * a zero. A student who sees "0 / 10" has been told they failed, when the truth
 * is usually that nobody has marked the paper or the release policy is holding
 * the score back. The server expresses that by omitting the field, so the
 * formatter has to preserve the omission.
 */

test("an unmarked paper reads as unmarked, never as a zero", () => {
  assert.equal(formatMark(null, 10), "Not marked");
  assert.equal(formatMark(undefined, 10), "Not marked");
  // A recorded zero is a real mark and must keep reading as one.
  assert.equal(formatMark(0, 10), "0 / 10");
});

test("a mark without a maximum is shown bare rather than as a fraction", () => {
  assert.equal(formatMark(7), "7");
  assert.equal(formatMark(7, null), "7");
});

test("an absent average is a dash rather than a zero percent", () => {
  assert.equal(formatPercentage(null), "—");
  assert.equal(formatPercentage(undefined), "—");
  assert.equal(formatPercentage(0), "0%");
  assert.equal(formatPercentage(82.5), "82.5%");
});

test("deadlines are phrased relative to the supplied clock, not the machine's", () => {
  const now = new Date("2026-10-05T12:00:00Z").getTime();
  const ahead = (iso: string) => formatDeadline(iso, now);

  assert.equal(ahead("2026-10-05T12:30:00Z"), "in 30 min");
  assert.equal(ahead("2026-10-05T13:00:00Z"), "in 1 hour");
  assert.equal(ahead("2026-10-05T15:00:00Z"), "in 3 hours");
  assert.equal(ahead("2026-10-06T12:00:00Z"), "in 1 day");
});

test("a past deadline reads as closed rather than counting backwards", () => {
  const now = new Date("2026-10-05T12:00:00Z").getTime();
  assert.equal(formatDeadline("2026-10-05T11:00:00Z", now), "Closed");
  assert.equal(formatDeadline("2026-10-05T12:00:00Z", now), "Closed");
});

test("a missing or unparseable deadline is honestly absent", () => {
  const now = new Date("2026-10-05T12:00:00Z").getTime();
  assert.equal(formatDeadline(null, now), "No deadline");
  assert.equal(formatDeadline(undefined, now), "No deadline");
  assert.equal(formatDeadline("not-a-date", now), "No deadline");
});

test("a countdown clamps at zero instead of showing negative time", () => {
  assert.equal(formatCountdown(0), "00:00");
  assert.equal(formatCountdown(-5000), "00:00");
  assert.equal(formatCountdown(1000), "00:01");
  assert.equal(formatCountdown(65000), "01:05");
  assert.equal(formatCountdown(605000), "10:05");
});