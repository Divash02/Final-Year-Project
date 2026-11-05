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
  createPasswordResetToken,
  getPasswordResetToken,
  getPasswordResetTokenByHash,
  invalidatePasswordResetTokens,
  classifySession,
  forceTouchSession,
} from "../db.js";
import { User, Student, Staff, Session } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getMinimumPasswordLength,
  validatePasswordPolicy,
} from "../services/passwordPolicy.js";
import { getPermissionsForRoles, CORE_ROLES } from "../permissions/catalog.js";
import { getSessionPolicy } from "../config/sessionSecurity.js";
import nodemailer from "nodemailer";

function createMailTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

const mailTransport = createMailTransport();

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

function getSessionDevice(userAgent = "") {
  const agent = String(userAgent);
  const browser = /Edg(?:e|A|iOS)?\//i.test(agent)
    ? "Microsoft Edge"
    : /SamsungBrowser\//i.test(agent)
      ? "Samsung Internet"
      : /FxiOS\/|Firefox\//i.test(agent)
        ? "Firefox"
        : /OPR\/|Opera\//i.test(agent)
          ? "Opera"
          : /CriOS\/|Chrome\/|Chromium\//i.test(agent)
            ? "Chrome"
            : /Safari\//i.test(agent)
              ? "Safari"
              : "Unknown browser";
  const operatingSystem = /Windows NT/i.test(agent)
    ? "Windows"
    : /Android/i.test(agent)
      ? "Android"
      : /iPhone|iPad|iPod/i.test(agent)
        ? "iOS"
        : /Mac OS X/i.test(agent)
          ? "macOS"
          : /Linux/i.test(agent)
            ? "Linux"
            : "Unknown operating system";
  const deviceType = /iPad|Tablet/i.test(agent)
    ? "Tablet"
    : (/Android/i.test(agent) && !/Mobile/i.test(agent))
      ? "Tablet"
      : /Mobile|iPhone|iPod/i.test(agent)
      ? "Phone"
      : /Windows|Macintosh|Linux/i.test(agent)
        ? "Computer"
        : "Device";
  const deviceName = /iPhone/i.test(agent)
    ? "iPhone"
    : /iPad/i.test(agent)
      ? "iPad"
      : /Android/i.test(agent)
        ? /Mobile/i.test(agent) ? "Android Phone" : "Android Device"
        : /Windows/i.test(agent)
          ? "Windows PC"
          : /Macintosh|Mac OS X/i.test(agent)
            ? "Mac"
            : /Linux/i.test(agent)
              ? "Linux PC"
              : "Unknown device";

  return { deviceType, deviceName, browser, operatingSystem };
}

function maskIpAddress(value) {
  const address = String(value || "").replace(/^::ffff:/i, "");
  if (address === "::1" || address === "127.0.0.1") return "Local network";
  const octets = address.split(".");
  if (
    octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  ) {
    return `${octets[0]}.${octets[1]}.${octets[2]}.xxx`;
  }
  if (address.includes(":")) {
    const groups = address.split(":").filter(Boolean);
    return groups.length ? `${groups.slice(0, 2).join(":")}:…` : "Unavailable";
  }
  return "Unavailable";
}

export function sessionToPublic(session, currentSessionId, now) {
  const device = getSessionDevice(session.userAgent);
  const revoked = Boolean(session.revokedAt);
  const expired = new Date(session.expiresAt).getTime() <= now.getTime();
  const lastActive = new Date(session.lastActiveAt || session.createdAt).getTime();
  const inactive =
    !revoked &&
    !expired &&
    lastActive > 0 &&
    now.getTime() - lastActive > getSessionPolicy("student").inactivityTimeoutMs;
  return {
    id: String(session._id),
    ...device,
    ipAddress: maskIpAddress(session.ipAddress),
    location: session.location || null,
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt || session.createdAt,
    isCurrent: String(session._id) === String(currentSessionId),
    status: revoked ? "Revoked" : expired || inactive ? "Expired" : "Active",
  };
}

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

      if ((await isLoginLocked(attemptKey)) && !isValidPassword) {
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
         const lockResult = await recordLoginFailure(attemptKey);
         await logAudit({
           action: "LOGIN_FAILED",
           module: "auth",
           details: `Rejected login attempt for ${email}.`,
         });
         return res.status(401).json({ error: "Invalid credentials.", remainingAttempts: lockResult.remaining });
      }

      await clearLoginFailures(attemptKey);
      const effectiveRoles = getUserRoles(user);
      const isFirstLogin = !user.firstLoginAt;

      user.firstLoginAt = user.firstLoginAt || new Date();
      user.lastLoginAt = new Date();
      await user.save();

      const token = signToken({ userId: user._id.toString() });
      const policy = getSessionPolicy(effectiveRoles[0] || "student");
      const sessionExpiry = new Date(Date.now() + policy.absoluteLifetimeMs).toISOString();
      await createSession(user._id, token, sessionExpiry, {
        userAgent: req.get("user-agent"),
        ipAddress: req.ip,
      });

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
      const expiryPolicy = getSessionPolicy(getUserRoles(user)[0] || "student");
      const expiresAt = new Date(Date.now() + expiryPolicy.absoluteLifetimeMs).toISOString();
      await createSession(user._id, replacementToken, expiresAt, {
        userAgent: req.get("user-agent"),
        ipAddress: req.ip,
      });

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

  /**
   * Renews the inactivity timer of the current session without extending its
   * absolute lifetime. The caller keeps its existing access token; the server
   * records that the session is still meaningfully active. Clients call this
   * from the "Stay Signed In" confirmation and as a heartbeat while the user
   * is actively working.
   */
  app.post("/api/auth/sessions/renew", requireAuth, async (req, res) => {
    try {
      await forceTouchSession(req.session._id);
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "SESSION_RENEWED",
        module: "auth",
        details: "Session inactivity timer renewed by user action.",
      });
      res.json({
        success: true,
        expiresAt: req.session.expiresAt,
      });
    } catch (err) {
      res.status(500).json({ error: "Unable to renew this session." });
    }
  });

  app.get("/api/auth/sessions", requireAuth, async (req, res) => {
    try {
      const now = new Date();
      const sessions = await Session.find({
        user: req.user._id || req.user.id,
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();
      res.json({
        sessions: sessions.map((session) =>
          sessionToPublic(session, req.session._id, now),
        ),
      });
    } catch (err) {
      res.status(500).json({ error: "Unable to load signed-in sessions." });
    }
  });

  app.delete("/api/auth/sessions/:sessionId", requireAuth, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.sessionId)) {
      return res.status(400).json({ error: "Invalid session identifier." });
    }
    try {
      const session = await Session.findOneAndUpdate(
        {
          _id: req.params.sessionId,
          user: req.user._id || req.user.id,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { revokedAt: new Date() } },
      );
      if (!session) {
        return res.status(404).json({ error: "Active session not found." });
      }
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "SESSION_REVOKED",
        module: "auth",
        resource: "session",
        resourceId: session._id.toString(),
        details: "User revoked a signed-in device session.",
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Unable to revoke this session." });
    }
  });

  app.post("/api/auth/sessions/revoke-others", requireAuth, async (req, res) => {
    try {
      const result = await Session.updateMany(
        {
          user: req.user._id || req.user.id,
          _id: { $ne: req.session._id },
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { revokedAt: new Date() } },
      );
      const revokedCount = result.modifiedCount ?? result.nModified ?? 0;
      await logAudit({
        userId: req.user._id || req.user.id,
        action: "OTHER_SESSIONS_REVOKED",
        module: "auth",
        details: `User revoked ${revokedCount} other signed-in session(s).`,
      });
      res.json({ success: true, revokedCount });
    } catch (err) {
      res.status(500).json({ error: "Unable to sign out other devices." });
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
        message: "If an account matches this email, a password reset link has been sent.",
      });
    }

    const { token, expiresAt } = await createPasswordResetToken(user._id);

    const publicOrigin = process.env.PUBLIC_ORIGIN || "http://localhost:3000";
    const resetUrl = `${publicOrigin}/auth/reset-password?token=${token}`;

    if (mailTransport) {
      try {
        await mailTransport.sendMail({
          from: process.env.SMTP_FROM || "noreply@collegeos.local",
          to: user.email,
          subject: "CollegeOS — Password Reset",
          text: `You requested a password reset. Use this link to reset your password: ${resetUrl}. The link expires at ${expiresAt}.`,
          html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires at ${expiresAt}.</p>`,
        });
      } catch (err) {
        console.error(`Password reset email failed for ${user.email}:`, err.message);
      }
    } else {
      // SMTP is not configured: the reset token is issued and stored but no
      // email is delivered. Log only that a token was generated (never the
      // token value itself) so production logs never expose reset tokens.
      console.log(`[auth] Password reset token issued for ${user.email} (SMTP not configured; email not sent).`);
    }

    res.json({
      message: "If an account matches this email, a password reset link has been sent.",
    });
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword, confirmPassword } = req.body || {};
      if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({
          error: "Reset token, new password, and confirmation are required.",
        });
      }
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match." });
      }

      const minimumPasswordLength = await getMinimumPasswordLength();
      const policy = validatePasswordPolicy(newPassword, {
        minimumLength: minimumPasswordLength,
      });
      if (!policy.valid) {
        return res.status(422).json({
          error: "Password does not meet the required security requirements.",
          code: "VALIDATION_FAILED",
          details: policy.errors,
        });
      }

      const resetToken = await getPasswordResetTokenByHash(token);
      if (!resetToken) {
        return res.status(400).json({
          error: "Invalid or expired reset token.",
        });
      }

      const user = await User.findById(resetToken.user);
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      user.passwordHash = hashPassword(newPassword);
      user.mustChangePassword = false;
      user.passwordStatus = "PERMANENT";
      user.accountStatus = "ACTIVE";
      user.isActive = true;
      user.activatedAt = user.activatedAt || new Date();
      user.lastPasswordChangedAt = new Date();
      await user.save();

      await invalidatePasswordResetTokens(user._id);

      await logAudit({
        userId: user._id,
        action: "PASSWORD_RESET",
        module: "auth",
        resource: "user",
        resourceId: user._id.toString(),
        details: "Password reset via reset token.",
      });

      await revokeUserSessions(user._id);

      res.json({ success: true });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ error: "Password reset service error." });
    }
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
