import {
  verifyToken,
  getSessionByToken,
  getStudentById,
  getUserById,
  getUserRoles,
  authorizeUser,
} from "../db.js";
import { hasPermission } from "../permissions/catalog.js";

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const payload = verifyToken(token);
    const session = await getSessionByToken(token);
    const user = await getUserById(payload.userId);
    if (!user || !session || String(session.user || session.user_id) !== String(user._id || user.id)) {
      return res.status(401).json({ error: "Invalid session." });
    }
    const accountStatus = user.accountStatus || user.account_status;
    if (["SUSPENDED", "DISABLED", "ARCHIVED"].includes(accountStatus)) {
      return res.status(403).json({ error: "This account is not active." });
    }

    req.user = user;
    req.session = session;
    req.token = token;
    const allowedDuringCredentialChange = [
      "/api/auth/me",
      "/api/auth/change-password",
      "/api/auth/logout",
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
      return res.status(401).json({ error: "Temporary credential expired." });
    }
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired session." });
  }
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
