import { createHash, randomUUID, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { connectDatabase, mongoose } from "./config/database.js";
import { getBaseSessionPolicy } from "./config/sessionSecurity.js";
import {
  User,
  Student,
  Course,
  Attendance,
  AttendanceSession,
  Assignment,
  Submission,
  LearningMaterial,
  Timetable,
  AcademicCalendarEvent,
  AdmissionApplication,
  Exam,
  Invoice,
  WorkflowCase,
  Message,
  AuditLog,
  Session,
  PasswordResetToken,
  LoginAttempt,
} from "./models/index.js";
import { normalizeRoles, LEGACY_ROLE_ALIASES } from "./permissions/catalog.js";

const JWT_SECRET = process.env.JWT_SECRET;
const BOOTSTRAP_ADMIN_PASSWORD = process.env.COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD;

// Fail fast when the signing secret is missing or still at its insecure default.
// CollegeOS must never start with a hardcoded or placeholder JWT secret.
if (!JWT_SECRET) {
  throw new Error("Missing required environment variable: JWT_SECRET");
}
if (
  JWT_SECRET === "replace-with-a-random-secret" ||
  JWT_SECRET === "collegeos-super-secure-production-jwt-token-secret-key-2026"
) {
  throw new Error("JWT_SECRET must not be left at its default or placeholder value.");
}
if (!BOOTSTRAP_ADMIN_PASSWORD) {
  throw new Error("Missing required environment variable: COLLEGEOS_BOOTSTRAP_ADMIN_PASSWORD");
}

export function getDb() {
  return mongoose.connection;
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compareSync(password, hash);
}

export function signToken(payload) {
  const tokenPayload = {
    ...payload,
    userId: String(payload?.userId || ""),
    jti: payload?.jti || randomUUID(),
  };
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: getBaseSessionPolicy().accessTokenTtl });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId, token, expiresAt, metadata = {}, csrfToken = null) {
  const tokenHash = hashToken(token);
  const existingSession = await Session.findOne({ tokenHash });
  const payload = {
    user: userId,
    tokenHash,
    csrfToken: csrfToken || null,
    expiresAt: new Date(expiresAt),
    userAgent: String(metadata.userAgent || "").slice(0, 512),
    ipAddress: metadata.ipAddress || null,
    location: metadata.location || null,
    lastActiveAt: new Date(),
    revokedAt: null,
  };
  if (existingSession) {
    Object.assign(existingSession, payload);
    await existingSession.save();
    return existingSession;
  }
  return await Session.create(payload);
}

/**
 * Classifies a bearer token's session without applying the staleness window
 * used by touchSession. Used to report precise session failure reasons
 * (revoked, absolutely expired, inactive, or missing) instead of a generic
 * "invalid session". No token value or secret is ever logged by callers.
 */
export async function classifySession(token) {
  const tokenHash = hashToken(token);
  const session = await Session.findOne({ tokenHash }).lean();
  if (!session) return { session: null, status: "MISSING" };
  if (session.revokedAt) return { session, status: "REVOKED" };
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    return { session, status: "EXPIRED_ABSOLUTE" };
  }
  return { session, status: "ACTIVE" };
}

export async function getSessionByToken(token) {
  const classification = await classifySession(token);
  if (classification.status !== "ACTIVE") return null;
  const session = classification.session;
  return {
    ...session,
    id: session._id.toString(),
    user_id: session.user.toString(),
  };
}

export async function forceTouchSession(sessionId) {
  return await Session.updateOne(
    { _id: sessionId, revokedAt: null },
    { $set: { lastActiveAt: new Date() } },
  );
}

export async function revokeSession(token) {
  const tokenHash = hashToken(token);
  return await Session.updateOne(
    { tokenHash, revokedAt: null },
    { revokedAt: new Date() }
  );
}

export async function revokeUserSessions(userId) {
  return await Session.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: new Date() }
  );
}

export async function touchSession(sessionId, metadata, session) {
  const now = new Date();
  const set = {};
  const lastActiveAt = session.lastActiveAt
    ? new Date(session.lastActiveAt).getTime()
    : 0;
  const activityIsStale = lastActiveAt < now.getTime() - 60_000;
  if (activityIsStale) set.lastActiveAt = now;
  if (!session.userAgent && metadata.userAgent) {
    set.userAgent = String(metadata.userAgent).slice(0, 512);
  }
  if (!session.ipAddress && metadata.ipAddress) {
    set.ipAddress = metadata.ipAddress;
  }
  if (Object.keys(set).length === 0) return null;

  const conditions = [];
  if (activityIsStale) {
    conditions.push({
      lastActiveAt: { $lt: new Date(now.getTime() - 60_000) },
    });
  }
  if (set.userAgent) conditions.push({ userAgent: { $in: ["", null] } });
  if (set.ipAddress) conditions.push({ ipAddress: { $in: ["", null] } });
  return await Session.updateOne(
    {
      _id: sessionId,
      revokedAt: null,
      $or: conditions,
    },
    { $set: set },
  );
}

// Persistent, distributed login attempt tracker backed by MongoDB.
// Replaces the previous in-memory Map so counters survive server restarts
// and are shared across multiple CollegeOS instances. No new infrastructure
// dependency is introduced — MongoDB is already the primary data store.
//
// All counter updates use atomic MongoDB operators ($inc, $set) so concurrent
// requests across instances cannot desynchronise the counter. A TTL index on
// expiresAt automatically removes stale records.
//
// Fail-safe behaviour: if MongoDB is unreachable, these functions throw and
// the login route returns 500, denying all attempts rather than allowing
// unlimited retries.

export function createLoginAttemptKey(email, ip) {
  return `${String(email).trim().toLowerCase()}:${String(ip || "unknown")}`;
}

export async function isLoginLocked(attemptKey) {
  const entry = await LoginAttempt.findOne({ attemptKey }).lean();
  if (!entry || !entry.lockedUntil) return false;
  return entry.lockedUntil.getTime() > Date.now();
}

export async function recordLoginFailure(attemptKey) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const cutoff = new Date(now - windowMs);

  // Atomic find-or-increment. $inc is atomic across instances.
  const entry = await LoginAttempt.findOneAndUpdate(
    { attemptKey },
    { $inc: { failures: 1 } },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );

  const withinWindow =
    entry && entry.windowStartedAt && entry.windowStartedAt.getTime() > cutoff.getTime();

  if (!withinWindow) {
    // Window expired — reset counter atomically.
    await LoginAttempt.findOneAndUpdate(
      { attemptKey },
      {
        $set: {
          failures: 1,
          windowStartedAt: new Date(now),
          lockedUntil: null,
          expiresAt: new Date(now + windowMs * 2),
        },
      }
    );
    return { locked: false, remaining: 14 };
  }

  const failures = entry ? entry.failures : 1;

  // If we just reached the threshold, set the lockout.
  if (failures >= 15 && (!entry || !entry.lockedUntil)) {
    await LoginAttempt.findOneAndUpdate(
      { attemptKey },
      {
        $set: {
          lockedUntil: new Date(now + windowMs),
          expiresAt: new Date(now + windowMs * 2),
        },
      }
    );
    return { locked: true, remaining: 0 };
  }

  const remaining = Math.max(0, 15 - failures);
  const locked = Boolean(
    entry && entry.lockedUntil && entry.lockedUntil.getTime() > now
  );
  return { locked, remaining };
}

export async function clearLoginFailures(attemptKey) {
  await LoginAttempt.deleteOne({ attemptKey });
}

/**
 * Historical login domains accepted as aliases for the current institutional
 * domain. The current domain comes from configuration, so no institution's
 * address is hardcoded here; the alias map only exists so accounts created
 * before a domain change keep working.
 */
const LEGACY_EMAIL_DOMAINS = ["edu.np"];

export function getInstitutionEmailDomain() {
  return String(process.env.INSTITUTION_EMAIL_DOMAIN || "techspire.edu.np")
    .trim()
    .toLowerCase();
}

export async function getUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  let user = await User.findOne({
    $or: [{ email: normalizedEmail }, { collegeEmail: normalizedEmail }],
    isActive: true,
  });

  if (user) return user;

  // Same local part on a sibling known domain, so an account created before an
  // institution domain change keeps its login.
  const atIndex = normalizedEmail.lastIndexOf("@");
  if (atIndex === -1) return null;
  const localPart = normalizedEmail.slice(0, atIndex);
  const alternatives = [getInstitutionEmailDomain(), ...LEGACY_EMAIL_DOMAINS]
    .filter((domain) => domain !== normalizedEmail.slice(atIndex + 1))
    .map((domain) => `${localPart}@${domain}`);

  if (!alternatives.length) return null;

  return await User.findOne({
    $or: alternatives.flatMap((candidate) => [
      { email: candidate },
      { collegeEmail: candidate },
    ]),
    isActive: true,
  });
}

export async function getUserById(userId) {
  if (!userId) return null;
  try {
    return await User.findById(userId);
  } catch {
    return null;
  }
}

export function getUserRoles(userOrRoles) {
  if (!userOrRoles) return ["student"];
  if (Array.isArray(userOrRoles)) return normalizeRoles(userOrRoles);
  if (userOrRoles.roles && Array.isArray(userOrRoles.roles)) {
    return normalizeRoles(userOrRoles.roles);
  }
  return normalizeRoles([userOrRoles.activeRole]);
}

export function userToPublic(user) {
  if (!user) return null;
  const u = user.toObject ? user.toObject() : user;
  const roles = normalizeRoles(u.roles);
  const requestedActive = u.activeRole
    ? normalizeRoles([u.activeRole])[0]
    : roles[0];
  const primaryRole = roles.includes(requestedActive)
    ? requestedActive
    : roles[0] || "student";
  const fullName = [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ");

  return {
    id: String(u._id || u.id),
    _id: String(u._id || u.id),
    email: u.email,
    collegeEmail: u.collegeEmail || u.email,
    name: fullName,
    firstName: u.firstName,
    middleName: u.middleName || null,
    lastName: u.lastName,
    phone: u.phone || null,
    personalEmail: u.personalEmail || null,
    address: u.address || null,
    emergencyContact: u.emergencyContact || null,
    avatarUrl: u.avatarUrl || null,
    roles,
    activeRole: primaryRole,
    mustChangePassword: Boolean(u.mustChangePassword),
    accountStatus: u.accountStatus || (u.mustChangePassword ? "PASSIVE" : "ACTIVE"),
    passwordStatus: u.passwordStatus || (u.mustChangePassword ? "TEMPORARY" : "PERMANENT"),
    createdAt: u.createdAt,
    firstLoginAt: u.firstLoginAt || null,
    activatedAt: u.activatedAt || null,
    lastLoginAt: u.lastLoginAt || null,
    lastPasswordChangedAt: u.lastPasswordChangedAt || null,
  };
}

export async function logAudit({ userId, action, module = "general", resource, resourceId, oldValue, newValue, details, metadata }) {
  try {
    await AuditLog.create({
      user: userId || null,
      action,
      module,
      resource,
      resourceId: resourceId ? String(resourceId) : null,
      oldValue,
      newValue,
      details,
      metadata,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error("Audit logging error:", err.message);
  }
}

export async function recordInstitutionEvent({ entityType, entityId, eventType, actorUserId, details, metadata }) {
  return await logAudit({
    userId: actorUserId,
    action: eventType,
    module: entityType,
    resource: entityType,
    resourceId: entityId,
    details,
    metadata,
  });
}

export async function createPasswordResetToken(userId) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await PasswordResetToken.create({
    user: userId,
    tokenHash,
    expiresAt,
  });
  return { token: rawToken, expiresAt: expiresAt.toISOString() };
}

export async function getPasswordResetToken(userId, rawToken) {
  const tokenHash = hashToken(rawToken);
  return await PasswordResetToken.findOne({
    user: userId,
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
}

export async function getPasswordResetTokenByHash(rawToken) {
  const tokenHash = hashToken(rawToken);
  return await PasswordResetToken.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
}

export async function invalidatePasswordResetTokens(userId) {
  return await PasswordResetToken.updateMany(
    { user: userId, usedAt: null },
    { usedAt: new Date() }
  );
}

export async function getStudentByUserId(userId) {
  return await Student.findOne({ user: userId });
}

export async function getStudentById(studentId) {
  if (mongoose.Types.ObjectId.isValid(studentId)) {
    const byObjId = await Student.findById(studentId);
    if (byObjId) return byObjId;
  }
  return await Student.findOne({ studentId });
}

export function authorizeUser(user, requiredRoleOrRoles) {
  const roles = getUserRoles(user);
  const required = Array.isArray(requiredRoleOrRoles)
    ? requiredRoleOrRoles
    : [requiredRoleOrRoles];
  return roles.some((role) => required.includes(role));
}

export function ensureUserOwnsResource(user, ownerUserId) {
  return String(user.id || user._id) === String(ownerUserId);
}

/**
 * Institution-wide statistics for the dashboard and analytics workspace.
 *
 * Every number is counted from the database. There are no defaults that could
 * mask an empty institution: a fresh installation reports zeroes and the UI
 * renders empty states, which is why this function has no fabricated fallbacks.
 */
export async function getAnalyticsSummary() {
  const [
    totalUsers,
    totalStudents,
    activeStudents,
    openCases,
    closedCases,
    totalCourses,
    activeCourses,
    archivedCourses,
    totalAssignments,
    openAssignments,
    totalSubmissions,
    gradedSubmissions,
    totalAttendanceSessions,
    totalLearningMaterials,
    totalCalendarEvents,
    totalTimetableSessions,
    totalExaminations,
    publishedExaminations,
    totalAdmissionApplications,
    pendingAdmissionApplications,
    invoiceStats,
  ] = await Promise.all([
    User.countDocuments({ isActive: true }),
    Student.countDocuments(),
    Student.countDocuments({ status: "ACTIVE" }),
    WorkflowCase.countDocuments({ status: { $in: ["SUBMITTED", "IN_REVIEW", "MORE_INFO"] } }),
    WorkflowCase.countDocuments({ status: { $in: ["APPROVED", "REJECTED", "COMPLETED", "CANCELLED"] } }),
    Course.countDocuments(),
    Course.countDocuments({ status: "ACTIVE" }),
    Course.countDocuments({ status: "ARCHIVED" }),
    Assignment.countDocuments({ status: { $ne: "ARCHIVED" } }),
    Assignment.countDocuments({ status: "OPEN" }),
    Submission.countDocuments(),
    Submission.countDocuments({ status: "GRADED" }),
    AttendanceSession.countDocuments(),
    LearningMaterial.countDocuments({ status: { $ne: "ARCHIVED" } }),
    AcademicCalendarEvent.countDocuments({ status: { $ne: "CANCELLED" } }),
    Timetable.countDocuments({ archivedAt: null }),
    Exam.countDocuments(),
    Exam.countDocuments({ resultsStatus: "PUBLISHED" }),
    AdmissionApplication.countDocuments({ archivedAt: null }),
    AdmissionApplication.countDocuments({
      archivedAt: null,
      status: { $in: ["SUBMITTED", "VERIFIED"] },
    }),
    Invoice.aggregate([
      { $match: { status: { $ne: "VOID" } } },
      {
        $group: {
          _id: null,
          totalInvoiced: { $sum: "$totalAmount" },
          totalCollected: { $sum: "$paidAmount" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const stat = invoiceStats[0] || { totalInvoiced: 0, totalCollected: 0, count: 0 };
  const totalInvoiced = stat.totalInvoiced || 0;
  const totalCollected = stat.totalCollected || 0;

  return {
    totalUsers,
    totalStudents,
    activeStudents,
    totalCases: openCases + closedCases,
    openCases,
    closedCases,
    totalCourses,
    activeCourses,
    archivedCourses,
    totalAssignments,
    openAssignments,
    totalSubmissions,
    gradedSubmissions,
    totalAttendanceSessions,
    totalLearningMaterials,
    totalCalendarEvents,
    totalTimetableSessions,
    totalExaminations,
    publishedExaminations,
    totalAdmissionApplications,
    pendingAdmissionApplications,
    totalInvoices: stat.count || 0,
    totalInvoiced,
    totalCollected,
    outstandingBalance: Math.max(0, totalInvoiced - totalCollected),
  };
}

/**
 * Rewrites role strings that were consolidated (for example
 * `institution_admin` â†’ `super_admin`) so stored accounts keep working after
 * the consolidation. Idempotent and safe to run on every boot.
 */
export async function migrateConsolidatedRoles() {
  const legacyRoles = Object.keys(LEGACY_ROLE_ALIASES);
  const affected = await User.find({ roles: { $in: legacyRoles } }).select(
    "_id roles activeRole",
  );

  for (const user of affected) {
    const roles = normalizeRoles(user.roles);
    const requestedActive = normalizeRoles([user.activeRole])[0];
    user.roles = roles;
    user.activeRole = roles.includes(requestedActive)
      ? requestedActive
      : roles[0];
    await user.save();
  }

  if (affected.length > 0) {
    const mappings = legacyRoles
      .map((role) => `${role} â†’ ${LEGACY_ROLE_ALIASES[role]}`)
      .join(", ");
    console.log(
      `Role consolidation applied to ${affected.length} account(s): ${mappings}.`,
    );
  }

  return affected.length;
}

/**
 * Provisions only the single login credential CollegeOS cannot start without:
 * the bootstrap Super Admin.
 *
 * No institutional records are fabricated here â€” no departments, programmes,
 * courses, sections, students, enrolments, teaching assignments, attendance,
 * finance or communication rows. Every module renders its own data-driven empty
 * state until real records are entered.
 *
 * Role-specific test accounts and sample academic records live in
 * `scripts/seed-demo.js`, which only runs when explicitly invoked.
 */
export async function seedBaseUsers() {
  const emailDomain = getInstitutionEmailDomain();
  const adminEmail = `admin@${emailDomain}`;

  const existingAdmin = await User.findOne({
    $or: [{ email: adminEmail }, { collegeEmail: adminEmail }],
  });

  if (!existingAdmin) {
    const adminPasswordHash = hashPassword(BOOTSTRAP_ADMIN_PASSWORD);
    const admin = await User.create({
      email: adminEmail,
      collegeEmail: adminEmail,
      passwordHash: adminPasswordHash,
      firstName: "College",
      lastName: "Administrator",
      phone: "+977-9800000001",
      roles: ["super_admin"],
      activeRole: "super_admin",
      mustChangePassword: true,
      accountStatus: "PASSIVE",
      passwordStatus: "TEMPORARY",
      isActive: true,
    });
    console.log(`Initial Super Admin created: ${adminEmail}`);

    await logAudit({
      userId: admin._id,
      action: "BOOTSTRAP_ADMIN_CREATED",
      module: "auth",
      details: "Initial Super Admin account created in MongoDB.",
    });
  }

  await migrateConsolidatedRoles();
}

export async function initializeDatabase() {
  await connectDatabase();
  await seedBaseUsers();
  return true;
}

export async function initializeServerState() {
  await initializeDatabase();
  return true;
}
