import mongoose from "mongoose";
import { validationError, badRequest } from "./apiError.js";

/**
 * Shared request validation.
 *
 * Validation lives here rather than in each route so a field behaves the same
 * wherever it appears, and so every rejection reaches the browser as a 422 with
 * the offending field named — instead of surfacing later as a Mongo cast
 * failure or, worse, silently storing an empty string.
 */

export function requireString(value, field, { max = 255, min = 1 } = {}) {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (text.length < min) {
    throw validationError(`${field} is required.`, [{ field, message: "This field is required." }]);
  }
  if (text.length > max) {
    throw validationError(`${field} must be ${max} characters or fewer.`, [
      { field, message: `Maximum ${max} characters.` },
    ]);
  }
  return text;
}

export function optionalString(value, field, { max = 255 } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) {
    throw validationError(`${field} must be ${max} characters or fewer.`, [
      { field, message: `Maximum ${max} characters.` },
    ]);
  }
  return text;
}

export function requireEnum(value, field, allowed, { upper = false } = {}) {
  const raw = typeof value === "string" ? value.trim() : value;
  const candidate = upper && typeof raw === "string" ? raw.toUpperCase() : raw;
  if (!allowed.includes(candidate)) {
    throw validationError(`${field} must be one of: ${allowed.join(", ")}.`, [
      { field, message: `Allowed values: ${allowed.join(", ")}.` },
    ]);
  }
  return candidate;
}

export function optionalEnum(value, field, allowed, options = {}) {
  if (value === undefined || value === null || value === "") return null;
  return requireEnum(value, field, allowed, options);
}

/**
 * Reads a checkbox value from either a JSON body (`true`) or a form post
 * (`"true"` / `"on"`), because the same endpoints accept both a JSON payload and
 * a multipart upload.
 */
export function optionalBoolean(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;
  throw validationError(`${field} must be true or false.`, [
    { field, message: "Choose yes or no." },
  ]);
}

export function toInt(value, field, { min = null, max = null, fallback = null } = {}) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== null) return fallback;
    throw validationError(`${field} must be a whole number.`, [
      { field, message: "Enter a whole number." },
    ]);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw validationError(`${field} must be a whole number.`, [
      { field, message: "Enter a whole number." },
    ]);
  }
  const rounded = Math.trunc(parsed);
  if (min !== null && rounded < min) {
    throw validationError(`${field} must be ${min} or more.`, [
      { field, message: `Minimum ${min}.` },
    ]);
  }
  if (max !== null && rounded > max) {
    throw validationError(`${field} must be ${max} or less.`, [
      { field, message: `Maximum ${max}.` },
    ]);
  }
  return rounded;
}

export function toNumber(value, field, { min = null, max = null, fallback = null } = {}) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== null) return fallback;
    throw validationError(`${field} must be a number.`, [
      { field, message: "Enter a number." },
    ]);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw validationError(`${field} must be a number.`, [
      { field, message: "Enter a number." },
    ]);
  }
  if (min !== null && parsed < min) {
    throw validationError(`${field} must be ${min} or more.`, [
      { field, message: `Minimum ${min}.` },
    ]);
  }
  if (max !== null && parsed > max) {
    throw validationError(`${field} must be ${max} or less.`, [
      { field, message: `Maximum ${max}.` },
    ]);
  }
  return parsed;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates a `YYYY-MM-DD` calendar date, rejecting impossible days. */
export function requireIsoDate(value, field) {
  const text = requireString(value, field, { max: 10 });
  if (!ISO_DATE.test(text)) {
    throw validationError(`${field} must be a date in YYYY-MM-DD format.`, [
      { field, message: "Use YYYY-MM-DD." },
    ]);
  }
  const [year, month, day] = text.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw validationError(`${field} is not a real calendar date.`, [
      { field, message: "Choose a valid date." },
    ]);
  }
  return text;
}

export function optionalTime(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!TIME_OF_DAY.test(text)) {
    throw validationError(`${field} must be a 24-hour time such as 10:30.`, [
      { field, message: "Use HH:mm." },
    ]);
  }
  return text;
}

export function requireEmail(value, field = "Email") {
  const text = requireString(value, field, { max: 180 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) {
    throw validationError(`${field} must be a valid email address.`, [
      { field, message: "Enter a valid email address." },
    ]);
  }
  return text;
}

/** Parses list input from JSON arrays or comma-separated form fields. */
export function toStringList(value, { upper = false, maxItems = 200 } = {}) {
  let source = value;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        source = JSON.parse(trimmed);
      } catch {
        source = trimmed.split(",");
      }
    } else {
      source = trimmed.split(",");
    }
  }
  if (!Array.isArray(source)) source = source == null ? [] : [source];
  const list = source
    .map((entry) => (entry == null ? "" : String(entry).trim()))
    .filter(Boolean)
    .map((entry) => (upper ? entry.toUpperCase() : entry));
  return Array.from(new Set(list)).slice(0, maxItems);
}

export function toNumberList(value, { maxItems = 50 } = {}) {
  const list = toStringList(value);
  return Array.from(
    new Set(
      list
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry)),
    ),
  ).slice(0, maxItems);
}

/** Parses integer list input (JSON array, repeated query params, or CSV). */
export function toIntList(
  value,
  field,
  { min = null, max = null, maxItems = 50, fallback = [] } = {},
) {
  if (value === undefined || value === null || value === "") return [...fallback];
  const source = Array.isArray(value) ? value : toStringList(value);
  const list = [];
  for (const entry of source) {
    if (entry === "" || entry === null || entry === undefined) continue;
    const parsed = toInt(entry, field, { min, max });
    if (!list.includes(parsed)) list.push(parsed);
    if (list.length >= maxItems) break;
  }
  return list;
}

/** Server-side pagination. Never faked in the browser. */
export function readPagination(query, { defaultLimit = 25, maxLimit = 200 } = {}) {
  const limit = Math.min(
    Math.max(toInt(query.limit, "limit", { min: 1, max: maxLimit, fallback: defaultLimit }), 1),
    maxLimit,
  );
  const page = Math.max(toInt(query.page, "page", { min: 1, fallback: 1 }), 1);
  return { limit, page, skip: (page - 1) * limit };
}

/** Validates a document identifier before it reaches Mongo. */
export function requireObjectId(value, field) {
  const text = String(value ?? "").trim();
  if (!mongoose.Types.ObjectId.isValid(text)) {
    throw badRequest(`Invalid ${field}: expected a 24-character session ID (got "${text}").`);
  }
  return text;
}

/** Resolves an ObjectId reference that may legitimately be null. */
export function optionalObjectId(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return requireObjectId(value, field);
}

export function requireDate(value, field) {
  const text = requireString(value, field, { max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError(`${field} must be a valid date and time.`, [
      { field, message: "Enter a valid date and time." },
    ]);
  }
  return parsed;
}
