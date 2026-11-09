/**
 * Re-exports the split authentication and authorization middleware so all
 * existing route imports from `../middleware/auth.js` keep working without
 * modification. New code should import from the dedicated modules:
 *
 *   - `../middleware/authentication.js`  (requireAuth, SESSION_CODES)
 *   - `../middleware/authorization.js`   (requireRole, requirePermission,
 *                                        requireStudentScope, requireOwnStudent)
 */
export {
  SESSION_CODES,
  requireAuth,
} from "./authentication.js";
export {
  requireStudentScope,
  requireRole,
  requirePermission,
  requireOwnStudent,
} from "./authorization.js";
