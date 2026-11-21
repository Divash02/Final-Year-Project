import {
  InternshipEvaluation,
  InternshipCredential,
  InternshipPlacement,
  InternshipApplication,
  InternshipLogbook,
  InternshipReport,
  Student,
  User,
} from "../../models/index.js";
import { getUserById, getStudentByUserId, getUserRoles, logAudit } from "../../db.js";
import {
  badRequest,
  notFound,
  forbidden,
  conflict,
} from "../../utils/apiError.js";
import { createAndEmitNotification } from "../notificationService.js";
import { randomBytes } from "node:crypto";

/**
 * Domain B: Evaluations, Completion Approval, Credential Generation
 */

/**
 * Compute a letter grade from an overall rating (1-10).
 */
function gradeFromRating(rating) {
  if (rating >= 9) return "A+";
  if (rating >= 8) return "A";
  if (rating >= 7) return "B+";
  if (rating >= 6) return "B";
  if (rating >= 5) return "C+";
  if (rating >= 4) return "C";
  if (rating >= 3) return "D";
  return "F";
}

/**
 * Check if a user is an authorized industry evaluator for a placement.
 */
async function isIndustryEvaluator(user, placement) {
  const { EmployerUser } = await import("../../models/index.js");
  const employerUser = await EmployerUser.findOne({
    employer: placement.employer,
    user: user._id || user.id,
    status: "ACTIVE",
    employerRole: { $in: ["OWNER", "HR_RECRUITER", "SUPERVISOR", "MENTOR"] },
  }).lean();
  return Boolean(employerUser);
}

/**
 * Check if a user is the academic supervisor for a placement.
 */
async function isAcademicSupervisor(user, placement) {
  const roles = getUserRoles(user);
  return roles.some((r) => ["faculty", "hod", "dean", "registrar"].includes(r)) &&
    String(placement.academicSupervisor) === String(user._id || user.id);
}

/**
 * Check if a user is a college coordinator.
 */
function isCoordinator(user) {
  const roles = getUserRoles(user);
  return roles.some((r) => ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r));
}

/* ------------------------------------------------------------------ */
/* Evaluations                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create an internship evaluation (mid-term or final).
 *
 * Business rules:
 * - Faculty can evaluate only assigned students (academic supervisor).
 * - Employers can evaluate only their assigned interns.
 * - Students cannot edit finalized evaluations.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createEvaluation(data, { requestingUser }) {
  const placement = await InternshipPlacement.findById(data.placement).lean();
  if (!placement) {
    throw notFound("Placement not found.");
  }

  const student = await Student.findById(data.student).lean();
  if (!student) {
    throw notFound("Student not found.");
  }

  if (String(student._id) !== String(placement.student)) {
    throw badRequest("The student is not part of this placement.", {
      code: "STUDENT_NOT_IN_PLACEMENT",
    });
  }

  const evaluatorType = data.evaluatorType || "ACADEMIC_SUPERVISOR";
  let authorized = false;

  if (evaluatorType === "ACADEMIC_SUPERVISOR") {
    authorized = await isAcademicSupervisor(requestingUser, placement);
  } else if (evaluatorType === "INDUSTRY_SUPERVISOR") {
    authorized = await isIndustryEvaluator(requestingUser, placement);
  }

  if (!authorized) {
    throw forbidden("You are not authorized to evaluate this student for this placement.");
  }

  const evaluationType = data.evaluationType || "MID_TERM";
  const isFinal = Boolean(data.isFinal);

  // Prevent duplicate final evaluations of the same type
  const existing = await InternshipEvaluation.findOne({
    placement: placement._id,
    student: student._id,
    evaluatorType,
    evaluationType,
    isFinal,
  });
  if (existing) {
    throw conflict(
      `A ${evaluationType} ${evaluationType === "FINAL" ? "final " : ""}evaluation already exists for this student and evaluator type.`,
      { code: "DUPLICATE_EVALUATION", evaluationId: String(existing._id) },
    );
  }

  const evaluation = await InternshipEvaluation.create({
    placement: placement._id,
    application: data.application || placement.application,
    student: student._id,
    evaluatedBy: requestingUser._id || requestingUser.id,
    evaluatorType,
    evaluationType,
    technicalSkills: Number(data.technicalSkills),
    professionalism: Number(data.professionalism),
    communication: Number(data.communication),
    problemSolving: Number(data.problemSolving),
    teamwork: Number(data.teamwork),
    initiative: Number(data.initiative),
    overallRating: Number(data.overallRating),
    strengths: data.strengths ? String(data.strengths).trim() : "",
    areasForImprovement: data.areasForImprovement ? String(data.areasForImprovement).trim() : "",
    additionalComments: data.additionalComments ? String(data.additionalComments).trim() : "",
    gradeAwarded: gradeFromRating(Number(data.overallRating)),
    isFinal,
    evaluatedAt: new Date(),
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.evaluation.create",
    module: "internship",
    resource: "InternshipEvaluation",
    resourceId: String(evaluation._id),
    details: `${evaluatorType} ${evaluationType} evaluation created for student ${student.firstName} ${student.lastName}. Rating: ${evaluation.overallRating}/10`,
    metadata: {
      evaluationId: String(evaluation._id),
      placementId: String(placement._id),
      studentId: String(student._id),
      evaluatorType,
      evaluationType,
      overallRating: evaluation.overallRating,
    },
  });

  await createAndEmitNotification({
    user: String(student._id),
    title: "Evaluation received",
    message: `You have received a ${evaluationType.toLowerCase()} evaluation from your ${evaluatorType.toLowerCase().replace("_", " ")}. Overall rating: ${evaluation.overallRating}/10.`,
    category: "internship",
    priority: "normal",
    actionUrl: `/internship/placements/${placement._id}/evaluations/${evaluation._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipEvaluation",
      relatedEntityId: String(evaluation._id),
    },
  });

  return { id: String(evaluation._id), ...evaluation.toObject() };
}

/**
 * Get evaluations for a placement/student with access control.
 *
 * @param {Object} filter { placementId?, studentId? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Array>}
 */
export async function listEvaluations(filter = {}, { requestingUser }) {
  const query = {};

  if (filter.placementId) {
    const placement = await InternshipPlacement.findById(filter.placementId).lean();
    if (!placement) throw notFound("Placement not found.");
    query.placement = placement._id;

    const roles = getUserRoles(requestingUser);
    const isStudent = roles.includes("student");
    const isFaculty = roles.includes("faculty");
    const isCoordinator = roles.some((r) =>
      ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
    );

    if (isStudent) {
      const student = await Student.findOne({ user: requestingUser._id || requestingUser.id }).lean();
      if (!student || String(student._id) !== String(placement.student)) {
        throw forbidden("Access denied.");
      }
    } else if (isFaculty && !isCoordinator) {
      if (String(placement.academicSupervisor) !== String(requestingUser._id || requestingUser.id)) {
        throw forbidden("You are not the academic supervisor for this placement.");
      }
    }
  }

  if (filter.studentId) query.student = filter.studentId;
  if (filter.evaluatorType) query.evaluatorType = filter.evaluatorType;
  if (filter.evaluationType) query.evaluationType = filter.evaluationType;

  const evaluations = await InternshipEvaluation.find(query)
    .populate("evaluatedBy", "firstName lastName email")
    .populate("student", "studentId firstName lastName")
    .sort({ createdAt: -1 })
    .lean();

  return evaluations.map((e) => ({ id: String(e._id), ...e }));
}

/* ------------------------------------------------------------------ */
/* Completion verification                                            */
/* ------------------------------------------------------------------ */

/**
 * Verify that all completion requirements are met for a placement.
 *
 * Requirements:
 * - At least one final evaluation from academic supervisor
 * - At least one final evaluation from industry supervisor
 * - All logbooks approved (or no logbooks required)
 * - All reports approved (or no reports required)
 * - Completed hours >= total required hours (or threshold met)
 *
 * @param {string} placementId
 * @returns {Promise<Object>} { eligible: boolean, missing: string[] }
 */
export async function verifyCompletionRequirements(placementId) {
  const placement = await InternshipPlacement.findById(placementId).lean();
  if (!placement) {
    throw notFound("Placement not found.");
  }

  const missing = [];

  // Final academic evaluation
  const academicEval = await InternshipEvaluation.findOne({
    placement: placement._id,
    evaluatorType: "ACADEMIC_SUPERVISOR",
    evaluationType: "FINAL",
    isFinal: true,
  }).lean();
  if (!academicEval) {
    missing.push("Final academic supervisor evaluation");
  }

  // Final industry evaluation
  const industryEval = await InternshipEvaluation.findOne({
    placement: placement._id,
    evaluatorType: "INDUSTRY_SUPERVISOR",
    evaluationType: "FINAL",
    isFinal: true,
  }).lean();
  if (!industryEval) {
    missing.push("Final industry supervisor evaluation");
  }

  // Approved logbooks
  const logbooks = await InternshipLogbook.find({
    placement: placement._id,
    status: { $ne: "APPROVED" },
  }).lean();
  if (logbooks.length > 0) {
    missing.push(`${logbooks.length} logbook(s) not yet approved`);
  }

  // Approved reports
  const reports = await InternshipReport.find({
    placement: placement._id,
    status: { $ne: "APPROVED" },
  }).lean();
  if (reports.length > 0) {
    missing.push(`${reports.length} report(s) not yet approved`);
  }

  // Hours requirement
  if (Number(placement.completedHours || 0) < Number(placement.totalRequiredHours || 0)) {
    missing.push(`Completed hours (${placement.completedHours}) below required (${placement.totalRequiredHours})`);
  }

  return { eligible: missing.length === 0, missing };
}

/* ------------------------------------------------------------------ */
/* Credentials                                                        */
/* ------------------------------------------------------------------ */

/**
 * Generate a completion credential for a placement.
 *
 * Business rule: credentials must be issued only after authorized approval.
 * Completion must be verified (all requirements met) and placement must be
 * COMPLETED.
 *
 * @param {string} placementId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function issueCredential(placementId, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can issue internship credentials.");
  }

  const placement = await InternshipPlacement.findById(placementId);
  if (!placement) {
    throw notFound("Placement not found.");
  }

  if (placement.status !== "COMPLETED") {
    throw badRequest("Credentials can only be issued for completed placements.", {
      code: "PLACEMENT_NOT_COMPLETED",
    });
  }

  const existing = await InternshipCredential.findOne({ placement: placement._id });
  if (existing) {
    throw conflict("A credential already exists for this placement.", {
      code: "DUPLICATE_CREDENTIAL",
      credentialId: String(existing._id),
    });
  }

  // Verify completion requirements
  const { eligible, missing } = await verifyCompletionRequirements(placementId);
  if (!eligible) {
    throw badRequest("Completion requirements not met. Cannot issue credential.", {
      code: "INCOMPLETE_REQUIREMENTS",
      missing,
    });
  }

  const student = await Student.findById(placement.student).lean();
  if (!student) {
    throw notFound("Student not found.");
  }

  const credentialNumber = `CERT-${new Date().getFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const verificationHash = randomBytes(32).toString("hex");

  const academicEval = await InternshipEvaluation.findOne({
    placement: placement._id,
    evaluatorType: "ACADEMIC_SUPERVISOR",
    evaluationType: "FINAL",
    isFinal: true,
  }).lean();

  const credential = await InternshipCredential.create({
    placement: placement._id,
    student: placement.student,
    credentialNumber,
    digitalCredential: null,
    certificateTitle: "Certificate of Industrial Internship Completion",
    completedHours: Number(placement.completedHours || 0),
    finalGrade: academicEval ? academicEval.gradeAwarded : "A",
    academicCredits: placement.academicCredits || 6,
    issuedAt: new Date(),
    approvedBy: requestingUser._id || requestingUser.id,
    verificationHash,
    status: "ACTIVE",
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.credential.issue",
    module: "internship",
    resource: "InternshipCredential",
    resourceId: String(credential._id),
    details: `Credential ${credentialNumber} issued for student ${student.firstName} ${student.lastName}`,
    metadata: {
      credentialId: String(credential._id),
      placementId: String(placement._id),
      studentId: String(placement.student),
      credentialNumber,
    },
  });

  await createAndEmitNotification({
    user: String(placement.student),
    title: "Internship credential issued",
    message: `Your completion credential (${credentialNumber}) has been issued.`,
    category: "internship",
    priority: "high",
    actionUrl: `/internship/credentials/${credential._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipCredential",
      relatedEntityId: String(credential._id),
    },
  });

  return { id: String(credential._id), ...credential.toObject() };
}

/**
 * Revoke a credential.
 *
 * @param {string} credentialId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function revokeCredential(credentialId, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can revoke credentials.");
  }

  const credential = await InternshipCredential.findById(credentialId);
  if (!credential) {
    throw notFound("Credential not found.");
  }

  credential.status = "REVOKED";
  await credential.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.credential.revoke",
    module: "internship",
    resource: "InternshipCredential",
    resourceId: String(credential._id),
    details: `Credential ${credential.credentialNumber} revoked`,
    metadata: { credentialId: String(credential._id) },
  });

  return { id: String(credential._id), ...credential.toObject() };
}

/**
 * Verify a credential by its verification hash.
 *
 * @param {string} verificationHash
 * @returns {Promise<Object|null>}
 */
export async function verifyCredentialByHash(verificationHash) {
  const credential = await InternshipCredential.findOne({
    verificationHash,
    status: "ACTIVE",
  })
    .populate("student", "studentId firstName lastName")
    .populate("placement", "placementCode status")
    .lean();

  if (!credential) return null;

  return {
    id: String(credential._id),
    credentialNumber: credential.credentialNumber,
    certificateTitle: credential.certificateTitle,
    student: credential.student
      ? { id: String(credential.student._id), studentId: credential.student.studentId, name: `${credential.student.firstName} ${credential.student.lastName}` }
      : null,
    placement: credential.placement
      ? { id: String(credential.placement._id), placementCode: credential.placement.placementCode, status: credential.placement.status }
      : null,
    completedHours: credential.completedHours,
    finalGrade: credential.finalGrade,
    academicCredits: credential.academicCredits,
    issuedAt: credential.issuedAt,
    status: credential.status,
    valid: true,
  };
}

/**
 * List credentials with optional filtering.
 *
 * @param {Object} filter
 * @param {Object} options { requestingUser, page, limit }
 * @returns {Promise<Object>}
 */
export async function listCredentials(filter = {}, { requestingUser, page = 1, limit = 20 }) {
  const query = {};

  if (filter.studentId) query.student = filter.studentId;
  if (filter.status) query.status = filter.status;

  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");

  if (isStudent) {
    const student = await Student.findOne({ user: requestingUser._id || requestingUser.id }).lean();
    if (!student) throw notFound("Student profile not found.");
    query.student = student._id;
  }

  const p = Math.max(1, Number(page));
  const l = Math.min(100, Math.max(1, Number(limit)));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    InternshipCredential.find(query)
      .populate("student", "studentId firstName lastName")
      .populate("placement", "placementCode status")
      .populate("approvedBy", "firstName lastName email")
      .sort({ issuedAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    InternshipCredential.countDocuments(query),
  ]);

  return {
    items: items.map((c) => ({
      id: String(c._id),
      ...c,
      student: c.student
        ? { id: String(c.student._id), studentId: c.student.studentId, name: `${c.student.firstName} ${c.student.lastName}` }
        : null,
      placement: c.placement
        ? { id: String(c.placement._id), placementCode: c.placement.placementCode, status: c.placement.status }
        : null,
    })),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  };
}
