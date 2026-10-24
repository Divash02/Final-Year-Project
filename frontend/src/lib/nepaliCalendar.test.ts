import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDateForCalendar,
  formatTimestampForCalendar,
  getNepalDateTime,
} from "./nepaliCalendar";

test("converts the Nepali New Year boundary from AD to BS", () => {
  const beforeNewYear = getNepalDateTime(new Date("2026-04-13T06:15:00Z"));
  const newYear = getNepalDateTime(new Date("2026-04-14T06:15:00Z"));

  assert.equal(beforeNewYear.bs, "२०८२ चैत्र ३०");
  assert.equal(newYear.bs, "२०८३ बैशाख ०१");
});

test("converts October Gregorian dates to the matching Nepali month and day", () => {
  const converted = getNepalDateTime(new Date("2026-10-01T06:00:00Z"));

  assert.equal(converted.bs, "२०८३ आश्विन १५");
  assert.equal(converted.ad, "October 1, 2026");
});

test("uses Kathmandu civil date at UTC midnight boundaries", () => {
  const converted = getNepalDateTime(new Date("2026-04-13T18:30:00Z"));

  assert.equal(converted.bs, "२०८३ बैशाख ०१");
  assert.equal(converted.time, "00:15:00");
  assert.equal(converted.timeNe, "००:१५:००");
});

test("calendar display helpers switch between stored BS and AD representations", () => {
  const date = { bs: "2083-01-01", ad: "2026-04-14T06:15:00Z" };

  assert.equal(formatDateForCalendar(date, "BS", "ne"), "२०८३ बैशाख ०१");
  assert.equal(formatDateForCalendar(date, "AD", "en"), "April 14, 2026");
  assert.equal(
    formatTimestampForCalendar("2026-04-13T18:30:00Z", "BS", "ne"),
    "२०८३ बैशाख ०१",
  );
});
