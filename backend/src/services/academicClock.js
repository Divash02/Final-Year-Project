import { InstitutionSetting } from "../models/index.js";

/**
 * Institution clock and timezone.
 *
 * Every deadline in the LMS is stored as an absolute instant, so correctness
 * never depends on a timezone: comparisons are done by the server against its
 * own clock. The timezone matters for two things instead — how an instant is
 * *displayed* to a teacher, and how a date/time the teacher *typed* is turned
 * into an instant.
 *
 * This service owns both. `zonedTimeToInstant` interprets "2026-10-05 10:00"
 * as institution-local wall-clock time, so a quiz scheduled for 10:00 NPT opens
 * at 10:00 NPT regardless of where the browser is. The resolved zone is cached
 * and can be changed by institutional configuration.
 */

export const DEFAULT_INSTITUTION_TIME_ZONE =
  process.env.COLLEGEOS_INSTITUTION_TIME_ZONE || "Asia/Kathmandu";

const TIME_ZONE_SETTING_KEY = "institution.timezone";
const CACHE_TTL_MS = 60 * 1000;

let cache = { value: DEFAULT_INSTITUTION_TIME_ZONE, expiresAt: 0 };

/** Clears the cached zone; used when institutional settings change. */
export function resetInstitutionClockCache() {
  cache = { value: DEFAULT_INSTITUTION_TIME_ZONE, expiresAt: 0 };
}

/** IANA zone the institution operates in, e.g. "Asia/Kathmandu". */
export async function getInstitutionTimeZone() {
  if (cache.expiresAt > Date.now()) return cache.value;
  try {
    const setting = await InstitutionSetting.findOne({
      settingKey: TIME_ZONE_SETTING_KEY,
    }).lean();
    const configured = String(setting?.settingValue || "").trim();
    const zone = isValidTimeZone(configured)
      ? configured
      : DEFAULT_INSTITUTION_TIME_ZONE;
    cache = { value: zone, expiresAt: Date.now() + CACHE_TTL_MS };
    return zone;
  } catch {
    // Institution settings are not reachable (first boot, or a transient
    // database failure): scheduling must still work against the configured
    // default rather than failing open or throwing mid-quiz.
    return DEFAULT_INSTITUTION_TIME_ZONE;
  }
}

function isValidTimeZone(zone) {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Offset label such as "NPT UTC+5:45", shown beside scheduled times. */
export async function getInstitutionZoneLabel() {
  const zone = await getInstitutionTimeZone();
  return `${zone.replace("Asia/", "")} ${describeOffset(zone)}`;
}

function describeOffset(zone, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const name = parts.find((part) => part.type === "timeZoneName")?.value || "";
  const match = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return "UTC";
  const sign = match[1];
  const hours = Math.abs(Number(match[1]));
  const minutes = Number(match[2] || 0);
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

/** Offset in minutes for the institution zone at a given instant. */
export function zoneOffsetMinutes(zone, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const read = (type) =>
    Number(parts.find((part) => part.type === type)?.value || "0");
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") === 24 ? 0 : read("hour"),
    read("minute"),
    read("second"),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Converts institution-local wall-clock input into an absolute instant.
 *
 * Accepts `"2026-10-05T10:00"` (local to the institution) or a full ISO string
 * with an offset/zone, which is passed through untouched. The returned Date is
 * what the database stores, and therefore what the server compares against.
 */
export async function zonedTimeToInstant(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  const zone = await getInstitutionTimeZone();

  // An explicit offset (Z or +HH:mm) is unambiguous — honour it as written.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!match) {
    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const naiveUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  // Two passes: the first offset is taken at the naive instant, the second
  // corrects for any offset change across a DST boundary.
  let offset = zoneOffsetMinutes(zone, new Date(naiveUtc));
  let instant = new Date(naiveUtc - offset * 60000);
  offset = zoneOffsetMinutes(zone, instant);
  instant = new Date(naiveUtc - offset * 60000);
  return instant;
}

/**
 * Server-authoritative time payload for a quiz countdown.
 *
 * The browser uses `serverNow` to derive the offset from its own clock and then
 * counts down locally, so the countdown is smooth while still being anchored to
 * the server. Correctness never depends on it: submitting after the deadline is
 * refused by the server regardless of what the browser believes.
 */
export async function clockPayload(extra = {}) {
  const now = Date.now();
  return {
    serverNow: new Date(now).toISOString(),
    serverEpochMs: now,
    timeZone: await getInstitutionTimeZone(),
    timeZoneLabel: await getInstitutionZoneLabel(),
    ...extra,
  };
}

/** Formats an instant for an audit trail line, in institution time. */
export async function formatForAudit(value) {
  if (!value) return "unscheduled";
  const zone = await getInstitutionTimeZone();
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}