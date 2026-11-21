import {
  StudentIdentityVerification,
  VerificationHistory,
  Student,
  User,
} from "../../models/index.js";
import {
  getUserById,
  getStudentByUserId,
  getUserRoles,
  authorizeUser,
  logAudit,
} from "../../db.js";
import {
  badRequest,
  notFound,
  forbidden,
} from "../../utils/apiError.js";
import { createAndEmitNotification } from "../notificationService.js";

const INSTITUTION_ID = "techspire";

function isAdminOrCoordinator(user) {
  return authorizeUser(user, ["super_admin", "dean", "hod", "program_coordinator", "registrar"]);
}

async function resolveStudentForUser(user) {
  const roles = getUserRoles(user);
  if (roles.includes("student")) {
    const student = await getStudentByUserId(user._id || user.id);
    if (!student) {
      throw notFound("Student profile not found for the current user.");
    }
    return student;
  }
  return null;
}

async function buildVerificationAccess(user, studentId) {
  const roles = getUserRoles(user);
  const isAdmin = isAdminOrCoordinator(user);

  if (isAdmin) {
    if (studentId) {
      const student = await Student.findById(studentId).lean();
      if (!student) throw notFound("Student not found.");
      return { student };
    }
    return { all: true };
  }

  if (roles.includes("student")) {
    const student = await resolveStudentForUser(user);
    if (!student) throw notFound("Student profile not found.");
    if (studentId && String(student._id) !== String(studentId)) {
      throw forbidden("Students may only access their own verification records.");
    }
    return { student };
  }

  throw forbidden("Insufficient role to access verification records.");
}

/* ------------------------------------------------------------------ */
/* Student Identity Verification                                      */
/* ------------------------------------------------------------------ */

export async function listVerifications({ user, query }) {
  const { all, student } = await buildVerificationAccess(user, query.student);
  const filter = {};
  if (all) {
    if (query.student) filter.student = query.student;
    if (query.status) filter.status = query.status;
    if (query.reviewer) filter.reviewer = query.reviewer;
  } else if (student) {
    filter.student = student._id;
  }

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    StudentIdentityVerification.find(filter)
      .populate("student", "studentId firstName lastName program batch semester status email")
      .populate("reviewer", "firstName middleName lastName email roles")
      .populate("submittedBy", "firstName middleName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StudentIdentityVerification.countDocuments(filter),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getVerification({ user, verificationId }) {
  const verification = await StudentIdentityVerification.findById(verificationId)
    .populate("student", "studentId firstName lastName program batch semester status email")
    .populate("reviewer", "firstName middleName lastName email roles")
    .populate("submittedBy", "firstName middleName lastName email")
    .lean();
  if (!verification) throw notFound("Verification record not found.");

  await buildVerificationAccess(user, String(verification.student));
  return verification;
}

export async function submitVerification({ user, body }) {
  const roles = getUserRoles(user);
  if (!roles.includes("student")) {
    throw forbidden("Only students may submit their own identity verification.");
  }

  const student = await resolveStudentForUser(user);
  if (!student) throw notFound("Student profile not found.");

  const existing = await StudentIdentityVerification.findOne({ student: student._id });
  if (existing) {
    throw conflict("A verification record already exists for this student.");
  }

  const {
    declaredStudentId,
    declaredName,
    declaredEmail,
    declaredEnrollmentStatus,
    declaredDepartment,
    declaredProgram,
    declaredBatch,
    declaredSemester,
    supportingDocuments,
  } = body || {};

  const verification = await StudentIdentityVerification.create({
    institutionId: INSTITUTION_ID,
    student: student._id,
    submittedBy: user._id || user.id,
    status: "PENDING_VERIFICATION",
    declaredStudentId: declaredStudentId || null,
    declaredName: declaredName || null,
    declaredEmail: declaredEmail || null,
    declaredEnrollmentStatus: declaredEnrollmentStatus || null,
    declaredDepartment: declaredDepartment || null,
    declaredProgram: declaredProgram || null,
    declaredBatch: declaredBatch || null,
    declaredSemester: declaredSemester ? Number(declaredSemester) : null,
    supportingDocuments: Array.isArray(supportingDocuments) ? supportingDocuments : [],
  });

  await logAudit({
    userId: user._id || user.id,
    action: "STUDENT_VERIFICATION_SUBMITTED",
    module: "student-verification",
    resource: "StudentIdentityVerification",
    resourceId: String(verification._id),
    newValue: { student: String(student._id), status: "PENDING_VERIFICATION" },
  });

  return verification;
}

export async function reviewVerification({ user, verificationId, body }) {
  if (!isAdminOrCoordinator(user)) {
    throw forbidden("Only authorized administrators may review student verification.");
  }

  const verification = await StudentIdentityVerification.findById(verificationId);
  if (!verification) throw notFound("Verification record not found.");

  const { status, rejectionReason, additionalInfoRequested, verificationNotes, expiresAt } = body || {};
  const allowedStatuses = [
    "VERIFIED",
    "REJECTED",
    "ADDITIONAL_INFORMATION_REQUIRED",
    "SUSPENDED",
  ];
  if (!status || !allowedStatuses.includes(status)) {
    throw badRequest(`Invalid status. Allowed: ${allowedStatuses.join(", ")}`);
  }

  const oldStatus = verification.status;
  verification.status = status;
  verification.reviewer = user._id || user.id;
  verification.reviewedAt = new Date();
  if (rejectionReason !== undefined) verification.rejectionReason = rejectionReason;
  if (additionalInfoRequested !== undefined) verification.additionalInfoRequested = additionalInfoRequested;
  if (verificationNotes !== undefined) verification.verificationNotes = verificationNotes;
  if (expiresAt !== undefined) verification.expiresAt = expiresAt ? new Date(expiresAt) : null;

  // When verified, populate verified fields from declared fields as the
  // confirmed institutional record.
  if (status === "VERIFIED") {
    verification.verifiedStudentId = verification.declaredStudentId;
    verification.verifiedName = verification.declaredName;
    verification.verifiedEmail = verification.declaredEmail;
    verification.verifiedEnrollmentStatus = verification.declaredEnrollmentStatus;
    verification.verifiedDepartment = verification.declaredDepartment;
    verification.verifiedProgram = verification.declaredProgram;
    verification.verifiedBatch = verification.declaredBatch;
    verification.verifiedSemester = verification.declaredSemester;
  }

  await verification.save();

  await VerificationHistory.create({
    verification: verification._id,
    student: verification.student,
    fromStatus: oldStatus,
    toStatus: status,
    actor: user._id || user.id,
    action: `REVIEW_${status}`,
    reason: rejectionReason || additionalInfoRequested || "",
  });

  await logAudit({
    userId: user._id || user.id,
    action: "STUDENT_VERIFICATION_REVIEWED",
    module: "student-verification",
    resource: "StudentIdentityVerification",
    resourceId: String(verification._id),
    oldValue: { status: oldStatus },
    newValue: { status, reviewer: String(user._id || user.id) },
  });

  const studentUser = await getUserById(verification.student.user || verification.student);
  if (studentUser) {
    await createAndEmitNotification({
      user: String(studentUser._id),
      sender: String(user._id || user.id),
      senderType: "user",
      title: "Identity Verification Decision",
      message: `Your student identity verification has been ${status.toLowerCase().replace(/_/g, " ")}.`,
      category: "student-verification",
      priority: status === "VERIFIED" ? "normal" : "high",
      actionUrl: `/internships/verification`,
      relatedEntityType: "StudentIdentityVerification",
      relatedEntityId: verification._id,
    });
  }

  return verification;
}

export async function getVerificationHistory({ user, verificationId }) {
  const verification = await StudentIdentityVerification.findById(verificationId).lean();
  if (!verification) throw notFound("Verification record not found.");

  await buildVerificationAccess(user, String(verification.student));

  const history = await VerificationHistory.find({ verification: verificationId })
    .populate("actor", "firstName middleName lastName email roles")
    .sort({ decidedAt: -1 })
    .lean();
  return history;
}

export async function getVerificationDashboard({ user, query }) {
  if (!isAdminOrCoordinator(user)) {
    throw forbidden("Only authorized administrators may view the verification dashboard.");
  }

  const filter = {};
  if (query.status) filter.status = query.status;

  const [pending, verified, rejected, additionalInfo, suspended] = await Promise.all([
    StudentIdentityVerification.countDocuments({ status: "PENDING_VERIFICATION" }),
    StudentIdentityVerification.countDocuments({ status: "VERIFIED" }),
    StudentIdentityVerification.countDocuments({ status: "REJECTED" }),
    StudentIdentityVerification.countDocuments({ status: "ADDITIONAL_INFORMATION_REQUIRED" }),
    StudentIdentityVerification.countDocuments({ status: "SUSPENDED" }),
  ]);

  return {
    pending,
    verified,
    rejected,
    additionalInfoRequired: additionalInfo,
    suspended,
    total: pending + verified + rejected + additionalInfo + suspended,
  };
}
