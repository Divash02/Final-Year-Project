import test from "node:test";
import assert from "node:assert/strict";

import {
  getInstitutionMonthGrid,
  isSameInstitutionMonth,
  formatMonthHeading,
  formatDateKeyLong,
  getInstitutionDateParts,
  parseScheduleTime,
  formatMinutesAsTime,
} from "./institutionTime";

/**
 * Institution time helpers.
 *
 * The month grid is the arithmetic a teacher notices only when it is wrong: a week
 * row that starts on the wrong day, or a month that loses its last Friday, both
 * render a plausible-looking grid that puts a class on a day it is not taught. The
 * cases below pin the shape rather than the appearance.
 */

test("a month grid is whole Sunday-first weeks", () => {
  // October 2026 starts on a Thursday and ends on a Saturday, so it needs four
  // leading cells and none trailing: exactly five full weeks, no empty sixth row.
  const grid = getInstitutionMonthGrid("2026-10-05");

  assert.equal(grid.length, 5, "4 leading + 31 days + 0 trailing is exactly 5 weeks");
  for (const week of grid) {
    assert.equal(week.length, 7, "every row is a full week");
  }

  // The first cell is the Sunday on or before the 1st, and the last cell is the
  // Saturday on or after the last day. Both are real dates, not blanks.
  assert.equal(grid[0][0], "2026-09-27");
  assert.equal(grid[4][6], "2026-10-31");

  // Cells are contiguous: no day is skipped or repeated across a row boundary.
  const flat = grid.flat();
  for (let index = 1; index < flat.length; index += 1) {
    assert.equal(
      addDaysIso(flat[index - 1], 1),
      flat[index],
      `${flat[index - 1]} and ${flat[index]} are not consecutive`,
    );
  }
});

test("a month that starts on a Sunday needs no leading cells", () => {
  // November 2026 starts on a Sunday, so its first cell is the 1st itself — the case
  // where a grid helper that always pads would shift every class a column left.
  const november = getInstitutionMonthGrid("2026-11-10");
  assert.equal(november[0][0], "2026-11-01");
  assert.equal(
    new Date(`${november[0][0]}T00:00:00Z`).getUTCDay(),
    0,
    "a month starting on Sunday needs no padding",
  );
  // 30 days + 5 trailing cells = 35 = 5 weeks.
  assert.equal(november.length, 5);
  assert.equal(november[4][6], "2026-12-05");
});

test("a leap February keeps its 29th", () => {
  const grid = getInstitutionMonthGrid("2028-02-15");
  const flat = grid.flat();
  assert.ok(flat.includes("2028-02-29"), "2028 is a leap year and the 29th must exist");
  const february = flat.filter((key) => key.startsWith("2028-02"));
  assert.equal(february.length, 29);
  // A non-leap February must not gain a 29th from the padding.
  const plain = getInstitutionMonthGrid("2026-02-15")
    .flat()
    .filter((key) => key.startsWith("2026-02"));
  assert.equal(plain.length, 28);
});

test("a month grid rejects a date key it cannot read", () => {
  assert.deepEqual(getInstitutionMonthGrid("not-a-date"), []);
  assert.deepEqual(getInstitutionMonthGrid(""), []);
});

test("month membership compares the year and month, not the day", () => {
  assert.equal(isSameInstitutionMonth("2026-10-01", "2026-10-31"), true);
  assert.equal(isSameInstitutionMonth("2026-10-31", "2026-11-01"), false);
  assert.equal(isSameInstitutionMonth("2025-10-01", "2026-10-01"), false);
});

test("a month heading names the month the server window is in", () => {
  assert.equal(formatMonthHeading("2026-10-05"), "October 2026");
  assert.equal(formatMonthHeading("2026-01-01"), "January 2026");
  // A grid is only meaningful if a day key is understood rather than echoed.
  assert.equal(formatMonthHeading("nonsense"), "nonsense");
});

test("institution day resolution is stable at midnight", () => {
  // Kathmandu is UTC+05:45, so 18:20 UTC on the 4th is already the 5th locally.
  const parts = getInstitutionDateParts(new Date("2026-10-04T18:20:00Z"));
  assert.equal(parts.dateKey, "2026-10-05");
  assert.equal(parts.hour, 0);
  assert.equal(parts.minute, 5);
  assert.equal(parts.weekday, 1, "2026-10-05 is a Monday");
});

test("schedule times round-trip through minutes", () => {
  assert.equal(parseScheduleTime("09:30"), 570);
  assert.equal(parseScheduleTime("9:30"), 570, "a single-digit hour is still a time");
  assert.equal(formatMinutesAsTime(570), "09:30");
  assert.equal(parseScheduleTime("24:00"), null, "a day has 24 hours, not 25");
  assert.equal(parseScheduleTime("nope"), null);
});

test("a date key formats as a readable long date", () => {
  assert.equal(formatDateKeyLong("2026-10-05"), "5 Oct 2026");
});

/** Adds days to an ISO date key at UTC noon, so no boundary can shift the result. */
function addDaysIso(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
