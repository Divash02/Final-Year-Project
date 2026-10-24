import { randomBytes } from "node:crypto";
import { SPECIAL_CHARACTERS } from "../services/passwordPolicy.js";

/**
 * Temporary credential generator for newly provisioned accounts.
 *
 * Temporary passwords are transitional (replaced on first login), so they are
 * held to a fixed 12-character floor regardless of the user-password policy
 * floor — this keeps bootstrap/administrator-provisioned credentials strong even
 * after the universal policy moved to 8. The plaintext is returned once to the
 * provisioning administrator and is never stored or logged.
 */
export function createTemporaryPassword(minimumLength = 12) {
  const effectiveMin = Math.max(Number(minimumLength) || 0, 12);
  const specials = SPECIAL_CHARACTERS;
  let password;
  do {
    password = randomBytes(Math.ceil((effectiveMin * 3) / 4)).toString("base64url");
  } while (
    password.length < effectiveMin ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password)
  );

  // Guarantee at least one special character so the temporary credential is
  // materially stronger than a base64url-only string.
  return `${password}${specials[Math.floor(Math.random() * specials.length)]}`;
}
