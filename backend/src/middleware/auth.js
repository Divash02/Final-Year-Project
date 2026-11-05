import {
  verifyToken,
  getSessionByToken,
  classifySession,
  getStudentById,
  getUserById,
  getUserRoles,
  authorizeUser,
  touchSession,
  forceTouchSession,
  logAudit,
} from "../db.js";
import { hasPermission } from "../permissions/catalog.js";
import { getSessionPolicy } from "../config/sessionSecurity.js";

/**
 * Structured session failure codes so the frontend (and API clients) can
 * distinguish why a request was rejected instead of parsing error text.
 */
const SESSION_CODES = {
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  SESSION_INVALID: "SESSION_INVALID",
  SESSION_REVOKED: "SESSION_REVOKED",
  SESSION_EXPIRED_ABSOLUTE: "SESSION_EXPIRED_ABSOLUTE",
  SESSION_EXPIRED_INACTIVITY: "SESSION_EXPIRED_INACTIVITY",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  TEMPORARY_CREDENTIAL_EXPIRED: "TEMPORARY_CREDENTIAL_EXPIRED",
};

function sessionFailure(res, code, details) {
  void logAudit({
    action: code,
    module: "auth",
    details,
  });
  const messages = {
    [SESSION_CODES.TOKEN_EXPIRED]: "Your access token has expired. Please sign in again.",
    [SESSION_CODES.TOKEN_INVALID]: "Invalid or expired session.",
    [SESSION_CODES.SESSION_INVALID]: "Invalid session.",
    [SESSION_CODES.SESSION_REVOKED]: "This session has been revoked. Please sign in again.",
    [SESSION_CODES.SESSION_EXPIRED_ABSOLUTE]:
      "Your session has reached its maximum lifetime. Please sign in again.",
    [SESSION_CODES.SESSION_EXPIRED_INACTIVITY]:
      "Your session expired due to inactivity. Please sign in again.",
    [SESSION_CODES.ACCOUNT_DISABLED]: "This account is not active.",
    [SESSION_CODES.TEMPORARY_CREDENTIAL_EXPIRED]: "Temporary credential expired.",
  };
  return res.status(401).json({ error: messages[code] || messages[SESSION_CODES.TOKEN_INVALID], code });
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required.", code: "TOKEN_MISSING" });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    const code =
      error && error.name === "TokenExpiredError"
        ? SESSION_CODES.TOKEN_EXPIRED
        : SESSION_CODES.TOKEN_INVALID;
    return sessionFailure(res, code, `Token verification failed: ${code}.`);
  }

  const classification = await classifySession(token);
  const session = classification.session;

  if (!session) {
    return sessionFailure(
      res,
      SESSION_CODES.SESSION_INVALID,
      "No session record found for the presented token.",
    );
  }

  const user = await getUserById(payload.userId);
  if (!user || String(session.user || session.user_id) !== String(user._id || user.id)) {
    return sessionFailure(
      res,
      SESSION_CODES.SESSION_INVALID,
      "The token does not belong to a known account.",
    );
  }

  switch (classification.status) {
    case "REVOKED":
      return sessionFailure(
        res,
        SESSION_CODES.SESSION_REVOKED,
        "Session was revoked by the user or an administrator.",
      );
    case "EXPIRED_ABSOLUTE":
      return sessionFailure(
        res,
        SESSION_CODES.SESSION_EXPIRED_ABSOLUTE,
        "Session reached its absolute lifetime.",
      );
    case "MISSING":
    case "ACTIVE":
      break;
    default:
      return sessionFailure(res, SESSION_CODES.SESSION_INVALID, "Unrecognised session state.");
  }

  const roles = getUserRoles(user);
  const policy = getSessionPolicy(roles[0]);

  const lastActiveAt = session.lastActiveAt
    ? new Date(session.lastActiveAt).getTime()
    : 0;
  if (
    lastActiveAt > 0 &&
    Date.now() - lastActiveAt > policy.inactivityTimeoutMs
  ) {
    return sessionFailure(
      res,
      SESSION_CODES.SESSION_EXPIRED_INACTIVITY,
      "No meaningful activity recorded within the inactivity timeout.",
    );
  }

  const accountStatus = user.accountStatus || user.account_status;
  if (["SUSPENDED", "DISABLED", "ARCHIVED"].includes(accountStatus)) {
    return res.status(403).json({
      error: "This account is not active.",
      code: SESSION_CODES.ACCOUNT_DISABLED,
    });
  }

  req.user = user;
  req.session = session;
  req.token = token;
  await touchSession(
    session._id,
    {
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    },
    session,
  );
  const allowedDuringCredentialChange = [
    "/api/auth/me",
    "/api/auth/change-password",
    "/api/auth/logout",
    "/api/auth/sessions/renew",
  ];
  const mustChangePassword = Boolean(user.mustChangePassword || user.must_change_password);
  if (
    mustChangePassword &&
    !allowedDuringCredentialChange.includes(req.path)
  ) {
    return res.status(403).json({
      error: "Password change required.",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  }
  const expiresAt = user.credentialExpiresAt || user.credential_expires_at;
  if (
    expiresAt &&
    Date.parse(expiresAt) <= Date.now()
  ) {
    return sessionFailure(
      res,
      SESSION_CODES.TEMPORARY_CREDENTIAL_EXPIRED,
      "Temporary credential expired.",
    );
  }
  next();
}

export function requireStudentScope(parameterName = "id") {
  return async (req, res, next) => {
    const student = await getStudentById(req.params[parameterName]);
    if (!student) return res.status(404).json({ error: "Student not found." });
    const studentUserId = String(student.user?._id || student.user || student.user_id);
    const currentUserId = String(req.user._id || req.user.id);
    if (studentUserId === currentUserId) {
      req.student = student;
      return next();
    }
    if (authorizeUser(req.user, ["registrar", "super_admin"])) {
      req.student = student;
      return next();
    }
    return res.status(404).json({ error: "Student not found." });
  };
}

export function requireRole(requiredRoles) {
  return (req, res, next) => {
    const roles = getUserRoles(req.user);
    const allowed = Array.isArray(requiredRoles)
      ? requiredRoles
      : [requiredRoles];
    if (!roles.some((role) => allowed.includes(role))) {
      return res.status(403).json({ error: "Access denied." });
    }
    next();
  };
}

export function requirePermission(permissionOrPermissions) {
  return (req, res, next) => {
    const permissions = Array.isArray(permissionOrPermissions)
      ? permissionOrPermissions
      : [permissionOrPermissions];
    const userRoles = getUserRoles(req.user);
    const hasAny = permissions.some((perm) => hasPermission(userRoles, perm));
    if (!hasAny) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }
    next();
  };
}

export function requireOwnStudent(req, res, next) {
  const requestedUserId = String(req.params.userId || req.params.id || "");
  if (!requestedUserId) {
    return res.status(400).json({ error: "Missing user id." });
  }

  const currentUserId = String(req.user._id || req.user.id);
  if (
    currentUserId !== requestedUserId &&
    !authorizeUser(req.user, ["faculty", "registrar", "super_admin"])
  ) {
    return res.status(403).json({ error: "Access denied." });
  }

  next();
}
