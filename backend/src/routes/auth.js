import {
  hashPassword,
  verifyPassword,
  signToken,
  createSession,
  revokeSession,
  revokeUserSessions,
  createLoginAttemptKey,
  isLoginLocked,
  recordLoginFailure,
  clearLoginFailures,
  getUserByEmail,
  getUserById,
  getUserRoles,
  userToPublic,
  logAudit,
  getPasswordResetToken,
  invalidatePasswordResetTokens,
} from "../db.js";
import { User, Student } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getMinimumPasswordLength,
  validatePasswordPolicy,
} from "../services/passwordPolicy.js";
import { getPermissionsForRoles, CORE_ROLES } from "../permissions/catalog.js";

/**
 * Display metadata for the assignable roles. The authoritative list of roles
 * is `CORE_ROLES`; this map only supplies human-readable labels.
 */
const roleDefinitions = [
  { name: "super_admin", label: "Super Admin", description: "Highest institutional administrator" },
  { name: "campus_admin", label: "Campus Admin", description: "Campus operations administrator" },
  { name: "dean", label: "Dean", description: "Academic school leadership" },
  { name: "hod", label: "Department Head (HoD)", description: "Department leadership" },
  { name: "program_coordinator", label: "Program Coordinator", description: "Programme coordination" },
  { name: "registrar", label: "Registrar", description: "Academic records and enrolment" },
  { name: "exam_officer", label: "Exam Officer", description: "Examination operations" },
  { name: "finance_officer", label: "Finance Officer", description: "Finance staff" },
  { name: "faculty", label: "Faculty / Instructor", description: "Teaching and course delivery" },
  { name: "student", label: "Student Portal", description: "Student access" },
  { name: "parent", label: "Parent", description: "Parent/guardian access" },
];

export function registerAuthRoutes(app) {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const attemptKey = createLoginAttemptKey(email || "", req.ip);

      if (!email || !password) {
        return res
          .status(400)
          .json({ error: "Email and password are required." });
      }

      const user = await getUserByEmail(email);
      const isValidPassword = Boolean(
        user && verifyPassword(password, user.passwordHash || user.password_hash)
      );

      if (isLoginLocked(attemptKey) && !isValidPassword) {
        return res
          .status(429)
          .json({ error: "Too many login attempts. Try again later." });
      }

      const accountStatus = user?.accountStatus || user?.account_status;
      const expiresAt = user?.credentialExpiresAt || user?.credential_expires_at;

      if (
        !user ||
        !isValidPassword ||
        ["SUSPENDED", "DISABLED", "ARCHIVED"].includes(accountStatus) ||
        (expiresAt && Date.parse(expiresAt) <= Date.now())
      ) {
        recordLoginFailure(attemptKey);
        await logAudit({
          action: "LOGIN_FAILED",
          module: "auth",
          details: `Rejected login attempt for ${email}.`,
        });
        return res.status(401).json({ error: "Invalid credentials." });
      }

      clearLoginFailures(attemptKey);
      const effectiveRoles = getUserRoles(user);
      const isFirstLogin = !user.firstLoginAt;

      user.firstLoginAt = user.firstLoginAt || new Date();
      user.lastLoginAt = new Date();
      await user.save();

      const token = signToken({ userId: user._id.toString() });
      const sessionExpiry = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      await createSession(user._id, token, sessionExpiry);

      const publicUser = userToPublic(user);

      // Check if student profile has updated avatar
      if (effectiveRoles.includes("student")) {
        const student = await Student.findOne({ user: user._id });
        if (student && student.avatarUrl && !publicUser.avatarUrl) {
          publicUser.avatarUrl = student.avatarUrl;
        }
      }

      await logAudit({
        userId: user._id,
        action: "LOGIN_SUCCESS",
        module: "auth",
        details: `User signed in successfully: ${user.email}.`,
      });

      if (isFirstLogin) {
        await logAudit({
          userId: user._id,
          action: "FIRST_LOGIN",
          module: "auth",
          resource: "user",
          resourceId: user._id.toString(),
          details: "User completed first institutional authentication.",
        });
      }

      const activeRole = publicUser.activeRole || effectiveRoles[0] || "student";

      res.json({
        token,
        user: {
          ...publicUser,
          activeRole,
          permissions: getPermissionsForRoles([activeRole]),
        },
        mustChangePassword: Boolean(user.mustChangePassword),
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Authentication service error." });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body || {};
      const user = await User.findById(req.user._id || req.user.id);
      if (!user) return res.status(404).json({ error: "User not found." });

      const isAccountActivation = Boolean(
        user.mustChangePassword || user.accountStatus === "PASSIVE"
      );

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res
          .status(400)
          .json({ error: "Current password and new password are required." });
      }

      const minimumPasswordLength = await getMinimumPasswordLength();
      const policy = validatePasswordPolicy(newPassword, { minimumLength: minimumPasswordLength });
      if (!policy.valid) {
        return res.status(422).json({
          error: "Password does not meet the required security requirements.",
          code: "VALIDATION_FAILED",
          details: policy.errors,
        });
      }

      if (newPassword === currentPassword) {
        return res
          .status(400)
          .json({ error: "New password must differ from the current password." });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match." });
      }

      if (!verifyPassword(currentPassword, user.passwordHash)) {
        return res.status(401).json({ error: "Current password is incorrect." });
      }

      user.passwordHash = hashPassword(newPassword);
      user.mustChangePassword = false;
      user.credentialExpiresAt = null;
      user.passwordStatus = "PERMANENT";
      user.accountStatus = "ACTIVE";
      user.isActive = true;
      user.activatedAt = user.activatedAt || new Date();
      user.lastPasswordChangedAt = new Date();
      await user.save();

      await revokeUserSessions(user._id);

      const replacementToken = signToken({ userId: user._id.toString() });
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      await createSession(user._id, replacementToken, expiresAt);

      await logAudit({
        userId: user._id,
        action: "PASSWORD_CHANGED",
        module: "auth",
        resource: "user",
        resourceId: user._id.toString(),
        details: "User changed password successfully.",
      });

      if (isAccountActivation) {
        await logAudit({
          userId: user._id,
          action: "ACCOUNT_ACTIVATED",
          module: "auth",
          resource: "user",
          resourceId: user._id.toString(),
          details: "Account activated after successful password establishment.",
        });
      }

      const refreshedUser = userToPublic(user);
      const activeRole = refreshedUser.activeRole || refreshedUser.roles[0] || "student";

      res.json({
        success: true,
        token: replacementToken,
        user: {
          ...refreshedUser,
          activeRole,
          permissions: getPermissionsForRoles([activeRole]),
        },
      });
    } catch (err) {
      console.error("Change password error:", err);
      res.status(500).json({ error: "Password change service error." });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    try {
      if (req.token) await revokeSession(req.token);
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "LOGOUT",
        module: "auth",
        details: "User signed out.",
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Logout error." });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }
    const user = await getUserByEmail(email);
    if (!user) {
      // Don't leak account non-existence
      return res.json({
        message: "If an account matches this email, contact your administrator for password reset.",
      });
    }
    res.json({
      message: "Please contact your Super Admin or Registrar to reissue temporary credentials.",
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await getUserById(req.user._id || req.user.id);
      if (!user) return res.status(404).json({ error: "User not found." });

      const publicUser = userToPublic(user);
      const roles = publicUser.roles || ["student"];
      const activeRole = publicUser.activeRole || roles[0] || "student";

      // If student, populate student details. The avatar is owned by the user
      // record, so it is only filled in as a legacy fallback here.
      if (roles.includes("student")) {
        const student = await Student.findOne({ user: user._id });
        if (student) {
          if (!publicUser.avatarUrl && student.avatarUrl) {
            publicUser.avatarUrl = student.avatarUrl;
          }
          publicUser.studentId = student.studentId;
          publicUser.program = student.program;
          publicUser.section = student.section;
          publicUser.semester = student.semester;
        }
      }

      res.json({
        user: {
          ...publicUser,
          activeRole,
          permissions: getPermissionsForRoles([activeRole]),
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Error retrieving account profile." });
    }
  });

  app.post("/api/auth/active-role", requireAuth, async (req, res) => {
    const requestedRole = String(req.body?.role || "");
    const roles = getUserRoles(req.user);
    if (!roles.includes(requestedRole)) {
      return res
        .status(403)
        .json({ error: "The requested role is not assigned to this account." });
    }

    try {
      await User.findByIdAndUpdate(req.user._id || req.user.id, {
        activeRole: requestedRole,
      });
      res.json({
        activeRole: requestedRole,
        roles,
        permissions: getPermissionsForRoles([requestedRole]),
      });
    } catch {
      res.status(500).json({ error: "Error updating active role." });
    }
  });

  app.get("/api/roles", requireAuth, (req, res) => {
    const byName = new Map(
      roleDefinitions.map((role) => [role.name, role]),
    );
    res.json({
      roles: CORE_ROLES.map(
        (name) =>
          byName.get(name) || {
            name,
            label: name.replace(/_/g, " "),
            description: "",
          },
      ),
    });
  });
}
