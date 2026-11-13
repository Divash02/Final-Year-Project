import {
  verifyToken,
  classifySession,
  getUserById,
  touchSession,
  logAudit,
} from "../db.js";
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

export { SESSION_CODES };

/**
 * Authentication middleware: verifies the bearer token, validates the session,
 * checks account status, password/credential expiry, and attaches `req.user`,
 * `req.session` and `req.token`. Does not perform any authorization checks.
 */
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

  const roles = user.roles ? user.roles : [];
  const policy = getSessionPolicy(roles[0] || "student");

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
