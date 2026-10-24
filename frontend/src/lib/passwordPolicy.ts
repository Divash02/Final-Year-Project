/**
 * Canonical CollegeOS password policy (frontend mirror).
 *
 * The authoritative, security-relevant rules live in the backend at
 * `backend/src/services/passwordPolicy.js` and are re-enforced on every submit.
 * This module mirrors those exact rules so the UI can give *live* feedback
 * (requirement checklist, strength meter) without round-tripping to the server,
 * and it is the single source the rest of the frontend imports — no component
 * owns its own copy of the rules.
 *
 * Rules:
 *   - Minimum 8 characters (may be raised by institution settings)
 *   - At least one uppercase letter
 *   - At least one lowercase letter
 *   - At least one number
 *   - At least one special character (any non-alphanumeric, non-space)
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export const UPPERCASE_REGEX = /[A-Z]/;
export const LOWERCASE_REGEX = /[a-z]/;
export const DIGIT_REGEX = /[0-9]/;
export const SPECIAL_CHAR_REGEX = /[^A-Za-z0-9\s]/;

export const SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`";

export interface PasswordRequirement {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

/** Ordered list of the live requirement checks shown while typing. */
export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
  },
  { id: "upper", label: "One uppercase letter (A-Z)", test: (value) => UPPERCASE_REGEX.test(value) },
  { id: "lower", label: "One lowercase letter (a-z)", test: (value) => LOWERCASE_REGEX.test(value) },
  { id: "digit", label: "One number (0-9)", test: (value) => DIGIT_REGEX.test(value) },
  { id: "special", label: "One special character", test: (value) => SPECIAL_CHAR_REGEX.test(value) },
];

export interface PasswordPolicyError {
  field: string;
  message: string;
}

export interface PasswordPolicyResult {
  valid: boolean;
  errors: PasswordPolicyError[];
}

/** Field name the backend attributes policy errors to (see auth.js change-password). */
export const ERROR_FIELD = "newPassword";

/**
 * Returns the list of requirement errors that the candidate fails, mirroring
 * `validatePasswordPolicy` in `backend/src/services/passwordPolicy.js` exactly —
 * same shape (`{ field, message }`) and same message text so the live UI and
 * the server never disagree on what is allowed or how a violation is described.
 */
export function validatePassword(
  password: string,
  { minimumLength = PASSWORD_MIN_LENGTH } = {},
): PasswordPolicyResult {
  const value = typeof password === "string" ? password : "";
  const byteLength = new TextEncoder().encode(value).length;
  const errors: PasswordPolicyError[] = [];

  const add = (message: string) => errors.push({ field: ERROR_FIELD, message });

  if (value.length < minimumLength) {
    add(`Must be at least ${minimumLength} characters long.`);
  }
  if (!UPPERCASE_REGEX.test(value)) add("At least one uppercase letter (A-Z).");
  if (!LOWERCASE_REGEX.test(value)) add("At least one lowercase letter (a-z).");
  if (!DIGIT_REGEX.test(value)) add("At least one number (0-9).");
  if (!SPECIAL_CHAR_REGEX.test(value)) add("At least one special character.");
  if (byteLength > PASSWORD_MAX_BYTES) {
    add(`Must not exceed ${PASSWORD_MAX_BYTES} UTF-8 bytes.`);
  }

  return { valid: errors.length === 0, errors };
}

export type PasswordStrength = "very-weak" | "weak" | "fair" | "good" | "strong";

export interface PasswordStrengthScore {
  strength: PasswordStrength;
  label: string;
  score: number;
}

export const PASSWORD_STRENGTH_LABELS: Record<PasswordStrength, string> = {
  "very-weak": "Very Weak",
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

/**
 * Substrings/patterns that are so common they should never read as "strong",
 * even when they satisfy the character rules (e.g. `Password1!`).
 */
const COMMON_WEAK_PATTERNS: RegExp[] = [
  /password/i,
  /qwerty/i,
  /123456/,
  /abc123/i,
  /letmein/i,
  /welcome/i,
  /admin/,
  /iloveyou/i,
  /monkey/i,
  /passw0rd/i,
];

/** Three or more sequential ascending/descending letters or digits. */
function hasSequentialRun(value: string): boolean {
  const lower = value.toLowerCase();
  for (let i = 0; i <= lower.length - 3; i++) {
    const a = lower.charCodeAt(i);
    const b = lower.charCodeAt(i + 1);
    const c = lower.charCodeAt(i + 2);
    // same direction, step of 1 on either letters or digits only
    if (b - a === 1 && c - b === 1 && isAsciiRun(lower, i, 3)) return true;
    if (a - b === 1 && b - c === 1 && isAsciiRun(lower, i, 3)) return true;
  }
  return false;
}

function isAsciiRun(s: string, start: number, len: number): boolean {
  for (let i = start; i < start + len; i++) {
    const ch = s.charCodeAt(i);
    const isDigit = ch >= 48 && ch <= 57;
    const isLetter = (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122);
    if (!isDigit && !isLetter) return false;
  }
  return true;
}

/** Three identical characters in a row, e.g. "aaa". */
function hasRepeatedRun(value: string): boolean {
  for (let i = 0; i <= value.length - 3; i++) {
    if (value[i] === value[i + 1] && value[i] === value[i + 2]) return true;
  }
  return false;
}

/**
 * Meaningful strength scoring: length, character variety, and penalties for
 * sequences, repetitions and common passwords — not length alone.
 */
export function scorePasswordStrength(
  password: string,
): PasswordStrengthScore {
  const value = typeof password === "string" ? password : "";
  if (value.length === 0) {
    return { strength: "very-weak", label: PASSWORD_STRENGTH_LABELS["very-weak"], score: 0 };
  }

  const hasLower = LOWERCASE_REGEX.test(value);
  const hasUpper = UPPERCASE_REGEX.test(value);
  const hasDigit = DIGIT_REGEX.test(value);
  const hasSpecial = SPECIAL_CHAR_REGEX.test(value);
  const variety = Number(hasLower) + Number(hasUpper) + Number(hasDigit) + Number(hasSpecial);

  let score = 0;
  if (value.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (variety >= 3) score += 1;
  if (variety === 4) score += 1;
  if (value.length >= 16 && variety >= 3) score += 1;

  const weakened =
    hasSequentialRun(value) ||
    hasRepeatedRun(value) ||
    COMMON_WEAK_PATTERNS.some((pattern) => pattern.test(value));

  if (weakened) score -= 1;
  if (variety < 2 && value.length < 12) score -= 1;

  // Common or sequential passwords never read above "fair".
  if (weakened && score > 2) score = 2;

  score = Math.max(0, Math.min(4, score));

  const strength: PasswordStrength =
    score === 0
      ? "very-weak"
      : score === 1
        ? "weak"
        : score === 2
          ? "fair"
          : score === 3
            ? "good"
            : "strong";

  return { strength, label: PASSWORD_STRENGTH_LABELS[strength], score };
}
