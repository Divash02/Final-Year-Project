import { InstitutionSetting } from "../models/index.js";

/**
 * Canonical CollegeOS password policy.
 *
 * This is the single source of truth for password requirements. Every entry
 * point that accepts or validates a user-chosen password — the mandatory
 * first-login change, the self-service change, admin re-provisioning and any
 * future reset flow — must route through `validatePasswordPolicy` so the rules
 * never drift between flows.
 *
 * The backend is authoritative. The frontend mirrors these constants for live
 * feedback only and re-validates on submit through this same rule set.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt truncates input at 72 bytes. Hashing beyond that silently accepts a
 * longer password that cannot be distinguished from its 72-byte prefix, so it
 * is treated here as a technical input limit rather than a policy preference.
 */
export const PASSWORD_MAX_BYTES = 72;

export const UPPERCASE_REGEX = /[A-Z]/;
export const LOWERCASE_REGEX = /[a-z]/;
export const DIGIT_REGEX = /[0-9]/;

/**
 * Special characters users are allowed to use. A deliberately broad set so the
 * policy never artificially restricts composition; any punctuation outside this
 * set is still accepted because the live `SPECIAL_CHAR_REGEX` is inclusive.
 */
export const SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`";

/**
 * Matches any non-alphanumeric, non-whitespace character. Inclusive on
 * purpose: "special character" means "not a letter or digit" rather than a
 * tiny curated subset.
 */
export const SPECIAL_CHAR_REGEX = /[^A-Za-z0-9\s]/;

/** Resolves the enforced minimum length for a user-chosen password. The
 * institution may raise it above the universal floor via the
 * `minimum_password_length` setting, but it can never be lowered below it. */
export async function getMinimumPasswordLength() {
  try {
    const setting = await InstitutionSetting.findOne({
      settingKey: "minimum_password_length",
    });
    return Math.max(PASSWORD_MIN_LENGTH, Number(setting?.settingValue) || PASSWORD_MIN_LENGTH);
  } catch {
    return PASSWORD_MIN_LENGTH;
  }
}

/**
 * Validates a candidate password against the universal CollegeOS policy.
 *
 * Returns `{ valid, errors }` where `errors` is an array of safe, human
 * messages keyed by `field`. Passwords are never echoed back, never logged,
 * and no hash or internal detail is exposed.
 *
 * @param {string} password - The plain-text candidate.
 * @param {{ minimumLength?: number }} [options]
 * @returns {{ valid: boolean, errors: { field: string; message: string }[] }}
 */
export function validatePasswordPolicy(password, { minimumLength = PASSWORD_MIN_LENGTH } = {}) {
  const errors = [];
  const value = typeof password === "string" ? password : "";
  const length = value.length;

  if (length < minimumLength) {
    errors.push({
      field: "newPassword",
      message: `Must be at least ${minimumLength} characters long.`,
    });
  }
  if (!UPPERCASE_REGEX.test(value)) {
    errors.push({ field: "newPassword", message: "At least one uppercase letter (A-Z)." });
  }
  if (!LOWERCASE_REGEX.test(value)) {
    errors.push({ field: "newPassword", message: "At least one lowercase letter (a-z)." });
  }
  if (!DIGIT_REGEX.test(value)) {
    errors.push({ field: "newPassword", message: "At least one number (0-9)." });
  }
  if (!SPECIAL_CHAR_REGEX.test(value)) {
    errors.push({ field: "newPassword", message: "At least one special character." });
  }
  if (Buffer.byteLength(value, "utf8") > PASSWORD_MAX_BYTES) {
    errors.push({
      field: "newPassword",
      message: `Must not exceed ${PASSWORD_MAX_BYTES} UTF-8 bytes.`,
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Convenience predicate used by routes that just need a boolean and the
 * reason text, e.g. for log/audit context. Never throws.
 */
export function isPasswordPolicyCompliant(password, options) {
  return validatePasswordPolicy(password, options).valid;
}
