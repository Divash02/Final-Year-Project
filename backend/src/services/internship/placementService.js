import {
  InternshipPlacement,
  InternshipOffer,
  InternshipApplication,
  InternshipSupervisor,
  InternshipAgreement,
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
  PlacementWorkflow,
  validateTransition,
} from "./workflowService.js";

/**
 * Domain B: Placement Management, Supervisor Assignment, Onboarding
 *
 * Placement lifecycle: PENDING_ONBOARDING -> ACTIVE -> COMPLETED/TERMINATED
 * with onboarding tasks tracked on the placement document.
 */

/**
 * Create a placement from an accepted offer.
 *
 * Business rule: placement creation requires an accepted offer and college
 * confirmation (academic supervisor must be assigned and the offer must be
 * ACCEPTED). A placement is unique per application.
 *
 * @param {Object} data
 * @param {string} data.applicationId
 * @param {string} data.offerId
 * @param {string} data.academicSupervisorId - Faculty user id
 * @param {string} [data.industrySupervisorId]
 * @param {string} data.startDate
 * @param {string} data.endDate
 * @param {number} [data.totalRequiredHours=480]
 * @param {number} [data.academicCredits=6]
 * @param {Array} [data.onboardingTasks]
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createPlacement(data, { requestingUser }) {
  const roles = getUserRoles(requestingUser);
  const isCoordinator = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );
  if (!isCoordinator) {
    throw forbidden("Only college coordinators can create internship placements.");
  }

  const offer = await InternshipOffer.findById(data.offerId);
  if (!offer) {
    throw notFound("Internship offer not found.");
  }

  if (offer.status !== "ACCEPTED") {
    throw badRequest("Placement creation requires an accepted offer.", {
      code: "OFFER_NOT_ACCEPTED",
    });
  }

  const application = await InternshipApplication.findById(offer.application);
  if (!application) {
    throw notFound("Linked application not found.");
  }

  const existing = await InternshipPlacement.findOne({ application: application._id });
  if (existing) {
    throw conflict("A placement already exists for this application.", {
      code: "DUPLICATE_PLACEMENT",
      placementId: String(existing._id),
    });
  }

  const academicSupervisor = await getUserById(data.academicSupervisorId);
  if (!academicSupervisor) {
    throw notFound("Academic supervisor not found.");
  }

  const supervisorRoles = getUserRoles(academicSupervisor);
  if (!supervisorRoles.some((r) => ["faculty", "registrar", "hod", "dean"].includes(r))) {
    throw badRequest("Academic supervisor must be a faculty member or academic officer.", {
      code: "INVALID_ACADEMIC_SUPERVISOR",
    });
  }

  const employer = await Employer.findById(offer.employer);
  if (!employer) {
    throw notFound("Employer not found.");
  }

  const student = await Student.findById(offer.student);
  if (!student) {
    throw notFound("Student not found.");
  }

  let industrySupervisor = null;
  if (data.industrySupervisorId) {
    industrySupervisor = await InternshipSupervisor.findById(data.industrySupervisorId);
    if (!industrySupervisor || String(industrySupervisor.company) !== String(offer.employer)) {
      throw notFound("Industry supervisor not found for this employer.");
    }
  }

  const placementCode = `PLC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

  const placement = await InternshipPlacement.create({
    placementCode,
    student: offer.student,
    employer: offer.employer,
    opportunity: offer.opportunity || null,
    application: application._id,
    offer: offer._id,
    academicSupervisor: academicSupervisor._id,
    industrySupervisor: industrySupervisor ? industrySupervisor._id : null,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    status: "PENDING_ONBOARDING",
    totalRequiredHours: Number(data.totalRequiredHours || 480),
    completedHours: Number(data.completedHours || 0),
    academicCredits: Number(data.academicCredits || 6),
    onboardingTasks: Array.isArray(data.onboardingTasks)
      ? data.onboardingTasks.map((t) => ({
          title: String(t.title).trim(),
          description: t.description ? String(t.description).trim() : undefined,
          isCompleted: false,
        }))
      : [],
    isArchived: false,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.placement.create",
    module: "internship",
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    details: `Placement ${placement.placementCode} created for student ${student.firstName} ${student.lastName}`,
    metadata: {
      placementId: String(placement._id),
      applicationId: String(application._id),
      offerId: String(offer._id),
      studentId: String(offer.student),
    },
  });

  await createAndEmitNotification({
    user: String(offer.student),
    title: "Internship placement created",
    message: `Your internship placement (${placement.placementCode}) has been created. Onboarding is pending.`,
    category: "internship",
    priority: "high",
    actionUrl: `/internship/placements/${placement._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipPlacement",
      relatedEntityId: String(placement._id),
    },
  });

  await createAndEmitNotification({
    user: String(academicSupervisor._id),
    title: "New placement assigned",
    message: `You have been assigned as academic supervisor for placement ${placement.placementCode}.`,
    category: "internship",
    priority: "normal",
    actionUrl: `/internship/placements/${placement._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipPlacement",
      relatedEntityId: String(placement._id),
    },
  });

  return { id: String(placement._id), ...placement.toObject() };
}

/**
 * Confirm and activate a placement. Transitions PENDING_ONBOARDING -> ACTIVE.
 *
 * Business rule: requires college confirmation (coordinator action).
 *
 * @param {string} placementId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function confirmPlacement(placementId, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId);
  if (!placement) {
    throw notFound("Placement not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isCoordinator = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );
  if (!isCoordinator) {
    throw forbidden("Only college coordinators can confirm placements.");
  }

  validateTransition("placement", placement.status, "ACTIVE", {
    userId: requestingUser._id || requestingUser.id,
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    action: "internship.placement.confirm",
  });

  const oldStatus = placement.status;
  placement.status = "ACTIVE";
  await placement.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.placement.confirm",
    module: "internship",
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    details: `Placement confirmed: ${oldStatus} -> ACTIVE`,
    metadata: { placementId: String(placement._id), oldStatus },
  });

  await createAndEmitNotification({
    user: String(placement.student),
    title: "Placement confirmed",
    message: `Your internship placement ${placement.placementCode} is now active.`,
    category: "internship",
    priority: "high",
    actionUrl: `/internship/placements/${placement._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipPlacement",
      relatedEntityId: String(placement._id),
    },
  });

  return { id: String(placement._id), ...placement.toObject() };
}

/**
 * Update placement details (dates, hours, credits).
 *
 * @param {string} placementId
 * @param {Object} updates
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function updatePlacement(placementId, updates, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId);
  if (!placement) {
    throw notFound("Placement not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isCoordinator = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );
  if (!isCoordinator) {
    throw forbidden("Only college coordinators can update placements.");
  }

  const allowedFields = ["startDate", "endDate", "totalRequiredHours", "academicCredits"];
  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(placement._id), ...placement.toObject() };
  }

  Object.assign(placement, changes);
  await placement.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.placement.update",
    module: "internship",
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    details: `Placement updated: ${Object.keys(changes).join(", ")}`,
    metadata: { placementId: String(placement._id), changedFields: Object.keys(changes) },
  });

  return { id: String(placement._id), ...placement.toObject() };
}

/**
 * Grant leave or return from leave.
 *
 * @param {string} placementId
 * @param {Object} data { status: "ON_LEAVE"|"ACTIVE" }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function managePlacementLeave(placementId, data, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId);
  if (!placement) {
    throw notFound("Placement not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isSupervisor = roles.some((r) => ["faculty", "hod", "dean", "registrar"].includes(r));
  let employerAuthorized = false;
  const { EmployerUser } = await import("../../models/index.js");
  const employerUser = await EmployerUser.findOne({
    employer: placement.employer,
    user: requestingUser._id || requestingUser.id,
    status: "ACTIVE",
    employerRole: { $in: ["OWNER", "HR_RECRUITER", "SUPERVISOR"] },
  }).lean();
  employerAuthorized = Boolean(employerUser);

  if (!isSupervisor && !employerAuthorized) {
    throw forbidden("You are not authorized to manage placement leave.");
  }

  const newStatus = data.status;
  if (newStatus === "ON_LEAVE") {
    validateTransition("placement", placement.status, "ON_LEAVE", {
      userId: requestingUser._id || requestingUser.id,
      resource: "InternshipPlacement",
      resourceId: String(placement._id),
      action: "internship.placement.leave",
    });
  } else if (newStatus === "ACTIVE") {
    validateTransition("placement", placement.status, "ACTIVE", {
      userId: requestingUser._id || requestingUser.id,
      resource: "InternshipPlacement",
      resourceId: String(placement._id),
      action: "internship.placement.return",
    });
  } else {
    throw badRequest(`Invalid status for leave management: ${newStatus}`);
  }

  placement.status = newStatus;
  await placement.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.placement.leave",
    module: "internship",
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    details: `Placement leave changed to ${newStatus}`,
    metadata: { placementId: String(placement._id), newStatus },
  });

  return { id: String(placement._id), ...placement.toObject() };
}

/**
 * Terminate a placement.
 *
 * @param {string} placementId
 * @param {Object} data { reason? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function terminatePlacement(placementId, data, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId);
  if (!placement) {
    throw notFound("Placement not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isAuthorized = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );
  if (!isAuthorized) {
    throw forbidden("Only college coordinators can terminate placements.");
  }

  const currentStatus = placement.status;
  if (currentStatus === "COMPLETED" || currentStatus === "TERMINATED") {
    throw badRequest(`Cannot terminate a placement that is already ${currentStatus.toLowerCase()}.`);
  }

  validateTransition("placement", currentStatus, "TERMINATED", {
    userId: requestingUser._id || requestingUser.id,
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    action: "internship.placement.terminate",
  });

  placement.status = "TERMINATED";
  await placement.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.placement.terminate",
    module: "internship",
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    details: `Placement terminated. Reason: ${data.reason || "Not provided"}`,
    metadata: { placementId: String(placement._id), reason: data.reason },
  });

  await createAndEmitNotification({
    user: String(placement.student),
    title: "Placement terminated",
    message: `Your internship placement ${placement.placementCode} has been terminated.${data.reason ? ` Reason: ${data.reason}` : ""}`,
    category: "internship",
    priority: "high",
    actionUrl: `/internship/placements/${placement._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipPlacement",
      relatedEntityId: String(placement._id),
    },
  });

  return { id: String(placement._id), ...placement.toObject() };
}

/**
 * Extend a placement.
 *
 * @param {string} placementId
 * @param {Object} data { endDate }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function extendPlacement(placementId, data, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId);
  if (!placement) {
    throw notFound("Placement not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isCoordinator = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );
  if (!isCoordinator) {
    throw forbidden("Only college coordinators can extend placements.");
  }

  validateTransition("placement", placement.status, "EXTENDED", {
    userId: requestingUser._id || requestingUser.id,
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    action: "internship.placement.extend",
  });

  placement.status = "ACTIVE";
  if (data.endDate) placement.endDate = new Date(data.endDate);
  await placement.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.placement.extend",
    module: "internship",
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    details: `Placement extended. New end date: ${placement.endDate.toISOString()}`,
    metadata: { placementId: String(placement._id) },
  });

  return { id: String(placement._id), ...placement.toObject() };
}

/**
 * Complete a placement. Transitions ACTIVE -> COMPLETED.
 *
 * Business rule: completion requires all applicable requirements (evaluations,
 * logbooks, hours) to be satisfied. Checked by the completion service.
 *
 * @param {string} placementId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function completePlacement(placementId, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId);
  if (!placement) {
    throw notFound("Placement not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isAuthorized = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );
  if (!isAuthorized) {
    throw forbidden("Only college coordinators can complete placements.");
  }

  validateTransition("placement", placement.status, "COMPLETED", {
    userId: requestingUser._id || requestingUser.id,
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    action: "internship.placement.complete",
  });

  placement.status = "COMPLETED";
  placement.completionCertifiedAt = new Date();
  await placement.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.placement.complete",
    module: "internship",
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    details: "Placement completed and certified.",
    metadata: { placementId: String(placement._id) },
  });

  await createAndEmitNotification({
    user: String(placement.student),
    title: "Internship completed",
    message: `Congratulations! Your internship placement ${placement.placementCode} has been completed.`,
    category: "internship",
    priority: "high",
    actionUrl: `/internship/placements/${placement._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipPlacement",
      relatedEntityId: String(placement._id),
    },
  });

  return { id: String(placement._id), ...placement.toObject() };
}

/* ------------------------------------------------------------------ */
/* Supervisors                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create an internship supervisor (company-side contact).
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createSupervisor(data, { requestingUser }) {
  const roles = getUserRoles(requestingUser);
  const isCoordinator = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );
  let employerAuthorized = false;
  const { EmployerUser } = await import("../../models/index.js");
  const employerUser = await EmployerUser.findOne({
    employer: data.company,
    user: requestingUser._id || requestingUser.id,
    status: "ACTIVE",
    employerRole: { $in: ["OWNER", "HR_RECRUITER"] },
  }).lean();
  employerAuthorized = Boolean(employerUser);

  if (!isCoordinator && !employerAuthorized) {
    throw forbidden("You are not authorized to create supervisors for this company.");
  }

  const employer = await Employer.findById(data.company);
  if (!employer) {
    throw notFound("Employer not found.");
  }

  const supervisor = await InternshipSupervisor.create({
    company: data.company,
    user: data.userId || null,
    firstName: String(data.firstName).trim(),
    lastName: String(data.lastName).trim(),
    email: data.email ? String(data.email).toLowerCase().trim() : undefined,
    phone: data.phone ? String(data.phone).trim() : undefined,
    designation: data.designation ? String(data.designation).trim() : undefined,
    department: data.department ? String(data.department).trim() : undefined,
    isPrimary: data.isPrimary !== undefined ? Boolean(data.isPrimary) : true,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.supervisor.create",
    module: "internship",
    resource: "InternshipSupervisor",
    resourceId: String(supervisor._id),
    details: `Supervisor created for employer ${employer.name}`,
    metadata: { supervisorId: String(supervisor._id), employerId: data.company },
  });

  return { id: String(supervisor._id), ...supervisor.toObject() };
}

/**
 * Assign an industry supervisor to a placement.
 *
 * @param {string} placementId
 * @param {string} supervisorId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function assignIndustrySupervisor(placementId, supervisorId, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId);
  if (!placement) {
    throw notFound("Placement not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isCoordinator = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );
  let employerAuthorized = false;
  const { EmployerUser } = await import("../../models/index.js");
  const employerUser = await EmployerUser.findOne({
    employer: placement.employer,
    user: requestingUser._id || requestingUser.id,
    status: "ACTIVE",
    employerRole: { $in: ["OWNER", "HR_RECRUITER", "SUPERVISOR"] },
  }).lean();
  employerAuthorized = Boolean(employerUser);

  if (!isCoordinator && !employerAuthorized) {
    throw forbidden("You are not authorized to assign supervisors to this placement.");
  }

  const supervisor = await InternshipSupervisor.findById(supervisorId);
  if (!supervisor || String(supervisor.company) !== String(placement.employer)) {
    throw notFound("Industry supervisor not found for this employer.");
  }

  placement.industrySupervisor = supervisorId;
  await placement.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.placement.assign_supervisor",
    module: "internship",
    resource: "InternshipPlacement",
    resourceId: String(placement._id),
    details: `Industry supervisor assigned: ${supervisor.firstName} ${supervisor.lastName}`,
    metadata: { placementId: String(placement._id), supervisorId: String(supervisor._id) },
  });

  return { id: String(placement._id), ...placement.toObject() };
}

/**
 * List placements with role-based scoping.
 *
 * @param {Object} filter
 * @param {Object} options { requestingUser, page, limit }
 * @returns {Promise<Object>}
 */
export async function listPlacements(filter = {}, { requestingUser, page = 1, limit = 20 }) {
  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");
  const isFaculty = roles.includes("faculty");
  const isCoordinator = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );

  const query = { isArchived: { $ne: true } };

  if (isStudent) {
    const student = await Student.findOne({ user: requestingUser._id || requestingUser.id }).lean();
    if (!student) throw notFound("Student profile not found.");
    query.student = student._id;
  } else if (isFaculty && !isCoordinator) {
    query.academicSupervisor = requestingUser._id || requestingUser.id;
  }

  if (filter.status) query.status = filter.status;
  if (filter.employer) query.employer = filter.employer;
  if (filter.student) query.student = filter.student;

  const p = Math.max(1, Number(page));
  const l = Math.min(100, Math.max(1, Number(limit)));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    InternshipPlacement.find(query)
      .populate("student", "studentId firstName lastName program semester department")
      .populate("employer", "name industry city")
      .populate("academicSupervisor", "firstName lastName email")
      .populate("industrySupervisor", "firstName lastName email designation")
      .populate("offer", "roleTitle status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    InternshipPlacement.countDocuments(query),
  ]);

  return {
    items: items.map((p) => ({
      id: String(p._id),
      ...p,
      student: p.student
        ? { id: String(p.student._id), studentId: p.student.studentId, fullName: `${p.student.firstName} ${p.student.lastName}`, program: p.student.program }
        : null,
      employer: p.employer
        ? { id: String(p.employer._id), name: p.employer.name, industry: p.employer.industry, city: p.employer.city }
        : null,
    })),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  };
}

/**
 * Get a single placement by ID with access control.
 *
 * @param {string} placementId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function getPlacement(placementId, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId)
    .populate("student", "studentId firstName lastName program semester department user")
    .populate("employer", "name industry address city country website contactPerson contactEmail contactPhone")
    .populate("academicSupervisor", "firstName lastName email")
    .populate("industrySupervisor", "firstName lastName email phone designation department")
    .populate("offer", "roleTitle status startDate endDate")
    .lean();

  if (!placement) {
    throw notFound("Placement not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");
  const isFaculty = roles.includes("faculty");
  const isCoordinator = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );

  if (isStudent) {
    const student = await Student.findOne({ user: requestingUser._id || requestingUser.id }).lean();
    if (!student || String(placement.student._id) !== String(student._id)) {
      throw forbidden("Access denied.");
    }
  } else if (isFaculty && !isCoordinator) {
    if (String(placement.academicSupervisor._id) !== String(requestingUser._id || requestingUser.id)) {
      throw forbidden("You are not the academic supervisor for this placement.");
    }
  }

  return { id: String(placement._id), ...placement };
}
