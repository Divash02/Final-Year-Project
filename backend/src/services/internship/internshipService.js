import {
  InternshipOpportunity,
  InternshipApplication,
  InternshipInterview,
  InternshipOffer,
  Employer,
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
import {
  ApplicationWorkflow,
  OfferWorkflow,
  allowedNextStatuses,
  validateTransition,
} from "./workflowService.js";

const INSTITUTION_ID = "techspire";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalizeId(value) {
  if (!value) return null;
  return String(value);
}

/**
 * Resolve a student record for the authenticated user when the user is a
 * student. Throws notFound if no student profile exists.
 */
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

/**
 * Verify the current user is an authorized employer representative for the
 * given employer. Returns the EmployerUser record.
 */
async function requireEmployerAuthorization(user, employerId, allowedRoles = ["OWNER", "HR_RECRUITER"]) {
  const { EmployerUser } = await import("../../models/index.js");
  const employerUser = await EmployerUser.findOne({
    employer: employerId,
    user: user._id || user.id,
    status: "ACTIVE",
  }).lean();

  if (!employerUser) {
    throw forbidden("You are not an authorized representative of this employer.");
  }

  if (allowedRoles && !allowedRoles.includes(employerUser.employerRole)) {
    throw forbidden(`Your employer role "${employerUser.employerRole}" is not authorized for this action.`);
  }

  return employerUser;
}

/**
 * Validate application eligibility: checks that the student's academic
 * year/semester match the opportunity's target programs/departments when
 * those are specified.
 */
async function validateApplicationEligibility(student, opportunity) {
  const reasons = [];

  if (opportunity.targetPrograms && opportunity.targetPrograms.length > 0) {
    const studentProgram = student.program ? String(student.program) : null;
    if (!studentProgram || !opportunity.targetPrograms.some((p) => String(p) === studentProgram)) {
      reasons.push("Your academic program is not eligible for this opportunity.");
    }
  }

  if (opportunity.targetDepartments && opportunity.targetDepartments.length > 0) {
    const studentDept = student.department ? String(student.department) : null;
    if (!studentDept || !opportunity.targetDepartments.some((d) => String(d) === studentDept)) {
      reasons.push("Your academic department is not eligible for this opportunity.");
    }
  }

  if (reasons.length > 0) {
    throw badRequest("You do not meet the eligibility conditions for this opportunity.", {
      code: "INELIGIBLE_APPLICANT",
      reasons,
    });
  }

  return true;
}

/* ------------------------------------------------------------------ */
/* Opportunities                                                      */
/* ------------------------------------------------------------------ */

/**
 * Create an internship opportunity.
 *
 * Business rule: only verified employers can publish approved opportunities.
 * Unverified employers create opportunities in DRAFT status.
 *
 * @param {Object} data
 * @param {Object} data.createdBy - User creating the opportunity
 * @returns {Promise<Object>}
 */
export async function createOpportunity(data, { createdBy }) {
  const employer = await Employer.findById(data.employer);
  if (!employer) {
    throw notFound("Employer not found.");
  }

  if (!employer.isActive || employer.isArchived) {
    throw badRequest("Cannot create opportunities for an inactive or archived employer.", {
      code: "EMPLOYER_NOT_ACTIVE",
    });
  }

  const isVerified = employer.isVerified === true;

  // Determine initial status: only verified employers can publish OPEN
  let initialStatus = "DRAFT";
  if (data.status && data.status === "PENDING_APPROVAL" && isVerified) {
    initialStatus = "PENDING_APPROVAL";
  } else if (data.status && data.status === "OPEN" && isVerified) {
    initialStatus = "OPEN";
  } else if (data.status && ["DRAFT", "ARCHIVED"].includes(data.status)) {
    initialStatus = data.status;
  }

  const opportunity = await InternshipOpportunity.create({
    institutionId: INSTITUTION_ID,
    employer: data.employer,
    title: String(data.title).trim(),
    department: data.department ? String(data.department).trim() : undefined,
    workMode: data.workMode || "HYBRID",
    employmentType: data.employmentType || "FULL_TIME",
    location: data.location ? String(data.location).trim() : undefined,
    stipend: {
      amount: Number(data.stipend?.amount || 0),
      currency: data.stipend?.currency || "NPR",
      frequency: data.stipend?.frequency || "MONTHLY",
      isNegotiable: Boolean(data.stipend?.isNegotiable),
    },
    durationMonths: Number(data.durationMonths),
    availablePositions: Number(data.availablePositions || 1),
    description: String(data.description).trim(),
    responsibilities: Array.isArray(data.responsibilities) ? data.responsibilities : [],
    requirements: Array.isArray(data.requirements) ? data.requirements : [],
    skillsRequired: Array.isArray(data.skillsRequired) ? data.skillsRequired : [],
    targetPrograms: Array.isArray(data.targetPrograms) ? data.targetPrograms : [],
    targetDepartments: Array.isArray(data.targetDepartments) ? data.targetDepartments : [],
    status: initialStatus,
    deadline: new Date(data.deadline),
    postedDate: new Date(),
    isArchived: false,
  });

  await logAudit({
    userId: createdBy,
    action: "internship.opportunity.create",
    module: "internship",
    resource: "InternshipOpportunity",
    resourceId: String(opportunity._id),
    details: `Opportunity "${opportunity.title}" created for employer ${employer.name} (status: ${initialStatus})`,
    metadata: { employerId: data.employer, opportunityId: String(opportunity._id), status: initialStatus },
  });

  await createAndEmitNotification({
    user: createdBy,
    title: "Internship opportunity created",
    message: `Your internship opportunity "${opportunity.title}" has been created with status "${initialStatus}".`,
    category: "internship",
    priority: "normal",
    actionUrl: `/internship/opportunities/${opportunity._id}`,
    sender: createdBy,
    metadata: {
      relatedEntityType: "InternshipOpportunity",
      relatedEntityId: String(opportunity._id),
    },
  });

  return {
    id: String(opportunity._id),
    ...opportunity.toObject(),
    isVerified,
  };
}

/**
 * Update an internship opportunity. Only the employer that owns it may edit.
 *
 * @param {string} opportunityId
 * @param {Object} updates
 * @param {Object} options { updatedBy, requestingUser }
 * @returns {Promise<Object>}
 */
export async function updateOpportunity(opportunityId, updates, { updatedBy, requestingUser }) {
  const opportunity = await InternshipOpportunity.findById(opportunityId);
  if (!opportunity) {
    throw notFound("Internship opportunity not found.");
  }

  const employer = await Employer.findById(opportunity.employer);
  if (!employer) {
    throw notFound("Linked employer not found.");
  }

  await requireEmployerAuthorization(requestingUser, String(opportunity.employer), ["OWNER", "HR_RECRUITER"]);

  const allowedFields = [
    "title",
    "department",
    "workMode",
    "employmentType",
    "location",
    "stipend",
    "durationMonths",
    "availablePositions",
    "description",
    "responsibilities",
    "requirements",
    "skillsRequired",
    "targetPrograms",
    "targetDepartments",
    "deadline",
  ];

  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(opportunity._id), ...opportunity.toObject() };
  }

  Object.assign(opportunity, changes);
  await opportunity.save();

  await logAudit({
    userId: updatedBy,
    action: "internship.opportunity.update",
    module: "internship",
    resource: "InternshipOpportunity",
    resourceId: String(opportunity._id),
    details: `Opportunity updated: ${Object.keys(changes).join(", ")}`,
    metadata: { opportunityId: String(opportunity._id), changedFields: Object.keys(changes) },
  });

  return { id: String(opportunity._id), ...opportunity.toObject() };
}

/**
 * Approve or archive an opportunity.
 *
 * Business rule: only verified employers can have OPEN opportunities.
 *
 * @param {string} opportunityId
 * @param {Object} data { status: "OPEN"|"CLOSED"|"ARCHIVED", approvedBy }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function approveOpportunity(opportunityId, data, { requestingUser }) {
  const opportunity = await InternshipOpportunity.findById(opportunityId);
  if (!opportunity) {
    throw notFound("Internship opportunity not found.");
  }

  const employer = await Employer.findById(opportunity.employer);
  if (!employer) {
    throw notFound("Linked employer not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isCoordinator = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );

  if (!isCoordinator) {
    await requireEmployerAuthorization(requestingUser, String(opportunity.employer), ["OWNER", "HR_RECRUITER"]);
  }

  const newStatus = data.status;
  if (!["DRAFT", "PENDING_APPROVAL", "OPEN", "CLOSED", "ARCHIVED"].includes(newStatus)) {
    throw badRequest(`Invalid opportunity status: ${newStatus}`);
  }

  if (newStatus === "OPEN" && !employer.isVerified) {
    throw badRequest("Only verified employers can publish open opportunities.", {
      code: "EMPLOYER_NOT_VERIFIED",
    });
  }

  const oldStatus = opportunity.status;
  opportunity.status = newStatus;
  if (newStatus === "OPEN" || newStatus === "PENDING_APPROVAL") {
    opportunity.approvedBy = requestingUser._id || requestingUser.id;
    opportunity.approvedAt = new Date();
  }
  await opportunity.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: `internship.opportunity.${newStatus.toLowerCase()}`,
    module: "internship",
    resource: "InternshipOpportunity",
    resourceId: String(opportunity._id),
    details: `Opportunity status changed: ${oldStatus} -> ${newStatus}`,
    metadata: { opportunityId: String(opportunity._id), oldStatus, newStatus },
  });

  return { id: String(opportunity._id), ...opportunity.toObject() };
}

/**
 * List opportunities with filtering and pagination.
 *
 * @param {Object} filter
 * @param {Object} pagination
 * @returns {Promise<Object>}
 */
export async function listOpportunities(filter = {}, pagination = {}) {
  const query = { isArchived: { $ne: true } };
  if (filter.employer) query.employer = filter.employer;
  if (filter.status) query.status = filter.status;
  if (filter.workMode) query.workMode = filter.workMode;
  if (filter.isVerified !== undefined) query.isVerified = filter.isVerified === true;

  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 50));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    InternshipOpportunity.find(query)
      .populate("employer", "name industry city contactEmail isVerified")
      .sort({ postedDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InternshipOpportunity.countDocuments(query),
  ]);

  return {
    items: items.map((o) => ({
      id: String(o._id),
      ...o,
      employer: o.employer
        ? { id: String(o.employer._id), name: o.employer.name, industry: o.employer.industry, city: o.employer.city, contactEmail: o.employer.contactEmail, isVerified: o.employer.isVerified }
        : null,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

/* ------------------------------------------------------------------ */
/* Applications                                                       */
/* ------------------------------------------------------------------ */

/**
 * Create a new internship application (DRAFT).
 *
 * Business rule: students can only create applications for themselves;
 * duplicate applications to the same opportunity are prevented by the
 * unique index on { student, opportunity }.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createApplication(data, { requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can create internship applications.");
  }

  const opportunity = await InternshipOpportunity.findById(data.opportunity).lean();
  if (!opportunity) {
    throw notFound("Internship opportunity not found.");
  }

  if (opportunity.status !== "OPEN") {
    throw badRequest("Applications are only accepted for open opportunities.", {
      code: "OPPORTUNITY_NOT_OPEN",
    });
  }

  if (new Date(opportunity.deadline) < new Date()) {
    throw badRequest("The application deadline for this opportunity has passed.", {
      code: "DEADLINE_PASSED",
    });
  }

  await validateApplicationEligibility(student, opportunity);

  const existing = await InternshipApplication.findOne({
    student: student._id,
    opportunity: data.opportunity,
  });
  if (existing) {
    throw conflict("You have already applied to this opportunity.", {
      code: "DUPLICATE_APPLICATION",
      applicationId: String(existing._id),
    });
  }

  const application = await InternshipApplication.create({
    student: student._id,
    opportunity: data.opportunity,
    company: opportunity.employer,
    academicYear: data.academicYear,
    semester: Number(data.semester),
    title: String(data.title).trim(),
    description: data.description ? String(data.description).trim() : "",
    coverLetter: data.coverLetter ? String(data.coverLetter).trim() : "",
    resume: data.resume || undefined,
    portfolioUrl: data.portfolioUrl ? String(data.portfolioUrl).trim() : undefined,
    academicYear: data.academicYear,
    semester: Number(data.semester),
    status: "DRAFT",
    submittedAt: new Date(),
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.application.create",
    module: "internship",
    resource: "InternshipApplication",
    resourceId: String(application._id),
    details: `Application created for opportunity ${opportunity.title}`,
    metadata: { applicationId: String(application._id), studentId: String(student._id), opportunityId: data.opportunity },
  });

  return { id: String(application._id), ...application.toObject() };
}

/**
 * Submit a draft application. Transitions DRAFT -> SUBMITTED.
 *
 * @param {string} applicationId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function submitApplication(applicationId, { requestingUser }) {
  const application = await InternshipApplication.findById(applicationId);
  if (!application) {
    throw notFound("Application not found.");
  }

  const student = await resolveStudentForUser(requestingUser);
  if (!student || String(application.student) !== String(student._id)) {
    throw forbidden("You can only submit your own applications.");
  }

  validateTransition("application", application.status, "SUBMITTED", {
    userId: requestingUser._id || requestingUser.id,
    resource: "InternshipApplication",
    resourceId: String(application._id),
    action: "internship.application.submit",
    details: "Application submitted for review.",
  });

  application.status = "SUBMITTED";
  application.submittedAt = new Date();
  await application.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.application.submit",
    module: "internship",
    resource: "InternshipApplication",
    resourceId: String(application._id),
    details: "Application submitted.",
  });

  await createAndEmitNotification({
    user: requestingUser._id || requestingUser.id,
    title: "Application submitted",
    message: `Your internship application "${application.title}" has been submitted.`,
    category: "internship",
    priority: "normal",
    actionUrl: `/internship/applications/${application._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipApplication",
      relatedEntityId: String(application._id),
    },
  });

  return { id: String(application._id), ...application.toObject() };
}

/**
 * Review an application. Transitions SUBMITTED -> UNDER_REVIEW, then optionally
 * to SHORTLISTED or REJECTED.
 *
 * Business rule: only authorized employer users or faculty/coordinators may review.
 *
 * @param {string} applicationId
 * @param {Object} data { status, reviewNotes, rejectionReason, academicSupervisorId, coordinatorId }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function reviewApplication(applicationId, data, { requestingUser }) {
  const application = await InternshipApplication.findById(applicationId);
  if (!application) {
    throw notFound("Application not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isEmployerRep = await Employer.findById(application.company).then((e) =>
    e ? true : false,
  );
  const isAuthorized = roles.some((r) => ["registrar", "dean", "hod", "program_coordinator", "super_admin", "faculty"].includes(r));

  // Employer reps can review their own company's applications
  let employerAuthorized = false;
  if (application.company) {
    const eu = await requireEmployerAuthorization(
      requestingUser,
      String(application.company),
      ["OWNER", "HR_RECRUITER"],
    ).catch(() => null);
    employerAuthorized = Boolean(eu);
  }

  if (!isAuthorized && !employerAuthorized) {
    throw forbidden("You are not authorized to review this application.");
  }

  const newStatus = data.status;
  const currentStatus = application.status;

  // Validate the transition using the workflow engine
  const validTransitions = {
    SUBMITTED: ["UNDER_REVIEW"],
    UNDER_REVIEW: ["SHORTLISTED", "REJECTED"],
    SHORTLISTED: ["INTERVIEW_SCHEDULED", "REJECTED"],
  };

  if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(newStatus)) {
    throw badRequest(
      `Cannot transition application from "${currentStatus}" to "${newStatus}".`,
      { code: "INVALID_WORKFLOW_TRANSITION", fromStatus: currentStatus, toStatus: newStatus },
    );
  }

  application.status = newStatus;
  application.reviewedBy = requestingUser._id || requestingUser.id;
  application.reviewedAt = new Date();
  if (data.reviewNotes) application.reviewNotes = String(data.reviewNotes).trim().slice(0, 1500);
  if (newStatus === "REJECTED" && data.rejectionReason) {
    application.rejectionReason = String(data.rejectionReason).trim().slice(0, 1500);
  }
  if (data.academicSupervisorId) application.academicSupervisor = data.academicSupervisorId;
  if (data.coordinatorId) application.coordinator = data.coordinatorId;
  await application.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.application.review",
    module: "internship",
    resource: "InternshipApplication",
    resourceId: String(application._id),
    details: `Application reviewed: ${currentStatus} -> ${newStatus}`,
    metadata: { applicationId: String(application._id), oldStatus: currentStatus, newStatus },
  });

  await createAndEmitNotification({
    user: String(application.student),
    title: `Application ${newStatus.toLowerCase().replace(/_/g, " ")}`,
    message: `Your internship application "${application.title}" has been ${newStatus.toLowerCase().replace(/_/g, " ")}.${newStatus === "REJECTED" && data.rejectionReason ? ` Reason: ${data.rejectionReason}` : ""}`,
    category: "internship",
    priority: newStatus === "REJECTED" ? "high" : "normal",
    actionUrl: `/internship/applications/${application._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipApplication",
      relatedEntityId: String(application._id),
    },
  });

  return { id: String(application._id), ...application.toObject() };
}

/**
 * Shortlist an application. Transitions UNDER_REVIEW -> SHORTLISTED.
 *
 * @param {string} applicationId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function shortlistApplication(applicationId, { requestingUser }) {
  const application = await InternshipApplication.findById(applicationId);
  if (!application) {
    throw notFound("Application not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isAuthorized = roles.some((r) => ["registrar", "dean", "hod", "program_coordinator", "super_admin", "faculty"].includes(r));
  let employerAuthorized = false;
  if (application.company) {
    const eu = await requireEmployerAuthorization(
      requestingUser,
      String(application.company),
      ["OWNER", "HR_RECRUITER"],
    ).catch(() => null);
    employerAuthorized = Boolean(eu);
  }

  if (!isAuthorized && !employerAuthorized) {
    throw forbidden("You are not authorized to shortlist this application.");
  }

  validateTransition("application", application.status, "SHORTLISTED", {
    userId: requestingUser._id || requestingUser.id,
    resource: "InternshipApplication",
    resourceId: String(application._id),
    action: "internship.application.shortlist",
  });

  application.status = "SHORTLISTED";
  application.reviewedBy = requestingUser._id || requestingUser.id;
  application.reviewedAt = new Date();
  await application.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.application.shortlist",
    module: "internship",
    resource: "InternshipApplication",
    resourceId: String(application._id),
    details: "Application shortlisted.",
  });

  await createAndEmitNotification({
    user: String(application.student),
    title: "Application shortlisted",
    message: `Your internship application "${application.title}" has been shortlisted.`,
    category: "internship",
    priority: "high",
    actionUrl: `/internship/applications/${application._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipApplication",
      relatedEntityId: String(application._id),
    },
  });

  return { id: String(application._id), ...application.toObject() };
}

/**
 * List applications with role-based scoping.
 *
 * @param {Object} filter
 * @param {Object} options { requestingUser, page, limit }
 * @returns {Promise<Object>}
 */
export async function listApplications(filter = {}, { requestingUser, page = 1, limit = 20 }) {
  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");
  const isFaculty = roles.includes("faculty");
  const isCoordinator = roles.some((r) => ["hod", "program_coordinator", "registrar", "super_admin"].includes(r));

  const query = { isArchived: { $ne: true } };

  if (isStudent) {
    const student = await resolveStudentForUser(requestingUser);
    query.student = student._id;
  } else if (isFaculty && !isCoordinator) {
    query.academicSupervisor = requestingUser._id || requestingUser.id;
  }

  if (filter.status) query.status = filter.status;
  if (filter.company) query.company = filter.company;
  if (filter.academicYear) query.academicYear = filter.academicYear;
  if (filter.semester) query.semester = Number(filter.semester);

  const p = Math.max(1, Number(page));
  const l = Math.min(100, Math.max(1, Number(limit)));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    InternshipApplication.find(query)
      .populate("student", "studentId firstName lastName program semester department")
      .populate("academicSupervisor", "firstName lastName email")
      .populate("coordinator", "firstName lastName email")
      .populate("company", "name industry city")
      .populate("industrySupervisor", "firstName lastName email designation")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    InternshipApplication.countDocuments(query),
  ]);

  return {
    items: items.map((a) => ({
      id: String(a._id),
      ...a,
      student: a.student
        ? { id: String(a.student._id), studentId: a.student.studentId, fullName: `${a.student.firstName} ${a.student.lastName}`, program: a.student.program, semester: a.student.semester, department: a.student.department }
        : null,
      company: a.company
        ? { id: String(a.company._id), name: a.company.name, industry: a.company.industry, city: a.company.city }
        : null,
    })),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  };
}

/**
 * Get a single application with related reports and evaluations.
 *
 * @param {string} applicationId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function getApplication(applicationId, { requestingUser }) {
  const application = await InternshipApplication.findById(applicationId)
    .populate("student", "studentId firstName lastName program semester department user")
    .populate("academicSupervisor", "firstName lastName email")
    .populate("coordinator", "firstName lastName email")
    .populate("company", "name industry address city country website contactPerson contactEmail contactPhone")
    .populate("industrySupervisor", "firstName lastName email phone designation department")
    .lean();

  if (!application) {
    throw notFound("Application not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");

  if (isStudent) {
    const student = await resolveStudentForUser(requestingUser);
    if (!student || String(application.student._id) !== String(student._id)) {
      throw forbidden("Access denied.");
    }
  }

  const [progressReports, evaluations] = await Promise.all([
    InternshipApplication.db ? InternshipApplication.db.collection("internshipprogressreports").find({ application: applicationId }).sort({ weekNumber: 1 }).toArray() : [],
    [],
  ]);

  return {
    application: {
      id: String(application._id),
      ...application,
      student: application.student
        ? { id: String(application.student._id), studentId: application.student.studentId, fullName: `${application.student.firstName} ${application.student.lastName}`, program: application.student.program, semester: application.student.semester, department: application.student.department }
        : null,
      company: application.company
        ? { id: String(application.company._id), name: application.company.name, industry: application.company.industry, address: application.company.address, city: application.company.city, country: application.company.country, website: application.company.website, contactPerson: application.company.contactPerson, contactEmail: application.company.contactEmail, contactPhone: application.company.contactPhone }
        : null,
    },
    progressReports: progressReports || [],
    evaluations: evaluations || [],
  };
}

/* ------------------------------------------------------------------ */
/* Interviews                                                         */
/* ------------------------------------------------------------------ */

/**
 * Schedule an interview for an application.
 *
 * Business rule: application must be SHORTLISTED. Only authorized users
 * (employer reps, faculty, coordinators) may schedule.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function scheduleInterview(data, { requestingUser }) {
  const application = await InternshipApplication.findById(data.application).lean();
  if (!application) {
    throw notFound("Application not found.");
  }

  if (application.status !== "SHORTLISTED") {
    throw badRequest("Interviews can only be scheduled for shortlisted applications.", {
      code: "APPLICATION_NOT_SHORTLISTED",
    });
  }

  const roles = getUserRoles(requestingUser);
  const isAuthorized = roles.some((r) => ["registrar", "dean", "hod", "program_coordinator", "super_admin", "faculty"].includes(r));
  let employerAuthorized = false;
  if (application.company) {
    const eu = await requireEmployerAuthorization(
      requestingUser,
      String(application.company),
      ["OWNER", "HR_RECRUITER"],
    ).catch(() => null);
    employerAuthorized = Boolean(eu);
  }

  if (!isAuthorized && !employerAuthorized) {
    throw forbidden("You are not authorized to schedule interviews for this application.");
  }

  const student = await Student.findById(application.student);
  if (!student) {
    throw notFound("Student profile not found.");
  }

  const employer = await Employer.findById(application.company);
  if (!employer) {
    throw notFound("Employer not found.");
  }

  const startTime = new Date(data.scheduledStartTime);
  const endTime = new Date(data.scheduledEndTime);
  if (endTime <= startTime) {
    throw badRequest("Interview end time must be after start time.", {
      code: "INVALID_INTERVIEW_TIMES",
    });
  }

  const interview = await InternshipInterview.create({
    application: data.application,
    student: application.student,
    employer: application.company,
    roundNumber: data.roundNumber || 1,
    interviewType: data.interviewType || "TECHNICAL",
    scheduledStartTime: startTime,
    scheduledEndTime: endTime,
    durationMinutes: data.durationMinutes || 45,
    mode: data.mode || "VIDEO_CALL",
    meetingLink: data.meetingLink || undefined,
    location: data.location ? String(data.location).trim() : undefined,
    interviewers: Array.isArray(data.interviewers) ? data.interviewers : [],
    status: "SCHEDULED",
    feedback: data.feedback ? String(data.feedback).trim() : undefined,
    score: data.score ? Number(data.score) : undefined,
    recommendation: data.recommendation || undefined,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.interview.schedule",
    module: "internship",
    resource: "InternshipInterview",
    resourceId: String(interview._id),
    details: `Interview scheduled for application ${application._id} at ${startTime.toISOString()}`,
    metadata: { interviewId: String(interview._id), applicationId: data.application, studentId: String(application.student) },
  });

  await createAndEmitNotification({
    user: String(application.student),
    title: "Interview scheduled",
    message: `An interview has been scheduled for your application "${application.title}" on ${startTime.toLocaleDateString()}.`,
    category: "internship",
    priority: "high",
    actionUrl: `/internship/applications/${application._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipInterview",
      relatedEntityId: String(interview._id),
    },
  });

  await InternshipApplication.findByIdAndUpdate(data.application, { status: "INTERVIEW_SCHEDULED" });

  return { id: String(interview._id), ...interview.toObject() };
}

/**
 * Record interview feedback and outcome.
 *
 * @param {string} interviewId
 * @param {Object} data { status, feedback, score, recommendation }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function completeInterview(interviewId, data, { requestingUser }) {
  const interview = await InternshipInterview.findById(interviewId);
  if (!interview) {
    throw notFound("Interview not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isAuthorized = roles.some((r) => ["registrar", "dean", "hod", "program_coordinator", "super_admin", "faculty"].includes(r));
  let employerAuthorized = false;
  if (interview.employer) {
    const eu = await requireEmployerAuthorization(
      requestingUser,
      String(interview.employer),
      ["OWNER", "HR_RECRUITER"],
    ).catch(() => null);
    employerAuthorized = Boolean(eu);
  }

  if (!isAuthorized && !employerAuthorized) {
    throw forbidden("You are not authorized to record feedback for this interview.");
  }

  const allowedStatuses = ["COMPLETED", "CANCELLED", "NO_SHOW", "RESCHEDULED"];
  if (!allowedStatuses.includes(data.status)) {
    throw badRequest(`Invalid interview status: ${data.status}`);
  }

  interview.status = data.status;
  if (data.feedback) interview.feedback = String(data.feedback).trim().slice(0, 3000);
  if (data.score !== undefined) interview.score = Number(data.score);
  if (data.recommendation) interview.recommendation = data.recommendation;
  await interview.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.interview.complete",
    module: "internship",
    resource: "InternshipInterview",
    resourceId: String(interview._id),
    details: `Interview ${data.status.toLowerCase()}. Score: ${interview.score || "N/A"}, Recommendation: ${interview.recommendation || "N/A"}`,
    metadata: { interviewId: String(interview._id), status: data.status },
  });

  return { id: String(interview._id), ...interview.toObject() };
}

/* ------------------------------------------------------------------ */
/* Offers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Issue an internship offer.
 *
 * Business rule: only authorized users may issue offers. Application must
 * be in OFFER_EXTENDED-compatible state (INTERVIEW_SCHEDULED).
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function issueOffer(data, { requestingUser }) {
  const roles = getUserRoles(requestingUser);
  const isAuthorized = roles.some((r) => ["registrar", "dean", "hod", "program_coordinator", "super_admin", "faculty"].includes(r));
  if (!isAuthorized) {
    throw forbidden("You are not authorized to issue internship offers.");
  }

  const application = await InternshipApplication.findById(data.application);
  if (!application) {
    throw notFound("Application not found.");
  }

  if (application.status !== "INTERVIEW_SCHEDULED") {
    throw badRequest("Offers can only be issued for applications that have completed an interview.", {
      code: "APPLICATION_NOT_INTERVIEWED",
    });
  }

  const existingOffer = await InternshipOffer.findOne({ application: data.application, status: "EXTENDED" });
  if (existingOffer) {
    throw conflict("An active offer already exists for this application.", {
      code: "DUPLICATE_OFFER",
      offerId: String(existingOffer._id),
    });
  }

  const student = await Student.findById(application.student);
  if (!student) {
    throw notFound("Student profile not found.");
  }

  const employer = await Employer.findById(application.company);
  if (!employer) {
    throw notFound("Employer not found.");
  }

  const offer = await InternshipOffer.create({
    application: data.application,
    student: application.student,
    employer: application.company,
    opportunity: data.opportunity || application.opportunity,
    roleTitle: String(data.roleTitle).trim(),
    stipendAmount: Number(data.stipendAmount || 0),
    currency: data.currency || "NPR",
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    weeklyWorkHours: Number(data.weeklyWorkHours || 40),
    offerLetter: data.offerLetter || undefined,
    responseDeadline: new Date(data.responseDeadline),
    status: "EXTENDED",
    issuedBy: requestingUser._id || requestingUser.id,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.offer.issue",
    module: "internship",
    resource: "InternshipOffer",
    resourceId: String(offer._id),
    details: `Offer issued for application ${application._id}`,
    metadata: { offerId: String(offer._id), applicationId: data.application, studentId: String(application.student) },
  });

  await createAndEmitNotification({
    user: String(application.student),
    title: "Internship offer received",
    message: `You have received an internship offer for "${application.title}". Please respond before ${offer.responseDeadline.toLocaleDateString()}.`,
    category: "internship",
    priority: "high",
    actionUrl: `/internship/applications/${application._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipOffer",
      relatedEntityId: String(offer._id),
    },
  });

  return { id: String(offer._id), ...offer.toObject() };
}

/**
 * Accept an offer. Transitions OFFER_EXTENDED -> ACCEPTED.
 *
 * @param {string} offerId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function acceptOffer(offerId, { requestingUser }) {
  const offer = await InternshipOffer.findById(offerId);
  if (!offer) {
    throw notFound("Offer not found.");
  }

  const student = await resolveStudentForUser(requestingUser);
  if (!student || String(offer.student) !== String(student._id)) {
    throw forbidden("You can only accept your own offers.");
  }

  validateTransition("offer", offer.status, "ACCEPTED", {
    userId: requestingUser._id || requestingUser.id,
    resource: "InternshipOffer",
    resourceId: String(offer._id),
    action: "internship.offer.accept",
  });

  offer.status = "ACCEPTED";
  offer.decisionDate = new Date();
  await offer.save();

  const application = await InternshipApplication.findById(offer.application);
  if (application) {
    application.status = "OFFER_ACCEPTED";
    application.reviewedBy = requestingUser._id || requestingUser.id;
    application.reviewedAt = new Date();
    await application.save();

    await logAudit({
      userId: requestingUser._id || requestingUser.id,
      action: "internship.application.accept_offer",
      module: "internship",
      resource: "InternshipApplication",
      resourceId: String(application._id),
      details: "Application status set to OFFER_ACCEPTED.",
      metadata: { applicationId: String(application._id), offerId: String(offer._id) },
    });
  }

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.offer.accept",
    module: "internship",
    resource: "InternshipOffer",
    resourceId: String(offer._id),
    details: "Offer accepted by student.",
    metadata: { offerId: String(offer._id), studentId: String(student._id) },
  });

  await createAndEmitNotification({
    user: requestingUser._id || requestingUser.id,
    title: "Offer accepted",
    message: `The student has accepted your internship offer.`,
    category: "internship",
    priority: "high",
    actionUrl: `/internship/offers/${offer._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipOffer",
      relatedEntityId: String(offer._id),
    },
  });

  return { id: String(offer._id), ...offer.toObject() };
}

/**
 * Decline an offer. Transitions OFFER_EXTENDED -> DECLINED.
 *
 * @param {string} offerId
 * @param {Object} data { declineReason? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function declineOffer(offerId, data, { requestingUser }) {
  const offer = await InternshipOffer.findById(offerId);
  if (!offer) {
    throw notFound("Offer not found.");
  }

  const student = await resolveStudentForUser(requestingUser);
  if (!student || String(offer.student) !== String(student._id)) {
    throw forbidden("You can only decline your own offers.");
  }

  validateTransition("offer", offer.status, "DECLINED", {
    userId: requestingUser._id || requestingUser.id,
    resource: "InternshipOffer",
    resourceId: String(offer._id),
    action: "internship.offer.decline",
  });

  offer.status = "DECLINED";
  offer.decisionDate = new Date();
  if (data.declineReason) offer.declineReason = String(data.declineReason).trim().slice(0, 1000);
  await offer.save();

  const application = await InternshipApplication.findById(offer.application);
  if (application) {
    application.status = "OFFER_DECLINED";
    application.reviewedBy = requestingUser._id || requestingUser.id;
    application.reviewedAt = new Date();
    await application.save();
  }

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.offer.decline",
    module: "internship",
    resource: "InternshipOffer",
    resourceId: String(offer._id),
    details: "Offer declined by student.",
    metadata: { offerId: String(offer._id), studentId: String(student._id) },
  });

  return { id: String(offer._id), ...offer.toObject() };
}
