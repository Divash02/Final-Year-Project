import { getStudentById, authorizeUser } from "../db.js";
import { hasPermission } from "../permissions/catalog.js";

/**
 * Authorization middleware. These run *after* authentication has populated
 * `req.user`. They check role-based permissions and object-level ownership,
 * never session validity.
 */

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
    const roles = req.user.roles || [];
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
    const userRoles = req.user.roles || [];
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
