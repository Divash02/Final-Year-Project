import mongoose from "mongoose";

/**
 * CollegeOS academic configuration.
 *
 * Single source of truth for the only authorised academic program and class
 * section. Every backend module that accepts program/section input must
 * validate against these constants instead of hardcoding values.
 *
 * CollegeOS operates with exactly one active academic program (BSc IT) and
 * exactly one active class section (A25). Any other value is rejected.
 */
export const VALID_PROGRAMS = ["BSCIT"];
export const VALID_SECTIONS = ["A25"];
export const VALID_ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];
export const DEFAULT_PROGRAM = "BScIT";
export const DEFAULT_SECTION = "A25";
export const DEFAULT_ACADEMIC_YEAR = "2025/2026";

export const PROGRAM_NAME = "BSc IT";
export const PROGRAM_DEPARTMENT = "Computer Science and IT";

export function isValidProgram(value) {
  return VALID_PROGRAMS.includes(String(value || "").trim().toUpperCase());
}

export function isValidSection(value) {
  return VALID_SECTIONS.includes(String(value || "").trim().toUpperCase());
}

export function normalizeProgram(value) {
  return String(value || "").trim().toUpperCase() || null;
}

export function normalizeSection(value) {
  return String(value || "").trim().toUpperCase() || null;
}

export function requireValidProgram(value, field = "program") {
  const normalized = normalizeProgram(value);
  if (!normalized || !isValidProgram(normalized)) {
    const err = new Error(`${field} must be one of: ${VALID_PROGRAMS.join(", ")}.`);
    err.status = 400;
    err.field = field;
    throw err;
  }
  return normalized;
}

export function requireValidSection(value, field = "section") {
  const normalized = normalizeSection(value);
  if (!normalized || !isValidSection(normalized)) {
    const err = new Error(`${field} must be one of: ${VALID_SECTIONS.join(", ")}.`);
    err.status = 400;
    err.field = field;
    throw err;
  }
  return normalized;
}

const ACADEMIC_YEAR_REGEX = /^\d{4}\/\d{4}$/;

export function isValidAcademicYear(value) {
  const normalized = String(value || "").trim();
  return ACADEMIC_YEAR_REGEX.test(normalized) && VALID_ACADEMIC_YEARS.includes(normalized);
}

export function normalizeAcademicYear(value) {
  return String(value || "").trim() || null;
}

export function requireValidAcademicYear(value, field = "academicYear") {
  const normalized = normalizeAcademicYear(value);
  if (!normalized) {
    const err = new Error(`${field} is required.`);
    err.status = 400;
    err.field = field;
    throw err;
  }
  if (!ACADEMIC_YEAR_REGEX.test(normalized)) {
    const err = new Error(`${field} must be a valid English academic year in YYYY/YYYY format (e.g. 2025/2026). Nepali calendar years such as 2083/84 are not permitted.`);
    err.status = 400;
    err.field = field;
    throw err;
  }
  if (!VALID_ACADEMIC_YEARS.includes(normalized)) {
    const err = new Error(`${field} must be one of: ${VALID_ACADEMIC_YEARS.join(", ")}.`);
    err.status = 400;
    err.field = field;
    throw err;
  }
  return normalized;
}

/** Mongoose validator helper for program/section string fields. */
export function academicStringValidator(value, field) {
  if (value == null || String(value).trim().length === 0) return true;
  const normalized = String(value).trim().toUpperCase();
  if (field === "program") return isValidProgram(normalized);
  if (field === "section") return isValidSection(normalized);
  return true;
}

export const ACADEMIC_STRING_VALIDATION = {
  program: {
    validator: function (v) { return academicStringValidator(v, "program"); },
    message: "Program must be BSc IT.",
  },
  section: {
    validator: function (v) { return academicStringValidator(v, "section"); },
    message: "Section must be A25.",
  },
};

export { mongoose };
