import {
  ReadinessRecommendation,
  CareerReadinessAssessment,
  ReadinessDecision,
  Student,
  User,
  CareerRole,
  Competency,
  IndustryProject,
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
  conflict,
} from "../../utils/apiError.js";
import { createAndEmitNotification } from "../notificationService.js";

const INSTITUTION_ID = "techspire";

function isFacultyUser(user) {
  return authorizeUser(user, ["faculty"]);
}

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

async function buildReadinessAccess(user, studentId) {
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

  if (roles.includes("faculty")) {
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
      throw forbidden("Students may only access their own readiness records.");
    }
    return { student };
  }

  throw forbidden("Insufficient role to access readiness records.");
}

/* ------------------------------------------------------------------ */
/* Readiness Recommendations                                          */
/* ------------------------------------------------------------------ */

export async function listRecommendations({ user, query }) {
  const { all, student } = await buildReadinessAccess(user, query.student);
  const filter = {};
  if (all) {
    if (query.student) filter.student = query.student;
    if (query.faculty) filter.faculty = query.faculty;
    if (query.careerRole) filter.careerRole = query.careerRole;
    if (query.status) filter.status = query.status;
  } else if (student) {
    filter.student = student._id;
    if (query.status) filter.status = query.status;
  }

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    ReadinessRecommendation.find(filter)
      .populate("student", "studentId firstName lastName program batch semester status")
      .populate("faculty", "firstName middleName lastName email roles")
      .populate("careerRole", "code name industry difficulty")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ReadinessRecommendation.countDocuments(filter),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getRecommendation({ user, recommendationId }) {
  const recommendation = await ReadinessRecommendation.findById(recommendationId)
    .populate("student", "studentId firstName lastName program batch semester status")
    .populate("faculty", "firstName middleName lastName email roles")
    .populate("careerRole", "code name industry difficulty")
    .lean();
  if (!recommendation) throw notFound("Readiness recommendation not found.");

  await buildReadinessAccess(user, String(recommendation.student));
  return recommendation;
}

export async function createRecommendation({ user, body }) {
  if (!isFacultyUser(user) && !isAdminOrCoordinator(user)) {
    throw forbidden("Only faculty or academic administrators may create readiness recommendations.");
  }

  const {
    studentId,
    careerRole,
    careerPathCode,
    recommendedCompetencies,
    skillGaps,
    areasOfStrength,
    facultyComments,
    supportingSubmissions,
    relevantProjects,
  } = body || {};
  if (!studentId) throw badRequest("studentId is required.");
  if (!careerRole) throw badRequest("careerRole is required.");

  const student = await Student.findById(studentId);
  if (!student) throw notFound("Student not found.");

  const role = await CareerRole.findById(careerRole);
  if (!role) throw notFound("Career role not found.");

  await buildReadinessAccess(user, studentId);

  // A student can be recommended for multiple career roles separately; no
  // uniqueness constraint across roles, but avoid duplicate DRAFT/SUBMITTED
  // for the same student+role.
  const existing = await ReadinessRecommendation.findOne({
    student: studentId,
    careerRole,
    status: { $in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW"] },
  });
  if (existing) {
    throw conflict("An active recommendation already exists for this student and career role.");
  }

  const recommendation = await ReadinessRecommendation.create({
    institutionId: INSTITUTION_ID,
    student: studentId,
    faculty: user._id || user.id,
    careerRole,
    careerPathCode: careerPathCode || null,
    status: "DRAFT",
    recommendedCompetencies: Array.isArray(recommendedCompetencies) ? recommendedCompetencies : [],
    skillGaps: Array.isArray(skillGaps) ? skillGaps : [],
    areasOfStrength: Array.isArray(areasOfStrength) ? areasOfStrength : [],
    facultyComments: facultyComments || "",
    supportingSubmissions: Array.isArray(supportingSubmissions) ? supportingSubmissions : [],
    relevantProjects: Array.isArray(relevantProjects) ? relevantProjects : [],
  });

  await logAudit({
    userId: user._id || user.id,
    action: "READINESS_RECOMMENDATION_CREATED",
    module: "readiness-assessment",
    resource: "ReadinessRecommendation",
    resourceId: String(recommendation._id),
    newValue: { student: studentId, careerRole, status: "DRAFT" },
  });

  const studentUser = await getUserById(student.user);
  if (studentUser) {
    await createAndEmitNotification({
      user: String(studentUser._id),
      sender: String(user._id || user.id),
      senderType: "user",
      title: "Career Readiness Recommendation",
      message: `A faculty member has drafted a readiness recommendation for ${role.name}.`,
      category: "readiness",
      priority: "normal",
      actionUrl: `/internships/readiness`,
      relatedEntityType: "ReadinessRecommendation",
      relatedEntityId: recommendation._id,
    });
  }

  return recommendation;
}

export async function submitRecommendation({ user, recommendationId, body }) {
  const recommendation = await ReadinessRecommendation.findById(recommendationId);
  if (!recommendation) throw notFound("Readiness recommendation not found.");

  await buildReadinessAccess(user, String(recommendation.student));

  const isAdmin = isAdminOrCoordinator(user);
  const isOwnFaculty = String(recommendation.faculty) === String(user._id || user.id);
  if (!isAdmin && !isOwnFaculty) {
    throw forbidden("You may only submit your own recommendations.");
  }

  if (recommendation.status !== "DRAFT") {
    throw badRequest("Only draft recommendations can be submitted.");
  }

  recommendation.status = "SUBMITTED";
  recommendation.submittedAt = new Date();
  if (body.facultyComments !== undefined) recommendation.facultyComments = body.facultyComments;

  recommendation.auditTrail.push({
    action: "RECOMMENDATION_SUBMITTED",
    actor: user._id || user.id,
    timestamp: new Date(),
    note: "Faculty submitted the recommendation for review.",
  });

  await recommendation.save();

  await logAudit({
    userId: user._id || user.id,
    action: "READINESS_RECOMMENDATION_SUBMITTED",
    module: "readiness-assessment",
    resource: "ReadinessRecommendation",
    resourceId: String(recommendation._id),
    newValue: { status: "SUBMITTED" },
  });

  return recommendation;
}

export async function reviewRecommendation({ user, recommendationId, body }) {
  if (!isAdminOrCoordinator(user)) {
    throw forbidden("Only authorized administrators may review readiness recommendations.");
  }

  const recommendation = await ReadinessRecommendation.findById(recommendationId);
  if (!recommendation) throw notFound("Readiness recommendation not found.");

  const { status, reviewComments, additionalEvidenceRequested } = body || {};
  const allowedStatuses = [
    "ACCEPTED_FOR_ASSESSMENT",
    "RETURNED_FOR_REVISION",
    "CLOSED",
  ];
  if (!status || !allowedStatuses.includes(status)) {
    throw badRequest(`Invalid status. Allowed: ${allowedStatuses.join(", ")}`);
  }

  if (recommendation.status !== "SUBMITTED" && recommendation.status !== "UNDER_REVIEW") {
    throw badRequest("Only submitted or under-review recommendations can be reviewed.");
  }

  recommendation.reviewDecision = status;
  recommendation.reviewedBy = user._id || user.id;
  recommendation.reviewedAt = new Date();
  recommendation.status = status;
  if (reviewComments !== undefined) recommendation.reviewComments = reviewComments;
  if (additionalEvidenceRequested !== undefined) {
    recommendation.additionalEvidenceRequested = additionalEvidenceRequested;
  }

  recommendation.auditTrail.push({
    action: `RECOMMENDATION_${status}`,
    actor: user._id || user.id,
    timestamp: new Date(),
    note: reviewComments || "",
  });

  await recommendation.save();

  // When accepted, create the formal career readiness assessment.
  if (status === "ACCEPTED_FOR_ASSESSMENT") {
    const existingAssessment = await CareerReadinessAssessment.findOne({
      student: recommendation.student,
      careerRole: recommendation.careerRole,
      status: { $ne: null },
    });
    if (!existingAssessment) {
      await CareerReadinessAssessment.create({
        institutionId: INSTITUTION_ID,
        student: recommendation.student,
        recommendation: recommendation._id,
        careerRole: recommendation.careerRole,
        careerPathCode: recommendation.careerPathCode,
        status: "PENDING_REVIEW",
      });
    }
  }

  await logAudit({
    userId: user._id || user.id,
    action: "READINESS_RECOMMENDATION_REVIEWED",
    module: "readiness-assessment",
    resource: "ReadinessRecommendation",
    resourceId: String(recommendation._id),
    newValue: { status, reviewedBy: String(user._id || user.id) },
  });

  const studentUser = await getUserById(recommendation.student.user || recommendation.student);
  if (studentUser) {
    await createAndEmitNotification({
      user: String(studentUser._id),
      sender: String(user._id || user.id),
      senderType: "user",
      title: "Readiness Recommendation Decision",
      message: `Your career readiness recommendation has been ${status.toLowerCase().replace(/_/g, " ")}.`,
      category: "readiness",
      priority: status === "ACCEPTED_FOR_ASSESSMENT" ? "normal" : "high",
      actionUrl: `/internships/readiness`,
      relatedEntityType: "ReadinessRecommendation",
      relatedEntityId: recommendation._id,
    });
  }

  return recommendation;
}

/* ------------------------------------------------------------------ */
/* Career Readiness Assessments                                       */
/* ------------------------------------------------------------------ */

export async function listAssessments({ user, query }) {
  const { all, student } = await buildReadinessAccess(user, query.student);
  const filter = {};
  if (all) {
    if (query.student) filter.student = query.student;
    if (query.careerRole) filter.careerRole = query.careerRole;
    if (query.status) filter.status = query.status;
    if (query.assessor) filter.assessor = query.assessor;
  } else if (student) {
    filter.student = student._id;
    if (query.status) filter.status = query.status;
  }

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    CareerReadinessAssessment.find(filter)
      .populate("student", "studentId firstName lastName program batch semester status")
      .populate("careerRole", "code name industry difficulty")
      .populate("assessor", "firstName middleName lastName email roles")
      .populate("decidedBy", "firstName middleName lastName email roles")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CareerReadinessAssessment.countDocuments(filter),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getAssessment({ user, assessmentId }) {
  const assessment = await CareerReadinessAssessment.findById(assessmentId)
    .populate("student", "studentId firstName lastName program batch semester status")
    .populate("careerRole", "code name industry difficulty")
    .populate("assessor", "firstName middleName lastName email roles")
    .populate("decidedBy", "firstName middleName lastName email roles")
    .lean();
  if (!assessment) throw notFound("Career readiness assessment not found.");

  await buildReadinessAccess(user, String(assessment.student));
  return assessment;
}

export async function recordAssessmentDecision({ user, assessmentId, body }) {
  if (!isAdminOrCoordinator(user)) {
    throw forbidden("Only authorized administrators may record readiness decisions.");
  }

  const assessment = await CareerReadinessAssessment.findById(assessmentId);
  if (!assessment) throw notFound("Career readiness assessment not found.");

  const { decision, rationale, evidenceSummary, competenciesMet, reassessmentDueAt } = body || {};
  const allowedDecisions = ["READY", "NOT_YET_READY", "REASSESSMENT_REQUESTED"];
  if (!decision || !allowedDecisions.includes(decision)) {
    throw badRequest(`Invalid decision. Allowed: ${allowedDecisions.join(", ")}`);
  }

  assessment.decision = decision;
  assessment.decisionRationale = rationale || "";
  assessment.decidedBy = user._id || user.id;
  assessment.decidedAt = new Date();
  assessment.notifiedAt = new Date();
  if (evidenceSummary !== undefined) assessment.evidenceSummary = evidenceSummary;
  if (reassessmentDueAt !== undefined) {
    assessment.reassessmentDueAt = reassessmentDueAt ? new Date(reassessmentDueAt) : null;
  }
  if (Array.isArray(competenciesMet)) {
    assessment.competencyReviews = competenciesMet.map((c) => ({
      competency: c.competency,
      met: Boolean(c.met),
      evidenceNote: c.evidenceNote || "",
      reviewerComment: c.reviewerComment || "",
    }));
  }

  assessment.auditTrail.push({
    action: `ASSESSMENT_DECISION_${decision}`,
    actor: user._id || user.id,
    timestamp: new Date(),
    note: rationale || "",
  });

  await assessment.save();

  // Create the authoritative readiness decision record for audit.
  await ReadinessDecision.create({
    assessment: assessment._id,
    student: assessment.student,
    careerRole: assessment.careerRole,
    careerPathCode: assessment.careerPathCode,
    decision,
    rationale: assessment.decisionRationale,
    decidedBy: user._id || user.id,
    evidenceSummary: assessment.evidenceSummary,
    competenciesMet: (assessment.competencyReviews || []).map((c) => ({
      competency: c.competency,
      met: c.met,
    })),
    reassessmentDueAt: assessment.reassessmentDueAt,
  });

  await logAudit({
    userId: user._id || user.id,
    action: "CAREER_READINESS_DECISION_RECORDED",
    module: "readiness-assessment",
    resource: "CareerReadinessAssessment",
    resourceId: String(assessment._id),
    newValue: { decision, decidedBy: String(user._id || user.id) },
  });

  const studentUser = await getUserById(assessment.student.user || assessment.student);
  if (studentUser) {
    await createAndEmitNotification({
      user: String(studentUser._id),
      sender: String(user._id || user.id),
      senderType: "user",
      title: "Career Readiness Decision",
      message: `Your readiness assessment for a career role has been decided: ${decision}.`,
      category: "readiness",
      priority: decision === "READY" ? "normal" : "high",
      actionUrl: `/internships/readiness`,
      relatedEntityType: "CareerReadinessAssessment",
      relatedEntityId: assessment._id,
    });
  }

  return assessment;
}

export async function getReadinessDashboard({ user, query }) {
  if (!isAdminOrCoordinator(user)) {
    throw forbidden("Only authorized administrators may view the readiness dashboard.");
  }

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.careerRole) filter.careerRole = query.careerRole;

  const [pendingReview, moreEvidence, inProgress, ready, notReady, reassessment] = await Promise.all([
    CareerReadinessAssessment.countDocuments({ status: "PENDING_REVIEW" }),
    CareerReadinessAssessment.countDocuments({ status: "MORE_EVIDENCE_REQUIRED" }),
    CareerReadinessAssessment.countDocuments({ status: "ASSESSMENT_IN_PROGRESS" }),
    CareerReadinessAssessment.countDocuments({ status: "READY_FOR_SPECIFIED_ROLE" }),
    CareerReadinessAssessment.countDocuments({ status: "NOT_YET_READY" }),
    CareerReadinessAssessment.countDocuments({ status: "REASSESSMENT_REQUESTED" }),
  ]);

  return {
    pendingReview,
    moreEvidenceRequired: moreEvidence,
    assessmentInProgress: inProgress,
    readyForRole: ready,
    notYetReady: notReady,
    reassessmentRequested: reassessment,
    total: pendingReview + moreEvidence + inProgress + ready + notReady + reassessment,
  };
}
