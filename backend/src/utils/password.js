import bcrypt from "bcryptjs";

/**
 * Password hashing and verification.
 *
 * Kept separate from database initialization so the identity layer owns
 * credential handling and the connection layer owns persistence only.
 */

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compareSync(password, hash);
}