/**
 * Database facade.
 *
 * `db.js` remains the import surface existing modules use, but the
 * responsibilities behind it are now split into focused services:
 *
 *   - connection lifecycle ............ config/database.js
 *   - identity, roles, credentials .... services/identityService.js
 *   - session lifecycle & lockout ..... services/sessionService.js
 *   - audit trail ..................... services/auditService.js
 *   - dashboard statistics ............ services/analyticsSummaryService.js
 *
 * This file intentionally contains no business logic of its own: it wires the
 * connection to the bootstrap identity seed and re-exports the services so no
 * call site has to change.
 */

import { connectDatabase, mongoose } from "./config/database.js";
import { seedBaseUsers } from "./services/identityService.js";

export { getDbConnection as getDb } from "./config/database.js";
export { connectDatabase, disconnectDatabase, getConnectionHealth, mongoose } from "./config/database.js";

export { hashPassword, verifyPassword } from "./utils/password.js";
export { signToken, verifyToken, hashToken } from "./utils/token.js";

export {
  createSession,
  classifySession,
  getSessionByToken,
  forceTouchSession,
  revokeSession,
  revokeUserSessions,
  touchSession,
  createLoginAttemptKey,
  isLoginLocked,
  recordLoginFailure,
  clearLoginFailures,
} from "./services/sessionService.js";

export {
  getInstitutionEmailDomain,
  getUserByEmail,
  getUserById,
  getUserRoles,
  userToPublic,
  authorizeUser,
  ensureUserOwnsResource,
  getStudentByUserId,
  getStudentById,
  migrateConsolidatedRoles,
  seedBaseUsers,
  createPasswordResetToken,
  getPasswordResetToken,
  getPasswordResetTokenByHash,
  invalidatePasswordResetTokens,
} from "./services/identityService.js";

export { logAudit, recordInstitutionEvent } from "./services/auditService.js";
export { getAnalyticsSummary } from "./services/analyticsSummaryService.js";

/**
 * Connects to MongoDB and ensures the bootstrap Super Admin exists.
 * No institutional records are fabricated here.
 */
export async function initializeDatabase() {
  await connectDatabase();
  await seedBaseUsers();
  return true;
}

export async function initializeServerState() {
  await initializeDatabase();
  return true;
}