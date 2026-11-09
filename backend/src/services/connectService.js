import crypto from "node:crypto";
import mongoose from "mongoose";
import {
  User,
  Student,
  Enrollment,
  Course,
  CourseTeachingAssignment,
  FacultySubjectAssignment,
  VirtualSession,
} from "../models/index.js";
import {
  hashPassword,
  verifyPassword,
  getUserRoles,
  logAudit,
  createPasswordResetToken,
  invalidatePasswordResetTokens,
} from "../db.js";
import { hasPermission, normalizeRoles } from "../permissions/catalog.js";
import { validationError, forbidden, notFound, badRequest, conflict } from "../utils/apiError.js";
import { notifyOnce } from "./lms/notifier.js";
import { Mail } from "../models/index.js";

export const STAFF_ONLY_ROLES = new Set([
  "faculty",
  "program_coordinator",
  "hod",
  "dean",
  "registrar",
  "exam_officer",
  "finance_officer",
  "campus_admin",
  "super_admin",
]);

function randomDigits(length) {
  let out = "";
  while (out.length < length) {
    const buf = crypto.randomBytes(length);
    for (const b of buf) {
      if (out.length >= length) break;
      out += String(b % 10);
    }
  }
  return out;
}

function randomAlpha(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const buf = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += chars[buf[i] % chars.length];
  return out;
}

// ---------------------------------------------------------------------------
// Join attempt rate limiting (in-memory, per backend process).
// Prevents meeting-ID enumeration and credential brute-force on /join.
// ---------------------------------------------------------------------------
const JOIN_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const JOIN_RATE_MAX_ATTEMPTS = 100;
const joinAttempts = new Map(); // key -> { count, firstAt, blockedUntil }

function rateLimitKey(ip, sessionId) {
  return `join:${String(ip || "unknown")}:${String(sessionId || "")}`;
}

function nowMs() {
  return Date.now();
}

export function checkJoinRateLimit(ip, sessionId) {
  const key = rateLimitKey(ip, sessionId);
  const now = nowMs();
  let entry = joinAttempts.get(key);
  if (!entry) {
    entry = { count: 0, firstAt: now, blockedUntil: 0 };
    joinAttempts.set(key, entry);
  }
  // Reset window if expired.
  if (now - entry.firstAt > JOIN_RATE_WINDOW_MS) {
    entry.count = 0;
    entry.firstAt = now;
    entry.blockedUntil = 0;
  }
  if (entry.blockedUntil && now < entry.blockedUntil) {
    const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
    const err = new Error(`Too many join attempts. Try again in ${retryAfter} seconds.`);
    err.status = 429;
    err.code = "JOIN_RATE_LIMITED";
    err.expose = true;
    throw err;
  }
  entry.count += 1;
  if (entry.count > JOIN_RATE_MAX_ATTEMPTS) {
    entry.blockedUntil = now + JOIN_RATE_WINDOW_MS;
    const err = new Error("Too many join attempts. Access temporarily blocked.");
    err.status = 429;
    err.code = "JOIN_RATE_LIMITED";
    err.expose = true;
    throw err;
  }
  return { remaining: Math.max(0, JOIN_RATE_MAX_ATTEMPTS - entry.count) };
}

export function resetJoinRateLimit(ip, sessionId) {
  const key = rateLimitKey(ip, sessionId);
  joinAttempts.delete(key);
}

export function generateSessionCredential({ passwordLength = 10 } = {}) {
  // Plaintext returned once; caller must never persist it.
  return {
    sessionId16: randomDigits(16),
    password: randomAlpha(passwordLength),
    issuedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Credential encryption (admin-only retrieval). AES-256-CBC with a key from
// CREDENTIAL_ENCRYPTION_KEY. The key is never stored in the database.
// ---------------------------------------------------------------------------
function getCredentialEncryptionKey() {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY || "";
  if (raw.length < 16) throw badRequest("Credential encryption is not configured. Set CREDENTIAL_ENCRYPTION_KEY on the server and restart.");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptCredentialPassword(plaintext) {
  if (!plaintext) return null;
  const key = getCredentialEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return iv.toString("base64") + ":" + encrypted;
}

export function decryptCredentialPassword(encrypted) {
  if (!encrypted) return null;
  const key = getCredentialEncryptionKey();
  const parts = String(encrypted).split(":");
  if (parts.length !== 2) return null;
  const iv = Buffer.from(parts[0], "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(parts[1], "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function issueCredential(kind, options = {}) {
  let plain = generateSessionCredential(options);
  // Ensure uniqueness across stored credential session IDs.
  for (let i = 0; i < 5; i += 1) {
    const clash = await VirtualSession.exists({
      $or: [
        { "studentCredential.sessionId16": plain.sessionId16 },
        { "teacherCredential.sessionId16": plain.sessionId16 },
        { "meetingCredential.sessionId16": plain.sessionId16 },
      ],
    });
    if (!clash) break;
    plain = generateSessionCredential(options);
  }
  const encrypted = encryptCredentialPassword(plain.password);
  return {
    plain,
    stored: {
      sessionId16: plain.sessionId16,
      passwordHash: hashPassword(plain.password),
      encryptedPassword: encrypted,
      issuedAt: plain.issuedAt,
      revokedAt: null,
      expiresAt: options.expiresAt || null,
    },
  };
}

export function verifyCredential(stored, sessionId16, password) {
  if (!stored || stored.revokedAt) return false;
  if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) return false;
  if (String(stored.sessionId16 || "") !== String(sessionId16 || "").trim()) return false;
  return verifyPassword(String(password || ""), stored.passwordHash);
}

function scheduledDateTimeMs(session) {
  if (!session || !session.scheduledDate) return null;
  const timePart = String(session.startTime || "00:00").trim();
  const combined = `${String(session.scheduledDate).trim()}T${timePart}:00`;
  const ms = Date.parse(combined);
  return Number.isNaN(ms) ? null : ms;
}

export function assertSessionJoinable(session) {
  if (!session) throw notFound("Meeting not found.");
  if (session.status === "CANCELLED") throw forbidden("Meeting has been cancelled.");
  if (session.status === "EXPIRED") throw forbidden("Meeting access is unavailable.");
  const sfStatus = studentFacingStatus(session.status);
  if (sfStatus === "COMPLETED") throw forbidden("Meeting has already ended.");
  if (session.credentialRevokedAt) throw forbidden("Meeting access has been revoked.");
  // The actual persisted session state is authoritative. Once the teacher has
  // started the session (LIVE), the scheduled clock no longer blocks joining.
  if (session.status !== "LIVE") {
    const startMs = scheduledDateTimeMs(session);
    if (startMs && startMs > Date.now()) throw forbidden("Meeting has not started yet.");
  }
}

export function assertSessionCredentialForUser(session, user, body = {}) {
  // Session-level credential verification where applicable.
  // Teachers/hosts may join as their CollegeOS identity without the shared student credential.
  // Students joining an ONLINE_CLASS must present the class student credential.
  const role = resolveConnectParticipantRole(session, user);
  if (!role) return null;
  const sessionId16 = body?.sessionCredentialId || body?.credentialId || body?.sessionId16;
  const password = body?.sessionCredentialPassword || body?.credentialPassword || body?.password;
  if (!sessionId16 || !password) {
    if (session.sessionType === "ONLINE_CLASS" && role === "STUDENT") {
      throw forbidden("Session credential is required to join this class.");
    }
    return role;
  }

  let stored = null;
  if (session.sessionType === "ONLINE_CLASS") {
    stored = role === "STUDENT" ? session.studentCredential : session.teacherCredential;
    if (!stored && role !== "STUDENT") stored = session.teacherCredential;
  } else if (session.sessionType === "ONLINE_MEETING") {
    stored = session.meetingCredential;
  }

  if (!stored || stored.revokedAt) {
    throw validationError("Meeting access is unavailable.");
  }
  if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) {
    throw validationError("Meeting access is unavailable.");
  }
  if (String(stored.sessionId16 || "") !== String(sessionId16 || "").trim()) {
    throw validationError("Invalid meeting ID.");
  }
  if (!verifyPassword(String(password || ""), stored.passwordHash)) {
    throw validationError("Incorrect meeting password.");
  }
  return role;
}

export function authorizeConnectJoin(session, user, body = {}, { requireView = true, ip } = {}) {
  if (!session) throw notFound("Meeting not found.");
  if (ip) checkJoinRateLimit(ip, String(session._id || session.id));
  // Hide meetings from students even for direct requests; never disclose existence.
  if (session.sessionType === "ONLINE_MEETING" && isStudentOnly(user)) throw notFound("Meeting not found.");
  if (requireView && !canViewSession(session, user)) throw notFound("Meeting not found.");
  assertSessionJoinable(session);
  const role = assertSessionCredentialForUser(session, user, body);
  if (!role || !canViewSession(session, user)) throw forbidden("You are not authorized to join this meeting.");
  return role;
}

// ---------------------------------------------------------------------------
// Student admission policy & waiting room (ONLINE_CLASS only)
// ---------------------------------------------------------------------------

export function isAdmissionManaged(session) {
  return session.sessionType === "ONLINE_CLASS" && String(session.admissionPolicy || "direct") === "approval";
}

export function canManageAdmission(session, user) {
  if (!session || !user) return false;
  return isMeetingHostOrAdmin(session, user);
}

export async function setAdmissionPolicy(session, user, policy) {
  if (!canManageAdmission(session, user)) throw forbidden("Not authorized to change the admission policy.");
  if (!["direct", "approval"].includes(policy)) throw badRequest("Admission policy must be 'direct' or 'approval'.");
  if (session.sessionType !== "ONLINE_CLASS") throw badRequest("Admission policy applies to online classes only.");
  session.admissionPolicy = policy;
  session.audit = session.audit || [];
  session.audit.push({
    action: "ADMISSION_POLICY_CHANGED",
    actor: user._id || user.id,
    details: { policy },
  });
  await session.save();
  await logAudit({
    userId: user._id || user.id,
    action: "CONNECT_ADMISSION_POLICY_CHANGED",
    module: "connect",
    resource: "virtual_session",
    resourceId: String(session._id),
    details: `Admission policy set to ${policy} for session ${session.title}.`,
    metadata: { sessionId: String(session._id), policy },
  });
  return { policy: session.admissionPolicy };
}

export async function requestAdmission(session, user) {
  if (session.sessionType !== "ONLINE_CLASS") throw badRequest("Admission requests apply to online classes only.");
  if (!isAdmissionManaged(session)) throw badRequest("Direct entry is enabled for this session; no admission request is required.");
  const role = resolveConnectParticipantRole(session, user);
  if (role !== "STUDENT") throw forbidden("Only students may request admission to a class.");
  const uid = String(user._id || user.id);
  // Prevent duplicate pending requests.
  const existing = (session.waitingRoomRequests || []).find(
    (r) => String(r.user) === uid && String(r.status) === "pending",
  );
  if (existing) throw conflict("You already have a pending admission request for this session.");
  const student = await (await import("../models/index.js")).Student.findOne({ user: uid })
    .select("studentId firstName lastName program programCode section")
    .lean();
  const name = student
    ? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ") || "Participant"
    : [user.firstName, user.lastName].filter(Boolean).join(" ") || "Participant";
  session.waitingRoomRequests = session.waitingRoomRequests || [];
  session.waitingRoomRequests.push({
    user: user._id,
    name,
    studentId: student ? student.studentId : null,
    program: student ? (student.program || student.programCode) : null,
    section: student ? student.section : null,
    cameraOn: false,
    micOn: false,
    status: "pending",
    requestedAt: new Date(),
  });
  session.audit = session.audit || [];
  session.audit.push({ action: "ADMISSION_REQUESTED", actor: user._id || user.id, details: { name, studentId: student ? student.studentId : null } });
  await session.save();
  await logAudit({
    userId: user._id || user.id,
    action: "CONNECT_ADMISSION_REQUESTED",
    module: "connect",
    resource: "virtual_session",
    resourceId: String(session._id),
    details: `Admission request from ${name} (${uid}).`,
    metadata: { sessionId: String(session._id), userId: uid, name },
  });
  return session.waitingRoomRequests[session.waitingRoomRequests.length - 1];
}

export async function decideAdmission(session, requestId, user, decision) {
  if (!canManageAdmission(session, user)) throw forbidden("Not authorized to decide admission requests.");
  if (!isAdmissionManaged(session)) throw badRequest("Admission approval is not required for this session.");
  const request = (session.waitingRoomRequests || []).find((r) => String(r._id || r.id) === String(requestId));
  if (!request) throw notFound("Admission request not found.");
  if (String(request.status) !== "pending") throw conflict(`Admission request already ${request.status}.`);
  if (decision !== "approve" && decision !== "reject") throw badRequest("Decision must be 'approve' or 'reject'.");
  request.status = decision === "approve" ? "approved" : "rejected";
  request.decidedAt = new Date();
  request.decidedBy = user._id || user.id;
  session.audit = session.audit || [];
  session.audit.push({
    action: `ADMISSION_${decision.toUpperCase()}`,
    actor: user._id || user.id,
    details: { requestId, studentId: request.studentId, name: request.name },
  });
  await session.save();
  await logAudit({
    userId: user._id || user.id,
    action: `CONNECT_ADMISSION_${decision.toUpperCase()}`,
    module: "connect",
    resource: "virtual_session",
    resourceId: String(session._id),
    details: `${decision === "approve" ? "Approved" : "Rejected"} admission for ${request.name} (${request.studentId}).`,
    metadata: { sessionId: String(session._id), requestId, userId: String(request.user), decision },
  });
  return request;
}

export function getWaitingRoomRequests(session, user) {
  if (!canManageAdmission(session, user)) throw forbidden("Not authorized to view the waiting room.");
  if (session.sessionType !== "ONLINE_CLASS") throw badRequest("Waiting room applies to online classes only.");
  const pending = (session.waitingRoomRequests || []).filter((r) => String(r.status) === "pending");
  const decided = (session.waitingRoomRequests || []).filter((r) => String(r.status) !== "pending");
  return { pending, decided, policy: session.admissionPolicy || "direct" };
}

export async function expireCredentials(session) {
  // Revoke all stored credentials so the Meeting ID / Password can no longer be used.
  const now = new Date();
  for (const cred of [session.studentCredential, session.teacherCredential, session.meetingCredential]) {
    if (cred && !cred.revokedAt) {
      cred.revokedAt = now;
    }
  }
  session.credentialRevokedAt = now;
  session.audit = session.audit || [];
  session.audit.push({ action: "CREDENTIALS_REVOKED", actor: null, details: { reason: "session-ended-or-cancelled" } });
  await session.save();
  await logAudit({
    userId: null,
    action: "CONNECT_CREDENTIALS_REVOKED",
    module: "connect",
    resource: "virtual_session",
    resourceId: String(session._id),
    details: "All session credentials revoked; Meeting ID and Password are no longer valid.",
    metadata: { sessionId: String(session._id) },
  });
  return { credentialRevokedAt: session.credentialRevokedAt };
}

export function isStaff(user) {
  const roles = normalizeRoles(getUserRoles(user));
  return roles.some((r) => STAFF_ONLY_ROLES.has(r));
}

export function isStudentOnly(user) {
  const roles = normalizeRoles(getUserRoles(user));
  return roles.length > 0 && roles.every((r) => r === "student");
}

export function canCreateClass(user) {
  return hasPermission(getUserRoles(user), "connect.class.create");
}

export function canCreateMeeting(user) {
  const roles = normalizeRoles(getUserRoles(user));
  return hasPermission(roles, "connect.meeting.create") && isStaff(user) && !isStudentOnly(user);
}

export function canManageConnectAdmin(user) {
  return hasPermission(getUserRoles(user), "connect.admin");
}

export function isMeetingHostOrAdmin(session, user) {
  const uid = String(user?._id || user?.id || "");
  if (!uid) return false;
  if (canManageConnectAdmin(user)) return true;
  if (String(session.host || "") === uid) return true;
  if (String(session.assignedTeacher || "") === uid) return true;
  if ((session.coHosts || []).some((id) => String(id) === uid)) return true;
  if (String(session.createdBy || "") === uid) return true;
  return false;
}

export function isInvitedToMeeting(session, user) {
  const uid = String(user?._id || user?.id || "");
  return (session.invitedUsers || []).some((row) => String(row.user?._id || row.user) === uid);
}

function normalizeCode(value) {
  return value == null ? null : String(value).trim().toUpperCase() || null;
}

function toObjectId(value, field) {
  const text = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(text)) throw badRequest(`${field} is invalid.`);
  return new mongoose.Types.ObjectId(text);
}

export function normalizeClassTarget(input = {}) {
  const target = input && typeof input === "object" ? input : {};
  const programCodes = (Array.isArray(target.programCodes) ? target.programCodes : [])
    .map(normalizeCode)
    .filter(Boolean);
  const sectionCodes = (Array.isArray(target.sectionCodes) ? target.sectionCodes : [])
    .map(normalizeCode)
    .filter(Boolean);
  const batches = (Array.isArray(target.batches) ? target.batches : [])
    .map((v) => String(v).trim())
    .filter(Boolean);
  const academicYears = (Array.isArray(target.academicYears) ? target.academicYears : [])
    .map((v) => String(v).trim())
    .filter(Boolean);
  const semesters = (Array.isArray(target.semesters) ? target.semesters : [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 20);
  let course = null;
  if (target.course) {
    try {
      course = toObjectId(target.course, "Course");
    } catch {
      course = null;
    }
  }
  if (!programCodes.length && !semesters.length && !sectionCodes.length && !batches.length && !course) {
    throw validationError("Select the academic group for this online class (program, semester, section, batch, or course).", [
      { field: "classTarget", message: "Academic group is required." },
    ]);
  }
  return { programCodes, academicYears, semesters, batches, sectionCodes, course };
}

/**
 * Resolve ONLINE_CLASS participants from real enrollment/academic records.
 * Students and enrolled users are derived server-side; never trust client lists.
 */
export async function resolveClassParticipants(target) {
  const t = normalizeClassTarget(target);

  // Prefer Enrollment when course/section/semester are known (most precise).
  const enrollmentQuery = { status: "ENROLLED" };
  if (t.course) enrollmentQuery.course = t.course;
  if (t.semesters.length === 1) enrollmentQuery.semester = t.semesters[0];
  else if (t.semesters.length > 1) enrollmentQuery.semester = { $in: t.semesters };
  if (t.academicYears.length === 1) enrollmentQuery.academicYear = t.academicYears[0];
  else if (t.academicYears.length > 1) enrollmentQuery.academicYear = { $in: t.academicYears };
  if (t.sectionCodes.length) enrollmentQuery.sectionCode = { $in: t.sectionCodes };

  let studentIds = [];
  if (t.course || t.semesters.length || t.sectionCodes.length || t.academicYears.length) {
    const rows = await Enrollment.find(enrollmentQuery).select("student studentUser").lean();
    studentIds = rows.map((r) => r.student).filter(Boolean);
  }
  // Academic year is only recorded on Enrollment. When an academic year is
  // specified but no enrolment matches it, there are no eligible students for
  // that audience — do not fall back to enrolment-free student records.
  if (t.academicYears.length > 0 && !studentIds.length) {
    throw validationError("No active students matched the selected academic group. Check enrollment records and target filters.", [
      { field: "classTarget", message: "No matching students found." },
    ]);
  }

  const studentQuery = { status: "ACTIVE" };
  if (studentIds.length) studentQuery._id = { $in: studentIds };
  // Program/programCode are matched case-insensitively: the target is normalized
  // to uppercase by normalizeClassTarget, but Student records may store the
  // program code in mixed case (e.g. "BScIT"). A case-sensitive $in would miss
  // real students and wrongly report "no active students matched".
  if (t.programCodes.length) {
    const programPattern = t.programCodes
      .map((p) => String(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const programRegex = new RegExp(`^(?:${programPattern})$`, "i");
    studentQuery.$or = [
      { program: programRegex },
      { programCode: programRegex },
    ];
  }
  if (t.batches.length) studentQuery.batch = { $in: t.batches };
  if (t.semesters.length && !studentIds.length) studentQuery.semester = { $in: t.semesters };
  if (t.sectionCodes.length && !studentIds.length) studentQuery.section = { $in: t.sectionCodes };

  const students = await Student.find(studentQuery)
    .select("_id user studentId firstName lastName program programCode batch semester section status")
    .lean();

  const resolvedStudents = students.map((s) => s._id);
  const resolvedStudentUsers = students.map((s) => s.user).filter(Boolean);

  if (!resolvedStudents.length) {
    throw validationError("No active students matched the selected academic group. Check enrollment records and target filters.", [
      { field: "classTarget", message: "No matching students found." },
    ]);
  }

  return { resolvedStudents, resolvedStudentUsers, students, classTarget: t };
}

export async function validateMeetingInvitees(userIds) {
  const ids = (Array.isArray(userIds) ? userIds : [])
    .map((v) => String(v || "").trim())
    .filter((v) => mongoose.Types.ObjectId.isValid(v));
  if (!ids.length) {
    throw validationError("Select at least one authorized staff participant for this meeting.", [
      { field: "invitedUsers", message: "Invitees are required." },
    ]);
  }
  const users = await User.find({ _id: { $in: ids }, isActive: { $ne: false } })
    .select("_id firstName lastName email collegeEmail roles activeRole isActive")
    .lean();
  const found = new Set(users.map((u) => String(u._id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw badRequest("One or more invited users do not exist or are inactive.");

  const invalid = [];
  for (const u of users) {
    const roles = normalizeRoles(getUserRoles(u));
    if (roles.every((r) => r === "student") || !roles.some((r) => STAFF_ONLY_ROLES.has(r))) {
      invalid.push(String(u._id));
    }
  }
  if (invalid.length) {
    throw forbidden("Students cannot be invited to institutional meetings, and invitees must be authorized staff.");
  }
  return users.map((u) => ({
    user: u._id,
    role: "PARTICIPANT",
    status: "INVITED",
    invitedAt: new Date(),
  }));
}

export function canViewSession(session, user) {
  if (!session || !user) return false;
  if (canManageConnectAdmin(user)) return true;
  const uid = String(user._id || user.id || "");
  const roles = normalizeRoles(getUserRoles(user));
  const studentOnly = roles.length > 0 && roles.every((r) => r === "student");

  if (session.sessionType === "ONLINE_MEETING") {
    // CRITICAL: students get zero visibility/metadata.
    if (studentOnly) return false;
    if (!isStaff(user)) return false;
    return isMeetingHostOrAdmin(session, user) || isInvitedToMeeting(session, user);
  }

  if (session.sessionType === "ONLINE_CLASS") {
    if (String(session.createdBy || "") === uid) return true;
    if (String(session.host || "") === uid) return true;
    if (String(session.assignedTeacher || "") === uid) return true;
    if ((session.coHosts || []).some((id) => String(id) === uid)) return true;
    if ((session.resolvedStudentUsers || []).some((id) => String(id) === uid)) return true;
    // Authorized academic admins may view class sessions for oversight.
    if (hasPermission(roles, "connect.reports.view") && isStaff(user)) return true;
    return false;
  }

  return false;
}

export function sanitizeSessionForUser(session, user, { includeSecrets = false } = {}) {
  const obj = session.toObject ? session.toObject() : session;
  const base = {
    id: String(obj._id),
    title: obj.title,
    description: obj.description || "",
    sessionType: obj.sessionType,
    status: obj.status,
    scheduledDate: obj.scheduledDate,
    startTime: obj.startTime,
    endTime: obj.endTime,
    durationMinutes: obj.durationMinutes,
    host: obj.host ? String(obj.host._id || obj.host) : null,
    assignedTeacher: obj.assignedTeacher ? String(obj.assignedTeacher._id || obj.assignedTeacher) : null,
    assignedTeacherName: obj.assignedTeacher && typeof obj.assignedTeacher === "object"
      ? [obj.assignedTeacher.firstName, obj.assignedTeacher.middleName, obj.assignedTeacher.lastName].filter(Boolean).join(" ")
      : null,
    assignedTeacherEmail: obj.assignedTeacher && typeof obj.assignedTeacher === "object"
      ? (obj.assignedTeacher.collegeEmail || obj.assignedTeacher.email || null)
      : null,
    course: obj.course ? String(obj.course._id || obj.course) : null,
    courseCode: obj.course && typeof obj.course === "object" ? (obj.course.code || null) : null,
    courseName: obj.course && typeof obj.course === "object" ? (obj.course.name || null) : null,
    coHosts: (obj.coHosts || []).map((id) => String(id._id || id)),
    createdBy: obj.createdBy ? String(obj.createdBy._id || obj.createdBy) : null,
    startedAt: obj.startedAt,
    endedAt: obj.endedAt,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };

  if (obj.sessionType === "ONLINE_CLASS") {
    base.classTarget = obj.classTarget || {};
    base.participantCount = (obj.resolvedStudentUsers || []).length;
    base.admissionPolicy = obj.admissionPolicy || "direct";
    base.waitingRoomRequests = (obj.waitingRoomRequests || []).filter((r) => String(r.status) === "pending").map((r) => ({
      id: String(r._id || r.id),
      userId: String(r.user),
      name: r.name,
      studentId: r.studentId,
      program: r.program,
      section: r.section,
      cameraOn: r.cameraOn,
      micOn: r.micOn,
      requestedAt: r.requestedAt,
      status: r.status,
    }));
    base.pendingAdmissionCount = base.waitingRoomRequests.length;
  }
  if (obj.sessionType === "ONLINE_MEETING") {
    base.invitedCount = (obj.invitedUsers || []).length;
    base.invitedUsers = (obj.invitedUsers || []).map((row) => ({
      user: String(row.user?._id || row.user),
      role: row.role,
      status: row.status,
    }));
  }

  if (includeSecrets && canManageConnectAdmin(user)) {
    base.credentials = {
      student: obj.studentCredential
        ? { sessionId16: obj.studentCredential.sessionId16, issuedAt: obj.studentCredential.issuedAt, revokedAt: obj.studentCredential.revokedAt, encryptedPassword: obj.studentCredential.encryptedPassword || null }
        : null,
      teacher: obj.teacherCredential
        ? { sessionId16: obj.teacherCredential.sessionId16, issuedAt: obj.teacherCredential.issuedAt, revokedAt: obj.teacherCredential.revokedAt, encryptedPassword: obj.teacherCredential.encryptedPassword || null }
        : null,
      meeting: obj.meetingCredential
        ? { sessionId16: obj.meetingCredential.sessionId16, issuedAt: obj.meetingCredential.issuedAt, revokedAt: obj.meetingCredential.revokedAt, encryptedPassword: obj.meetingCredential.encryptedPassword || null }
        : null,
    };
  }
  return base;
}

/* ------------------------------------------------------------------ */
/* Session listing sort helpers                                       */
/* ------------------------------------------------------------------ */

/* Parse a session's scheduled date+time into comparable ms. Returns null if unset. */
function sessionStartMs(s) {
  const date = String(s.scheduledDate || "").trim();
  const time = String(s.startTime || "00:00").trim();
  if (!date) return null;
  return Date.parse(`${date}T${time}:00`);
}

function sessionEndMs(s) {
  const date = String(s.scheduledDate || "").trim();
  const time = String(s.endTime || "00:00").trim();
  if (!date) return null;
  return Date.parse(`${date}T${time}:00`);
}

export const STATUS_COMPLETED = "COMPLETED";
export const STATUS_ENDED = "ENDED";

/* Student-facing status compatibility: historical ENDED records map to COMPLETED
 * for display and filtering. This avoids confusing students with Completed vs Ended.
 * Original termination metadata (endedBy, terminationReason, wasEndedEarly,
 * actualStartTime, actualEndTime) is preserved unchanged. */
export function studentFacingStatus(status) {
  const s = String(status || "").toUpperCase();
  if (s === STATUS_ENDED) return STATUS_COMPLETED;
  return s;
}

/* Lifecycle statuses that indicate a session is finished (no joining allowed). */
export const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "EXPIRED"]);

/* Lifecycle statuses that indicate a session is currently active. */
export const ACTIVE_STATUSES = new Set(["LIVE"]);

/* Status sort priority: Live → Scheduled → Completed → Cancelled → Expired */
function statusSortOrder(status) {
  const s = studentFacingStatus(status);
  if (s === "LIVE") return 0;
  if (s === "SCHEDULED") return 1;
  if (s === "COMPLETED") return 2;
  if (s === "CANCELLED") return 3;
  if (s === "EXPIRED") return 4;
  return 5; // unknown
}

/* Compare two sessions for the online-class listing order. */
function compareSessions(a, b) {
  const pa = statusSortOrder(a.status);
  const pb = statusSortOrder(b.status);
  if (pa !== pb) return pa - pb;

  if (pa === 0 || pa === 1) {
    // SCHEDULED or LIVE: earliest start first
    const da = sessionStartMs(a);
    const db = sessionStartMs(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }

  if (pa === 2) {
    // COMPLETED / ENDED: most recently finished first
    const da = sessionEndMs(a);
    const db = sessionEndMs(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return db - da;
  }

  // CANCELLED / EXPIRED / unknown: most recent first
  const da = sessionStartMs(a);
  const db = sessionStartMs(b);
  if (da === null && db === null) return 0;
  if (da === null) return 1;
  if (db === null) return -1;
  return db - da;
}

export async function listVisibleSessions(user, { type, status } = {}) {
  const roles = normalizeRoles(getUserRoles(user));
  const studentOnly = roles.length > 0 && roles.every((r) => r === "student");
  const uid = new mongoose.Types.ObjectId(String(user._id || user.id));
  const filter = {};

  if (type) filter.sessionType = type;
  if (status) filter.status = status;

  if (canManageConnectAdmin(user)) {
    // admin sees all (both types)
  } else if (studentOnly) {
    // CRITICAL: students never see meetings or meeting metadata.
    filter.sessionType = "ONLINE_CLASS";
    filter.$or = [{ resolvedStudentUsers: uid }];
  } else if (!isStaff(user)) {
    return [];
  } else {
    // Staff: classes they host/assigned/created + meetings they host/invited to.
    // Academic oversight (connect.reports.view) may list all classes but never meetings.
    filter.$or = [
      { sessionType: "ONLINE_CLASS", $or: [{ host: uid }, { assignedTeacher: uid }, { coHosts: uid }, { createdBy: uid }] },
      { sessionType: "ONLINE_MEETING", $or: [{ host: uid }, { coHosts: uid }, { createdBy: uid }, { "invitedUsers.user": uid }] },
    ];
    if (hasPermission(roles, "connect.reports.view")) {
      filter.$or.unshift({ sessionType: "ONLINE_CLASS" });
    }
  }

  const sessions = await VirtualSession.find(filter)
    .populate("course", "code name")
    .populate("assignedTeacher", "firstName middleName lastName collegeEmail email")
    .limit(200)
    .lean();

  // Status-priority sort: Scheduled first (earliest first), then Live, then
  // Completed/Ended (most recent finished first), then cancelled/expired.
  sessions.sort(compareSessions);

  // Final guard: never leak meetings to students.
  return sessions
    .filter((s) => canViewSession(s, user))
    .map((s) => sanitizeSessionForUser(s, user));
}

function pickUserName(user) {
  if (!user) return "User";
  return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ").trim() || "User";
}

function pickUserEmail(user) {
  return String(user?.collegeEmail || user?.email || "").trim().toLowerCase();
}

function publicOrigin() {
  return String(process.env.PUBLIC_ORIGIN || process.env.FRONTEND_ORIGIN || "http://localhost:3000").replace(/\/+$/, "");
}

async function createSecureAccountSetupLink(user) {
  // Never email permanent plaintext passwords. For passive/inactive accounts, issue a
  // time-bound password setup token using the existing reset-token mechanism.
  const inactive = Boolean(user?.mustChangePassword) || String(user?.accountStatus || "") === "PASSIVE";
  if (!inactive) return null;
  await invalidatePasswordResetTokens(user._id);
  const { token, expiresAt } = await createPasswordResetToken(user._id);
  return {
    url: `${publicOrigin()}/auth/reset-password?token=${encodeURIComponent(token)}`,
    expiresAt,
  };
}

function normLoose(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function courseToOffering(course, meta = {}) {
  return {
    courseId: String(course._id),
    courseCode: course.code,
    courseName: course.name,
    department: course.department || null,
    program: course.program || course.programCode || null,
    programCode: course.program || course.programCode || null,
    academicYear: course.academicYear || null,
    semester: course.semester ?? null,
    batch: meta.batch || null,
    sections: Array.isArray(meta.sections) ? meta.sections : [],
    sectionCount: Number(meta.sectionCount || 0),
    teacherCount: Number(meta.teacherCount || 0),
    enrollmentCount: Number(meta.enrollmentCount || 0),
    source: "course",
  };
}

export async function searchConnectCourses({ q, courseName, courseCode, limit = 40 } = {}) {
  const nameQ = normLoose(courseName || q);
  const codeQ = String(courseCode || "").trim().toUpperCase();
  const filter = { status: "ACTIVE" };
  const ors = [];
  if (codeQ) ors.push({ code: new RegExp(codeQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") });
  if (nameQ) ors.push({ name: new RegExp(nameQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") });
  if (ors.length) filter.$or = ors;
  const rows = await Course.find(filter)
    .select("_id code name department program programCode semester academicYear courseType status")
    .sort({ code: 1, name: 1, academicYear: -1, semester: 1 })
    .limit(Math.max(1, Math.min(Number(limit) || 40, 100)))
    .lean();
  return rows.map((c) => courseToOffering(c));
}

export async function resolveCourseIdentityForConnect({ courseName, courseCode }) {
  const name = String(courseName || "").trim();
  const code = String(courseCode || "").trim();
  if (!name || !code) {
    throw validationError("Course/Subject Name and Course Code are required in Step 1.", [
      { field: "courseName", message: "Course/Subject Name is required." },
      { field: "courseCode", message: "Course Code is required." },
    ]);
  }
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = await Course.find({
    status: "ACTIVE",
    code: new RegExp(`^${esc(code)}$`, "i"),
    name: new RegExp(`^${esc(name)}$`, "i"),
  })
    .select("_id code name department program programCode semester academicYear")
    .sort({ academicYear: -1, semester: 1 })
    .limit(200)
    .lean();

  let candidates = exact;
  if (!candidates.length) {
    candidates = await Course.find({
      status: "ACTIVE",
      $or: [
        { code: new RegExp(`^${esc(code)}$`, "i") },
        { name: new RegExp(`^${esc(name)}$`, "i") },
      ],
    })
      .select("_id code name department program programCode semester academicYear")
      .sort({ code: 1, name: 1 })
      .limit(50)
      .lean();
  }
  if (!candidates.length) {
    throw validationError(
      "The selected Course Name and Course Code do not match an active curriculum subject. Choose a valid existing subject from curriculum records.",
      [{ field: "courseCode", message: "Course identity is not valid." }],
    );
  }
  // Ensure name/code identify the same valid course family (codes/names consistent).
  const normName = normLoose(name);
  const normCode = String(code).trim().toUpperCase();
  const valid = candidates.filter(
    (c) => normLoose(c.name) === normName && String(c.code || "").toUpperCase() === normCode,
  );
  if (exact.length && !valid.length) {
    // should not happen; defensive
  }
  if (!valid.length) {
    throw validationError(
      "Course Name and Course Code do not identify the same curriculum subject. Use the matching name and code from an existing subject.",
      [
        { field: "courseName", message: "Course Name/Code mismatch." },
        { field: "courseCode", message: "Course Name/Code mismatch." },
      ],
    );
  }
  return { valid: true, courseName: valid[0].name, courseCode: valid[0].code, courseIds: valid.map((c) => String(c._id)) };
}

export async function resolveConnectClassSections({ courseId, program, academicYear, semester, batch } = {}) {
  if (!courseId || !mongoose.Types.ObjectId.isValid(String(courseId))) {
    throw badRequest("A valid course/subject is required to load sections.");
  }
  const sem = semester != null && String(semester).trim() !== "" ? Number(semester) : null;
  const ay = String(academicYear || "").trim();
  const courseOid = new mongoose.Types.ObjectId(String(courseId));
  const baseEnroll = { course: courseOid, status: "ENROLLED" };
  if (ay) baseEnroll.academicYear = ay;
  if (Number.isFinite(sem)) baseEnroll.semester = sem;
  const baseAlloc = { course: courseOid };
  if (ay) baseAlloc.academicYear = ay;
  if (Number.isFinite(sem)) baseAlloc.semester = sem;

  const [enrollSections, allocSections] = await Promise.all([
    Enrollment.aggregate([
      { $match: baseEnroll },
      { $group: { _id: "$sectionCode", enrollmentCount: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    CourseTeachingAssignment.aggregate([
      { $match: baseAlloc },
      { $group: { _id: "$sectionCode", teacherCount: { $addToSet: "$facultyUser" } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const map = new Map();
  for (const r of enrollSections) {
    const code = String(r._id || "").toUpperCase();
    if (!code) continue;
    map.set(code, { code, enrollmentCount: r.enrollmentCount || 0, teacherCount: 0 });
  }
  for (const r of allocSections) {
    const code = String(r._id || "").toUpperCase();
    if (!code) continue;
    const row = map.get(code) || { code, enrollmentCount: 0, teacherCount: 0 };
    row.teacherCount = (r.teacherCount || []).length;
    map.set(code, row);
  }
  const sections = Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  if (sections.length) {
    return {
      sections,
      totalEnrollment: sections.reduce((n, s) => n + (s.enrollmentCount || 0), 0),
      hasAny: sections.length > 0,
    };
  }
  // Fallback: course-only sections when year/semester metadata differs.
  const [e2, a2] = await Promise.all([
    Enrollment.aggregate([{ $match: { course: courseOid, status: "ENROLLED" } }, { $group: { _id: "$sectionCode", enrollmentCount: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    CourseTeachingAssignment.aggregate([{ $match: { course: courseOid } }, { $group: { _id: "$sectionCode", teacherCount: { $addToSet: "$facultyUser" } } }, { $sort: { _id: 1 } }]),
  ]);
  const map2 = new Map();
  for (const r of e2) { const code = String(r._id || "").toUpperCase(); if (!code) continue; map2.set(code, { code, enrollmentCount: r.enrollmentCount || 0, teacherCount: 0 }); }
  for (const r of a2) { const code = String(r._id || "").toUpperCase(); if (!code) continue; const row = map2.get(code) || { code, enrollmentCount: 0, teacherCount: 0 }; row.teacherCount = (r.teacherCount || []).length; map2.set(code, row); }
  const sections2 = Array.from(map2.values()).sort((a, b) => a.code.localeCompare(b.code));
  return { sections: sections2, totalEnrollment: sections2.reduce((n, s) => n + (s.enrollmentCount || 0), 0), hasAny: sections2.length > 0 };
}

export async function resolveCourseOfferingsForConnect(courseId, { courseName, courseCode } = {}) {
  // Resolve valid academic offerings from real records (Course + enrollments + allocations).
  let identityIds = null;
  if (!courseId && (courseName || courseCode)) {
    const idv = await resolveCourseIdentityForConnect({ courseName, courseCode });
    identityIds = idv.courseIds;
  }
  const filter = { status: "ACTIVE" };
  if (courseId) {
    if (!mongoose.Types.ObjectId.isValid(String(courseId))) throw badRequest("Course/Subject is invalid.");
    filter._id = new mongoose.Types.ObjectId(String(courseId));
  } else if (identityIds?.length) {
    filter._id = { $in: identityIds.map((id) => new mongoose.Types.ObjectId(id)) };
  } else {
    throw validationError("Select a valid course/subject first.", [{ field: "courseId", message: "Course is required." }]);
  }
  const courses = await Course.find(filter)
    .select("_id code name department program programCode semester academicYear")
    .lean();
  if (!courses.length) throw notFound("Selected course/subject was not found.");

  const ids = courses.map((c) => c._id);
  const [enrollmentAgg, allocAgg, sectionAgg] = await Promise.all([
    Enrollment.aggregate([
      { $match: { course: { $in: ids }, status: "ENROLLED" } },
      { $group: { _id: { course: "$course", academicYear: "$academicYear", semester: "$semester" }, enrollmentCount: { $sum: 1 }, sections: { $addToSet: "$sectionCode" } } },
    ]),
    CourseTeachingAssignment.aggregate([
      { $match: { course: { $in: ids } } },
      { $group: { _id: { course: "$course", academicYear: "$academicYear", semester: "$semester" }, teacherCount: { $addToSet: "$facultyUser" }, sections: { $addToSet: "$sectionCode" } } },
    ]),
    // best-effort section names by program/semester
    Promise.resolve([]),
  ]);

  const key = (course, ay, sem) => `${String(course)}|${String(ay || "")}|${String(sem ?? "")}`;
  const eMap = new Map();
  for (const r of enrollmentAgg) eMap.set(key(r._id.course, r._id.academicYear, r._id.semester), r);
  const aMap = new Map();
  for (const r of allocAgg) aMap.set(key(r._id.course, r._id.academicYear, r._id.semester), r);

  const offerings = [];
  const seen = new Set();
  for (const c of courses) {
    const baseKey = key(c._id, c.academicYear, c.semester);
    const e = eMap.get(baseKey);
    const a = aMap.get(baseKey);
    const sections = [...new Set([...(e?.sections || []), ...(a?.sections || [])].filter(Boolean))].sort();
    const off = courseToOffering(c, {
      sections,
      sectionCount: sections.length,
      enrollmentCount: e?.enrollmentCount || 0,
      teacherCount: (a?.teacherCount || []).length,
    });
    const sig = `${off.courseId}|${off.programCode || ""}|${off.academicYear || ""}|${off.semester ?? ""}`;
    if (!seen.has(sig)) { seen.add(sig); offerings.push(off); }
  }
  // include enrollment-derived offering variants (e.g., different academic year) when present
  for (const r of enrollmentAgg) {
    const c = courses.find((x) => String(x._id) === String(r._id.course));
    if (!c) continue;
    const off = courseToOffering(c, {
      sections: [...new Set((r.sections || []).filter(Boolean))].sort(),
      sectionCount: (r.sections || []).filter(Boolean).length,
      enrollmentCount: r.enrollmentCount || 0,
      teacherCount: 0,
    });
    off.academicYear = r._id.academicYear || off.academicYear;
    off.semester = r._id.semester ?? off.semester;
    off.source = "enrollment";
    const sig = `${off.courseId}|${off.programCode || ""}|${off.academicYear || ""}|${off.semester ?? ""}`;
    if (!seen.has(sig)) { seen.add(sig); offerings.push(off); }
  }

  offerings.sort((x, y) => String(y.academicYear || "").localeCompare(String(x.academicYear || "")) || Number(x.semester || 0) - Number(y.semester || 0));
  return {
    valid: true,
    identity: { courseName: courses[0].name, courseCode: courses[0].code },
    offerings,
  };
}

export async function resolveCourseForConnectClass(courseId, classTarget = {}) {
  if (!courseId) {
    throw validationError("Select the course/subject for this online class.", [
      { field: "courseId", message: "Course/subject is required." },
    ]);
  }
  if (!mongoose.Types.ObjectId.isValid(String(courseId))) {
    throw badRequest("Course/subject is invalid.");
  }
  const course = await Course.findById(courseId).lean();
  if (!course) throw notFound("Selected course/subject was not found.");
  if (String(course.status || "ACTIVE").toUpperCase() === "ARCHIVED") {
    throw validationError("The selected course/subject is archived and cannot be used for a new class.", [
      { field: "courseId", message: "Select an active course/subject." },
    ]);
  }

  // Validate the course belongs to the selected academic audience (curriculum/placement).
  // Be permissive when target is incomplete (UI may auto-derive from offering).
  const targetPrograms = (classTarget.programCodes || []).map((v) => String(v).toUpperCase());
  const courseProgram = String(course.program || course.programCode || "").toUpperCase();
  if (targetPrograms.length && courseProgram && !targetPrograms.includes(courseProgram)) {
    throw validationError("The selected course/subject does not belong to the selected program.", [
      { field: "courseId", message: "Select a course from the chosen academic audience." },
    ]);
  }
  const targetSemesters = (classTarget.semesters || []).map(Number).filter((n) => Number.isFinite(n));
  if (targetSemesters.length && course.semester != null && !targetSemesters.includes(Number(course.semester))) {
    throw validationError("The selected course/subject does not belong to the selected semester.", [
      { field: "courseId", message: "Select a course from the chosen academic audience." },
    ]);
  }
  const targetYears = (classTarget.academicYears || []).map((v) => String(v).trim());
  if (targetYears.length && course.academicYear && !targetYears.includes(String(course.academicYear).trim())) {
    throw validationError("The selected course/subject does not belong to the selected academic year.", [
      { field: "courseId", message: "Select a course from the chosen academic audience." },
    ]);
  }
  return course;
}

function buildTeacherAllocationQuery(courseId, classTarget = {}) {
  const sectionCodes = (classTarget.sectionCodes || []).map((v) => String(v).trim().toUpperCase()).filter(Boolean);
  const semesters = (classTarget.semesters || []).map(Number).filter((n) => Number.isFinite(n));
  const years = (classTarget.academicYears || []).map((v) => String(v).trim()).filter(Boolean);
  const query = { course: courseId };
  if (semesters.length === 1) query.semester = semesters[0];
  else if (semesters.length > 1) query.semester = { $in: semesters };
  // CourseTeachingAssignment stores section/academicYear; broaden only when audience is unspecified.
  if (sectionCodes.length === 1) query.sectionCode = sectionCodes[0];
  else if (sectionCodes.length > 1) query.sectionCode = { $in: sectionCodes };
  if (years.length === 1) query.academicYear = years[0];
  else if (years.length > 1) query.academicYear = { $in: years };
  return query;
}

export async function listAssignedTeachersForCourse(courseId, classTarget = {}) {
  const course = await resolveCourseForConnectClass(courseId, classTarget);
  const courseOid = course._id;
  const facultyFields = "_id firstName middleName lastName email collegeEmail roles activeRole isActive accountStatus mustChangePassword";

  // 1. Precise section-level allocations from CourseTeachingAssignment (course + section + semester + year).
  // These are the same authoritative allocation records used by Course Teaching Assignments.
  const ctaRows = await CourseTeachingAssignment.find(buildTeacherAllocationQuery(courseOid, classTarget))
    .populate("facultyUser", facultyFields)
    .lean();

  // 2. Subject-level faculty assignments (FacultySubjectAssignment) — an active responsibility to teach this subject.
  // A faculty member with an active FacultySubjectAssignment for the course is a valid class host for the selected
  // offering. Program/semester/year are already validated against the target by resolveCourseForConnectClass.
  const fsaRows = await FacultySubjectAssignment.find({ course: courseOid, isActive: true })
    .populate("facultyUser", facultyFields)
    .lean();

  const byId = new Map();
  const addTeacher = (row, source) => {
    const u = row.facultyUser;
    if (!u || u.isActive === false) return;
    const roles = normalizeRoles(getUserRoles(u));
    if (roles.every((r) => r === "student")) return;
    const id = String(u._id);
    if (byId.has(id)) return;
    byId.set(id, {
      id,
      name: pickUserName(u),
      email: u.collegeEmail || u.email || null,
      sectionCode: row.sectionCode || null,
      semester: row.semester ?? course.semester ?? null,
      academicYear: row.academicYear || course.academicYear || null,
      allocationType: source,
    });
  };
  for (const row of ctaRows) addTeacher(row, "CourseTeachingAssignment");
  for (const row of fsaRows) addTeacher(row, "FacultySubjectAssignment");

  return {
    course: {
      id: String(course._id),
      code: course.code,
      name: course.name,
      department: course.department || null,
      program: course.program || course.programCode || null,
      semester: course.semester ?? null,
      academicYear: course.academicYear || null,
    },
    teachers: Array.from(byId.values()),
  };
}

export async function validateAssignedTeacherForClass({ courseId, assignedTeacherId, classTarget }) {
  const teacherId = String(assignedTeacherId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    throw validationError("Select the assigned teacher / class host for this subject.", [
      { field: "assignedTeacherId", message: "Assigned teacher is required." },
    ]);
  }
  const { course, teachers } = await listAssignedTeachersForCourse(courseId, classTarget);
  if (!teachers.length) {
    throw validationError(
      "This subject does not have a valid teacher allocation for the selected academic group. Assign a teacher to the subject before creating an online class.",
      [{ field: "assignedTeacherId", message: "No teacher allocation found for this subject." }],
    );
  }
  const match = teachers.find((t) => String(t.id) === teacherId);
  if (!match) {
    throw validationError("The selected teacher is not assigned to this subject for the selected academic group.", [
      { field: "assignedTeacherId", message: "Choose a teacher allocated to this subject." },
    ]);
  }
  const teacher = await User.findById(teacherId)
    .select("_id firstName middleName lastName email collegeEmail roles activeRole isActive accountStatus mustChangePassword")
    .lean();
  if (!teacher || teacher.isActive === false) throw badRequest("Selected teacher account is unavailable.");
  return { course, teacher, allocation: match };
}

async function notifyAssignedTeacherForClass(session, { teacher, course, classTarget, actor }) {
  if (!teacher?._id && !teacher?.id) return;
  const teacherId = String(teacher._id || teacher.id);
  const actorUser = actor ? (actor.toObject ? actor.toObject() : actor) : null;
  const actorId = String(actorUser?._id || actorUser?.id || "") || teacherId;
  const program = (classTarget?.programCodes || []).join(", ") || course?.program || course?.programCode || "—";
  const academicYear = (classTarget?.academicYears || []).join(", ") || course?.academicYear || "—";
  const semester = (classTarget?.semesters || []).length ? (classTarget.semesters || []).join(", ") : (course?.semester ?? "—");
  const batch = (classTarget?.batches || []).join(", ") || "—";
  const section = (classTarget?.sectionCodes || []).join(", ") || "All sections";
  const schedule = [session.scheduledDate || "Date not set", [session.startTime, session.endTime].filter(Boolean).join("–")].filter(Boolean).join(" · ");
  const connectUrl = `${publicOrigin()}/connect`;
  const teacherName = pickUserName(teacher);

  // Targeted in-app notification (assigned teacher only) — idempotent.
  await notifyOnce({
    userId: teacherId,
    sender: actorId,
    senderType: "department",
    senderLabel: "CollegeOS Administration",
    senderDepartment: "Administration",
    title: `Assigned as class host: ${session.title}`,
    message: `${course?.code || "Course"}${course?.name ? ` — ${course.name}` : ""} · ${schedule}. You are the class host.`,
    category: "connect",
    priority: "normal",
    actionUrl: "/connect",
    relatedEntityType: "online_class",
    relatedEntityId: session._id,
    idempotencyKey: `connect:class:${String(session._id)}:${teacherId}:host-assigned`,
    metadata: {
      sessionId: String(session._id),
      sessionType: "ONLINE_CLASS",
      role: "HOST",
      courseId: String(course?._id || course?.id || ""),
      courseCode: course?.code || null,
      courseName: course?.name || null,
      program: program !== "—" ? program : null,
      academicYear: academicYear !== "—" ? academicYear : null,
      semester: semester !== "—" ? semester : null,
      batch: batch !== "—" ? batch : null,
      section: section !== "All sections" ? section : null,
      scheduledDate: session.scheduledDate || null,
      startTime: session.startTime || null,
      endTime: session.endTime || null,
      assignedBy: pickUserName(actorUser),
    },
  });

  // Targeted institutional email (assigned teacher only) via existing College Mail infrastructure.
  // Never email permanent plaintext passwords. For inactive accounts, provide secure activation/setup link.
  const teacherEmail = pickUserEmail(teacher);
  if (!teacherEmail) return;
  let setup = null;
  try { setup = await createSecureAccountSetupLink(teacher); } catch (e) { console.error("Connect activation link generation failed:", e?.message || e); }

  const activationBlock = setup
    ? `\nAccount access (secure):\nYour CollegeOS account requires activation/password setup before you can access the class. Use this secure link to set your password:\n${setup.url}\nThis link expires at ${setup.expiresAt}.\nNever share this link. CollegeOS will not email your password.\n`
    : `\nAccess:\nSign in with your CollegeOS account to access this class.\n`;

  const body = [
    `Hello ${teacherName},`,
    "",
    `You have been assigned as the class host for an online class in CollegeOS Connect.`,
    "",
    `Class title: ${session.title}`,
    `Course/Subject: ${course?.code || "—"}${course?.name ? ` — ${course.name}` : ""}`,
    `Academic program: ${program}`,
    `Academic year: ${academicYear}`,
    `Semester: ${semester}`,
    `Batch: ${batch}`,
    `Section: ${section}`,
    `Class date and time: ${schedule || "—"}`,
    `Class host responsibility: You are responsible for hosting and managing this online class.`,
    activationBlock,
    `Secure CollegeOS Connect access: ${connectUrl}`,
    "",
    "This message was sent only to the assigned class host.",
  ].join("\n");

  try {
    await Mail.create({
      sender: actorId,
      senderEmail: pickUserEmail(actorUser) || "noreply@collegeos.local",
      senderName: actorUser ? pickUserName(actorUser) : "CollegeOS",
      recipientEmails: [teacherEmail],
      recipients: [teacherId],
      subject: `Class host assignment: ${session.title}`,
      body,
      isDraft: false,
      userStates: [
        ...(actorId && String(actorId) !== teacherId ? [{ user: actorId, folder: "sent", isRead: true }] : []),
        { user: teacherId, folder: "inbox", isRead: false },
      ],
    });
  } catch (err) {
    console.error("Connect teacher assignment mail failed:", err?.message || err);
  }
}

export async function notifyConnectClassCreated(session, { teacher, course, classTarget, actor }) {
  await notifyAssignedTeacherForClass(session, { teacher, course, classTarget, actor });
  await notifyClassParticipants(session, actor);
}

export async function notifyClassParticipants(session, actor) {
  // Notify resolved students (and explicit co-hosts, if any). The assigned host teacher is
  // notified separately via notifyAssignedTeacherForClass to avoid duplicate targeted mail.
  const userIds = (session.resolvedStudentUsers || []).map(String).filter(Boolean);
  const extraStaffIds = (session.coHosts || []).map((id) => String(id)).filter(Boolean);
  const title = `Online class scheduled: ${session.title}`;
  const message = `Class on ${session.scheduledDate || "scheduled date"} ${session.startTime || ""}`.trim();
  const actionUrl = "/connect";

  for (const userId of [...new Set([...extraStaffIds, ...userIds])]) {
    await notifyOnce({
      userId,
      sender: actor?._id || actor?.id || null,
      senderType: "system",
      senderLabel: "CollegeOS Connect",
      title,
      message,
      category: "connect",
      priority: "normal",
      actionUrl,
      relatedEntityType: "online_class",
      relatedEntityId: session._id,
      idempotencyKey: `connect:class:${String(session._id)}:${userId}:scheduled`,
      metadata: { sessionId: String(session._id), sessionType: "ONLINE_CLASS" },
    });
  }

  // Optional mail mirror for students (best-effort; never blocks creation)
  try {
    const students = await Student.find({ _id: { $in: session.resolvedStudents || [] } })
      .select("user email firstName lastName")
      .lean();
    const users = await User.find({ _id: { $in: students.map((s) => s.user).filter(Boolean) } })
      .select("_id email collegeEmail")
      .lean();
    const recipientEmails = users
      .map((u) => String(u.collegeEmail || u.email || "").toLowerCase())
      .filter(Boolean);
    if (recipientEmails.length && actor) {
      const senderEmail = String(actor.collegeEmail || actor.email || "").toLowerCase();
      await Mail.create({
        sender: actor._id || actor.id,
        senderEmail,
        senderName: [actor.firstName, actor.lastName].filter(Boolean).join(" ") || "CollegeOS",
        recipientEmails,
        recipients: users.map((u) => u._id),
        subject: title,
        body: `${message}\n\nJoin from CollegeOS Connect. Use your CollegeOS account and the session credentials provided by your institution.`,
        isDraft: false,
        userStates: [
          { user: actor._id || actor.id, folder: "sent", isRead: true },
          ...users.map((u) => ({ user: u._id, folder: "inbox", isRead: false })),
        ],
      });
    }
  } catch (err) {
    console.error("Connect class mail notify failed:", err?.message || err);
  }
}

export async function notifyMeetingInvitees(session, actor) {
  const recipients = (session.invitedUsers || []).map((r) => String(r.user)).filter(Boolean);
  const all = [...new Set([String(session.host), ...recipients])];
  const title = `Meeting invitation: ${session.title}`;
  const message = `Meeting on ${session.scheduledDate || "scheduled date"} ${session.startTime || ""}`.trim();
  for (const userId of all) {
    await notifyOnce({
      userId,
      sender: actor?._id || actor?.id || null,
      senderType: "user",
      senderLabel: [actor?.firstName, actor?.lastName].filter(Boolean).join(" ").trim() || "CollegeOS",
      title,
      message,
      category: "connect",
      priority: "normal",
      actionUrl: "/connect",
      relatedEntityType: "online_meeting",
      relatedEntityId: session._id,
      idempotencyKey: `connect:meeting:${String(session._id)}:${userId}:invited`,
      metadata: { sessionId: String(session._id), sessionType: "ONLINE_MEETING" },
    });
  }

  // Safety: never mail students (invitees already validated)
  try {
    const users = await User.find({ _id: { $in: all } }).select("_id email collegeEmail firstName lastName roles activeRole").lean();
    const safe = users.filter((u) => !normalizeRoles(getUserRoles(u)).every((r) => r === "student"));
    if (safe.length && actor) {
      const senderEmail = String(actor.collegeEmail || actor.email || "").toLowerCase();
      await Mail.create({
        sender: actor._id || actor.id,
        senderEmail,
        senderName: [actor.firstName, actor.lastName].filter(Boolean).join(" ") || "CollegeOS",
        recipientEmails: safe.map((u) => String(u.collegeEmail || u.email || "").toLowerCase()).filter(Boolean),
        recipients: safe.map((u) => u._id),
        subject: title,
        body: `${message}\n\nJoin from CollegeOS Connect. This meeting is visible only to invited staff.`,
        isDraft: false,
        userStates: [
          { user: actor._id || actor.id, folder: "sent", isRead: true },
          ...safe.filter((u) => String(u._id) !== String(actor._id || actor.id)).map((u) => ({ user: u._id, folder: "inbox", isRead: false })),
        ],
      });
    }
  } catch (err) {
    console.error("Connect meeting mail notify failed:", err?.message || err);
  }
}

export function resolveConnectParticipantRole(session, user) {
  if (!canViewSession(session, user)) return null;
  const uid = String(user?._id || user?.id || "");
  if (!uid) return null;
  const roles = normalizeRoles(getUserRoles(user));

  if (session.sessionType === "ONLINE_MEETING") {
    if (isStudentOnly(user)) return null; // defense in depth
    if (canManageConnectAdmin(user)) return "HOST";
    if (String(session.host || "") === uid || String(session.createdBy || "") === uid) return "HOST";
    if ((session.coHosts || []).some((id) => String(id) === uid)) return "CO_HOST";
    if (isInvitedToMeeting(session, user)) return "INVITED_STAFF";
    if (isStaff(user) && hasPermission(roles, "connect.meeting.manage")) return "STAFF";
    return null;
  }

  if (session.sessionType === "ONLINE_CLASS") {
    if ((session.resolvedStudentUsers || []).some((id) => String(id) === uid)) return "STUDENT";
    if (canManageConnectAdmin(user)) return "HOST";
    if (String(session.host || "") === uid) return "TEACHER";
    if (String(session.assignedTeacher || "") === uid) return "TEACHER";
    // Creator is not automatically the class host; admin access is granted via canManageConnectAdmin/connect.admin above.
    if ((session.coHosts || []).some((id) => String(id) === uid)) return "CO_HOST";
    if (isStaff(user) && hasPermission(roles, "connect.class.manage")) return "TEACHER";
    if (isStaff(user) && hasPermission(roles, "connect.reports.view")) return "STAFF";
  }
  return null;
}

// done
