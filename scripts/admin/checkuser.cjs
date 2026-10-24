/**
 * Read-only administrative inspection of a single CollegeOS account.
 *
 * Usage:
 *   node scripts/admin/checkuser.cjs
 *
 * Reads the configured bootstrap Super Admin (or COLLEGEOS_CHECK_EMAIL /
 * COLLEGEOS_CHECK_PASSWORD overrides) and prints its public profile fields plus
 * a truncated password-hash preview. It never modifies the database and never
 * prints the full password hash.
 */
const { initializeDatabase, getUserByEmail, verifyPassword } = require("../../backend/src/db.js");

const EMAIL = process.env.COLLEGEOS_CHECK_EMAIL || `admin@${process.env.INSTITUTION_EMAIL_DOMAIN || "techspire.edu.np"}`;
const CHECK_PASSWORD = process.env.COLLEGEOS_CHECK_PASSWORD || "Nepal@123";

(async () => {
  await initializeDatabase();
  const u = await getUserByEmail(EMAIL);
  console.log("Found user:", !!u);
  if (u) {
    console.log(JSON.stringify({
      email: u.email,
      accountStatus: u.accountStatus,
      mustChangePassword: u.mustChangePassword,
      credentialExpiresAt: u.credentialExpiresAt,
      roles: u.roles,
      passwordHash: (u.passwordHash || "").slice(0, 30),
    }, null, 2));
    console.log("verifyPassword(checkPassword):", verifyPassword(CHECK_PASSWORD, u.passwordHash));
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });