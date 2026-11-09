/**
 * Institution time helpers.
 *
 * Every "now" calculation in CollegeOS (navbar clock, calendar current-time
 * indicator) must run in the institution's configured timezone rather than the
 * viewer's device timezone. The timezone comes from tenant configuration
 * (`Tenant.config.timezone`, e.g. "Asia/Kathmandu" / UTC+05:45).
 */

export const DEFAULT_INSTITUTION_TIME_ZONE = "Asia/Kathmandu";

export interface InstitutionDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  /** 0 = Sunday ... 6 = Saturday, matching `TimetableSlot.dayOfWeek`. */
  weekday: number;
  /** ISO-ish local date key, e.g. "2026-10-04". */
  dateKey: string;
  /** Minutes elapsed since local midnight. */
  minutesSinceMidnight: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Resolves the institution timezone, falling back to the configured default. */
export function resolveInstitutionTimeZone(
  configured?: string | null,
): string {
  const candidate = (configured || "").trim();
  if (!candidate) return DEFAULT_INSTITUTION_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_INSTITUTION_TIME_ZONE;
  }
}

/** Breaks an instant into local calendar fields for the institution timezone. */
export function getInstitutionDateParts(
  date: Date = new Date(),
  timeZone: string = DEFAULT_INSTITUTION_TIME_ZONE,
): InstitutionDateParts {
  const zone = resolveInstitutionTimeZone(timeZone);
  const parts = getFormatter(zone).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  // Intl can emit hour 24 for midnight in some engines.
  const rawHour = Number(read("hour"));
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(read("minute"));

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: WEEKDAY_INDEX[read("weekday")] ?? 0,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

/** True when the two instants fall on the same institution-local calendar day. */
export function isSameInstitutionDay(
  a: Date,
  b: Date,
  timeZone: string = DEFAULT_INSTITUTION_TIME_ZONE,
): boolean {
  return (
    getInstitutionDateParts(a, timeZone).dateKey ===
    getInstitutionDateParts(b, timeZone).dateKey
  );
}

/** Formats an institution-local wall clock as 24h "HH:MM". */
export function formatInstitutionTime(
  parts: Pick<InstitutionDateParts, "hour" | "minute">,
): string {
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/**
 * Parses a "HH:MM" schedule string into minutes since midnight.
 * Returns null for malformed input so callers can skip the row.
 */
export function parseScheduleTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Formats minutes since midnight as "HH:MM". */
export function formatMinutesAsTime(totalMinutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Formats a stored schedule time ("HH:mm" 24h) as 12-hour time (e.g. 3:34 PM). */
export function formatScheduleTime12h(value?: string | null): string {
  const raw = String(value || "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return raw;
  let h = Number(m[1]);
  const min = m[2];
  if (!Number.isFinite(h) || h < 0 || h > 23) return raw;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

/** Formats a timestamp for credential/session metadata in 12-hour time. */
export function formatDateTime12h(value?: string | Date | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Builds the seven local date keys for the week (Sunday-first) containing the
 * given institution-local day.
 */
export function getInstitutionWeekDateKeys(
  date: Date,
  timeZone: string = DEFAULT_INSTITUTION_TIME_ZONE,
): string[] {
  const parts = getInstitutionDateParts(date, timeZone);
  // Start from UTC noon so day arithmetic is never shifted by a DST boundary.
  const anchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  anchor.setUTCDate(anchor.getUTCDate() - parts.weekday);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(anchor);
    day.setUTCDate(anchor.getUTCDate() + index);
    return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
  });
}

/**
 * Builds the calendar grid for a month, as whole Sunday-first weeks.
 *
 * The leading and trailing blanks are real dates from the neighbouring months, not
 * empty cells. A month grid is only honest if a teacher can see that the 1st is a
 * Wednesday and that this month's teaching runs to the 4th — which needs the
 * neighbours to be countable.
 *
 * `dateKey` is an institution-local `YYYY-MM-DD`; arithmetic runs at UTC noon so a
 * daylight-saving boundary in the institution's own timezone cannot shift a cell.
 */
export function getInstitutionMonthGrid(dateKey: string): string[][] {
  const [year, month] = dateKey.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];

  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const last = new Date(Date.UTC(year, month, 0, 12));
  const lead = first.getUTCDay();
  const trail = 6 - last.getUTCDay();
  const cellCount = Math.ceil((lead + last.getUTCDate() + trail) / 7) * 7;

  const start = new Date(Date.UTC(year, month - 1, 1 - lead, 12));
  return Array.from({ length: cellCount / 7 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const cell = new Date(start);
      cell.setUTCDate(start.getUTCDate() + week * 7 + day);
      return `${cell.getUTCFullYear()}-${String(cell.getUTCMonth() + 1).padStart(2, "0")}-${String(cell.getUTCDate()).padStart(2, "0")}`;
    }),
  );
}

/** True when two institution-local date keys fall in the same calendar month. */
export function isSameInstitutionMonth(
  a: string,
  b: string,
): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Formats a date key as "March 2026", for a month heading. */
export function formatMonthHeading(dateKey: string, locale = "en-GB"): string {
  const [year, month] = dateKey.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return dateKey;
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

/** Formats an institution-local date key as a readable day heading. */
export function formatDateKeyHeading(
  dateKey: string,
  locale = "en-GB",
): { weekday: string; day: string; month: string } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date),
    day: new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(date),
    month: new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(date),
  };
}

/** Formats an institution-local date key as "14 Apr 2026". */
export function formatDateKeyLong(dateKey: string, locale = "en-GB"): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}