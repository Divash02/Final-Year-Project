/**
 * Display helpers for LMS values.
 *
 * These are the only place the browser turns a server value into a sentence a
 * student or teacher reads, and every one of them exists because of the same
 * distinction: **an absent value is not a zero**. A withheld mark, an ungraded
 * submission and a genuinely empty average all have to read as absences, because
 * rendering them as `0` tells a student they failed when the truth is that
 * nobody has decided yet.
 *
 * They are kept free of imports — including the API client — so they can be
 * tested directly, and so that importing them can never pull in a network layer.
 */

/** "in 3 days" / "in 2 hours" / "Closed", anchored to a caller-supplied clock. */
export function formatDeadline(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "No deadline";
  const delta = new Date(value).getTime() - now;
  if (Number.isNaN(delta)) return "No deadline";
  if (delta <= 0) return "Closed";

  const minutes = Math.round(delta / 60000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** A countdown as `mm:ss`. Negative input clamps to zero rather than counting up. */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * A mark for display.
 *
 * `null` and `undefined` both mean "no mark has been released or recorded", and
 * both render as `Not marked`. A real zero renders as `0 / 10`, because that is a
 * mark the server actually recorded.
 */
export function formatMark(
  marks: number | null | undefined,
  maxMarks?: number | null,
): string {
  if (marks === null || marks === undefined) return "Not marked";
  if (!maxMarks) return String(marks);
  return `${marks} / ${maxMarks}`;
}

/** A percentage, or an honest dash when there is nothing to average. */
export function formatPercentage(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value}%`;
}
