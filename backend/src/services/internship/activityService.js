import {
  InternshipTask,
  InternshipLogbook,
  InternshipProgressReport,
  InternshipAttendance,
  InternshipReport,
  InternshipPlacement,
  InternshipApplication,
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
  LogbookWorkflow,
  ReportWorkflow,
  SubmissionWorkflow,
  validateTransition,
} from "./workflowService.js";

/**
 * Domain B: Tasks, Logbooks, Attendance, Reports
 */

/* ------------------------------------------------------------------ */
/* Tasks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Create a task assigned to a placement student.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createTask(data, { requestingUser }) {
  const placement = await InternshipPlacement.findById(data.placement).lean();
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
    employerRole: { $in: ["OWNER", "HR_RECRUITER", "SUPERVISOR", "MENTOR"] },
  }).lean();
  employerAuthorized = Boolean(employerUser);

  if (!isSupervisor && !employerAuthorized) {
    throw forbidden("You are not authorized to assign tasks for this placement.");
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

  const task = await InternshipTask.create({
    placement: data.placement,
    student: data.student,
    employer: placement.employer,
    title: String(data.title).trim(),
    description: data.description ? String(data.description).trim() : undefined,
    assignedBy: requestingUser._id || requestingUser.id,
    priority: data.priority || "MEDIUM",
    status: data.status || "TODO",
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    deliverables: Array.isArray(data.deliverables) ? data.deliverables : [],
    feedback: data.feedback ? String(data.feedback).trim() : undefined,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.task.create",
    module: "internship",
    resource: "InternshipTask",
    resourceId: String(task._id),
    details: `Task "${task.title}" assigned to student ${student.firstName} ${student.lastName}`,
    metadata: { taskId: String(task._id), placementId: data.placement, studentId: data.student },
  });

  await createAndEmitNotification({
    user: String(student._id),
    title: "New task assigned",
    message: `You have been assigned a new task: "${task.title}".`,
    category: "internship",
    priority: task.priority === "URGENT" ? "high" : "normal",
    actionUrl: `/internship/placements/${placement._id}/tasks/${task._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipTask",
      relatedEntityId: String(task._id),
    },
  });

  return { id: String(task._id), ...task.toObject() };
}

/**
 * Update task status or details.
 *
 * @param {string} taskId
 * @param {Object} updates
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function updateTask(taskId, updates, { requestingUser }) {
  const task = await InternshipTask.findById(taskId);
  if (!task) {
    throw notFound("Task not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");
  const isSupervisor = roles.some((r) => ["faculty", "hod", "dean", "registrar"].includes(r));
  let employerAuthorized = false;
  const { EmployerUser } = await import("../../models/index.js");
  const employerUser = await EmployerUser.findOne({
    employer: task.employer,
    user: requestingUser._id || requestingUser.id,
    status: "ACTIVE",
    employerRole: { $in: ["OWNER", "HR_RECRUITER", "SUPERVISOR", "MENTOR"] },
  }).lean();
  employerAuthorized = Boolean(employerUser);

  const isOwner = isStudent && String(task.student) === String(await (await Student.findOne({ user: requestingUser._id || requestingUser.id }).lean())._id);

  if (!isSupervisor && !employerAuthorized && !isOwner) {
    throw forbidden("You are not authorized to update this task.");
  }

  const allowedFields = ["title", "description", "priority", "status", "dueDate", "completedAt", "deliverables", "feedback"];
  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(task._id), ...task.toObject() };
  }

  Object.assign(task, changes);
  await task.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.task.update",
    module: "internship",
    resource: "InternshipTask",
    resourceId: String(task._id),
    details: `Task updated: ${Object.keys(changes).join(", ")}`,
    metadata: { taskId: String(task._id), changedFields: Object.keys(changes) },
  });

  return { id: String(task._id), ...task.toObject() };
}

/* ------------------------------------------------------------------ */
/* Logbooks                                                           */
/* ------------------------------------------------------------------ */

/**
 * Create or update a weekly logbook entry.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function submitLogbook(data, { requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can submit logbook entries.");
  }

  const placement = await InternshipPlacement.findById(data.placement).lean();
  if (!placement) {
    throw notFound("Placement not found.");
  }

  if (String(placement.student) !== String(student._id)) {
    throw forbidden("You can only submit logbooks for your own placement.");
  }

  const existing = await InternshipLogbook.findOne({
    placement: data.placement,
    weekNumber: Number(data.weekNumber),
  });

  const logbookData = {
    placement: data.placement,
    application: data.application || placement.application,
    student: student._id,
    weekNumber: Number(data.weekNumber),
    weekStartDate: new Date(data.weekStartDate),
    weekEndDate: new Date(data.weekEndDate),
    activitiesSummary: String(data.activitiesSummary).trim(),
    learningOutcomes: data.learningOutcomes ? String(data.learningOutcomes).trim() : "",
    challengesFaced: data.challengesFaced ? String(data.challengesFaced).trim() : "",
    hoursWorked: Number(data.hoursWorked || 0),
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
  };

  if (existing) {
    // Resubmission: NEEDS_REVISION -> SUBMITTED
    if (existing.status === "NEEDS_REVISION") {
      validateTransition("logbook", existing.status, "SUBMITTED", {
        userId: requestingUser._id || requestingUser.id,
        resource: "InternshipLogbook",
        resourceId: String(existing._id),
        action: "internship.logbook.resubmit",
      });
    } else if (existing.status !== "DRAFT" && existing.status !== "SUBMITTED") {
      throw badRequest(`Cannot modify a logbook in ${existing.status.toLowerCase()} state.`);
    }

    Object.assign(existing, logbookData);
    existing.status = "SUBMITTED";
    existing.submittedAt = new Date();
    existing.reviewedBy = null;
    existing.reviewedAt = null;
    existing.supervisorFeedback = "";
    existing.academicSupervisorFeedback = "";
    await existing.save();

    await logAudit({
      userId: requestingUser._id || requestingUser.id,
      action: "internship.logbook.resubmit",
      module: "internship",
      resource: "InternshipLogbook",
      resourceId: String(existing._id),
      details: `Logbook week ${data.weekNumber} resubmitted`,
      metadata: { logbookId: String(existing._id), placementId: data.placement, weekNumber: data.weekNumber },
    });

    return { id: String(existing._id), ...existing.toObject() };
  }

  // New draft: DRAFT -> SUBMITTED
  const logbook = await InternshipLogbook.create({
    ...logbookData,
    status: "SUBMITTED",
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.logbook.submit",
    module: "internship",
    resource: "InternshipLogbook",
    resourceId: String(logbook._id),
    details: `Logbook week ${data.weekNumber} submitted`,
    metadata: { logbookId: String(logbook._id), placementId: data.placement, weekNumber: data.weekNumber },
  });

  await createAndEmitNotification({
    user: String(placement.academicSupervisor),
    title: "Logbook submitted",
    message: `A weekly logbook (week ${data.weekNumber}) has been submitted for review.`,
    category: "internship",
    priority: "normal",
    actionUrl: `/internship/placements/${placement._id}/logbooks/${logbook._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipLogbook",
      relatedEntityId: String(logbook._id),
    },
  });

  return { id: String(logbook._id), ...logbook.toObject() };
}

/**
 * Review a logbook entry (approve, review, or request revision).
 *
 * @param {string} logbookId
 * @param {Object} data { status, supervisorFeedback, academicSupervisorFeedback }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function reviewLogbook(logbookId, data, { requestingUser }) {
  const logbook = await InternshipLogbook.findById(logbookId);
  if (!logbook) {
    throw notFound("Logbook entry not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isFaculty = roles.includes("faculty");
  const isSupervisor = roles.some((r) => ["hod", "dean", "registrar"].includes(r));
  let employerAuthorized = false;
  const { EmployerUser } = await import("../../models/index.js");
  const employerUser = await EmployerUser.findOne({
    employer: logbook.employer,
    user: requestingUser._id || requestingUser.id,
    status: "ACTIVE",
    employerRole: { $in: ["OWNER", "HR_RECRUITER", "SUPERVISOR", "MENTOR"] },
  }).lean();
  employerAuthorized = Boolean(employerUser);

  const newStatus = data.status;
  if (newStatus === "APPROVED" || newStatus === "REVIEWED" || newStatus === "NEEDS_REVISION") {
    validateTransition("logbook", logbook.status, newStatus, {
      userId: requestingUser._id || requestingUser.id,
      resource: "InternshipLogbook",
      resourceId: String(logbook._id),
      action: "internship.logbook.review",
    });
  } else {
    throw badRequest(`Invalid logbook review status: ${newStatus}`);
  }

  logbook.status = newStatus;
  logbook.reviewedBy = requestingUser._id || requestingUser.id;
  logbook.reviewedAt = new Date();
  if (data.supervisorFeedback) logbook.supervisorFeedback = String(data.supervisorFeedback).trim().slice(0, 2000);
  if (data.academicSupervisorFeedback) logbook.academicSupervisorFeedback = String(data.academicSupervisorFeedback).trim().slice(0, 2000);
  await logbook.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.logbook.review",
    module: "internship",
    resource: "InternshipLogbook",
    resourceId: String(logbook._id),
    details: `Logbook reviewed: ${newStatus}`,
    metadata: { logbookId: String(logbook._id), newStatus },
  });

  await createAndEmitNotification({
    user: String(logbook.student),
    title: `Logbook ${newStatus.toLowerCase().replace(/_/g, " ")}`,
    message: `Your logbook (week ${logbook.weekNumber}) has been ${newStatus.toLowerCase().replace(/_/g, " ")}.`,
    category: "internship",
    priority: newStatus === "NEEDS_REVISION" ? "high" : "normal",
    actionUrl: `/internship/placements/${logbook.placement}/logbooks/${logbook._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipLogbook",
      relatedEntityId: String(logbook._id),
    },
  });

  return { id: String(logbook._id), ...logbook.toObject() };
}

/* ------------------------------------------------------------------ */
/* Attendance                                                         */
/* ------------------------------------------------------------------ */

/**
 * Record daily attendance for a placement student.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function recordAttendance(data, { requestingUser }) {
  const placement = await InternshipPlacement.findById(data.placement).lean();
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
    throw forbidden("You are not authorized to record attendance for this placement.");
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

  const date = new Date(data.date);
  date.setHours(0, 0, 0, 0);

  const existing = await InternshipAttendance.findOne({ placement: placement._id, date });
  if (existing) {
    throw conflict("Attendance already recorded for this student on this date.", {
      code: "DUPLICATE_ATTENDANCE",
      attendanceId: String(existing._id),
    });
  }

  const checkIn = data.checkInTime ? new Date(data.checkInTime) : null;
  const checkOut = data.checkOutTime ? new Date(data.checkOutTime) : null;
  let totalHours = Number(data.totalHours || 0);
  if (checkIn && checkOut && checkOut > checkIn) {
    totalHours = Math.round(((checkOut - checkIn) / (1000 * 60 * 60)) * 100) / 100;
  }

  const attendance = await InternshipAttendance.create({
    placement: placement._id,
    student: data.student,
    date,
    checkInTime: checkIn,
    checkOutTime: checkOut,
    totalHours: Math.min(24, Math.max(0, totalHours)),
    status: data.status || "PRESENT",
    notes: data.notes ? String(data.notes).trim().slice(0, 500) : "",
    approvedBySupervisor: false,
    supervisorApprovedAt: null,
    supervisorUser: requestingUser._id || requestingUser.id,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.attendance.record",
    module: "internship",
    resource: "InternshipAttendance",
    resourceId: String(attendance._id),
    details: `Attendance recorded for ${student.firstName} ${student.lastName} on ${date.toISOString()}: ${attendance.status}`,
    metadata: { attendanceId: String(attendance._id), placementId: placement._id, studentId: data.student },
  });

  return { id: String(attendance._id), ...attendance.toObject() };
}

/**
 * Approve attendance by a supervisor.
 *
 * @param {string} attendanceId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function approveAttendance(attendanceId, { requestingUser }) {
  const attendance = await InternshipAttendance.findById(attendanceId);
  if (!attendance) {
    throw notFound("Attendance record not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isSupervisor = roles.some((r) => ["faculty", "hod", "dean", "registrar"].includes(r));
  let employerAuthorized = false;
  const { EmployerUser } = await import("../../models/index.js");
  const employerUser = await EmployerUser.findOne({
    employer: attendance.employer,
    user: requestingUser._id || requestingUser.id,
    status: "ACTIVE",
    employerRole: { $in: ["OWNER", "HR_RECRUITER", "SUPERVISOR"] },
  }).lean();
  employerAuthorized = Boolean(employerUser);

  if (!isSupervisor && !employerAuthorized) {
    throw forbidden("You are not authorized to approve this attendance record.");
  }

  attendance.approvedBySupervisor = true;
  attendance.supervisorApprovedAt = new Date();
  attendance.supervisorUser = requestingUser._id || requestingUser.id;
  await attendance.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.attendance.approve",
    module: "internship",
    resource: "InternshipAttendance",
    resourceId: String(attendance._id),
    details: "Attendance approved by supervisor.",
    metadata: { attendanceId: String(attendance._id) },
  });

  return { id: String(attendance._id), ...attendance.toObject() };
}

/* ------------------------------------------------------------------ */
/* Reports                                                            */
/* ------------------------------------------------------------------ */

/**
 * Create or update an internship report.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function submitReport(data, { requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can submit reports.");
  }

  const placement = await InternshipPlacement.findById(data.placement).lean();
  if (!placement) {
    throw notFound("Placement not found.");
  }

  if (String(placement.student) !== String(student._id)) {
    throw forbidden("You can only submit reports for your own placement.");
  }

  const existing = await InternshipReport.findOne({
    placement: data.placement,
    reportType: data.reportType,
  });

  const reportData = {
    placement: data.placement,
    student: student._id,
    reportType: data.reportType,
    title: String(data.title).trim(),
    executiveSummary: data.executiveSummary ? String(data.executiveSummary).trim() : "",
    reportFile: data.reportFile || undefined,
    status: data.reportType === "FINAL" ? "SUBMITTED" : (data.status || "SUBMITTED"),
    evaluatedBy: null,
    evaluatedAt: null,
    academicGrade: null,
    facultyRemarks: "",
  };

  if (existing) {
    if (existing.status === "REVISION_REQUESTED") {
      validateTransition("report", existing.status, "RESUBMITTED", {
        userId: requestingUser._id || requestingUser.id,
        resource: "InternshipReport",
        resourceId: String(existing._id),
        action: "internship.report.resubmit",
      });
    } else if (existing.status !== "DRAFT" && existing.status !== "SUBMITTED") {
      throw badRequest(`Cannot modify a report in ${existing.status.toLowerCase()} state.`);
    }

    Object.assign(existing, reportData);
    existing.status = "SUBMITTED";
    existing.evaluatedBy = null;
    existing.evaluatedAt = null;
    existing.academicGrade = null;
    existing.facultyRemarks = "";
    await existing.save();

    await logAudit({
      userId: requestingUser._id || requestingUser.id,
      action: "internship.report.resubmit",
      module: "internship",
      resource: "InternshipReport",
      resourceId: String(existing._id),
      details: `Report ${data.reportType} resubmitted`,
      metadata: { reportId: String(existing._id), placementId: data.placement, reportType: data.reportType },
    });

    return { id: String(existing._id), ...existing.toObject() };
  }

  const report = await InternshipReport.create(reportData);

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.report.submit",
    module: "internship",
    resource: "InternshipReport",
    resourceId: String(report._id),
    details: `Report ${data.reportType} submitted`,
    metadata: { reportId: String(report._id), placementId: data.placement, reportType: data.reportType },
  });

  await createAndEmitNotification({
    user: String(placement.academicSupervisor),
    title: "Report submitted",
    message: `A ${data.reportType.toLowerCase()} report has been submitted for review.`,
    category: "internship",
    priority: "normal",
    actionUrl: `/internship/placements/${placement._id}/reports/${report._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipReport",
      relatedEntityId: String(report._id),
    },
  });

  return { id: String(report._id), ...report.toObject() };
}

/**
 * Review a report (approve or request revision).
 *
 * @param {string} reportId
 * @param {Object} data { status, academicGrade, facultyRemarks }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function reviewReport(reportId, data, { requestingUser }) {
  const report = await InternshipReport.findById(reportId);
  if (!report) {
    throw notFound("Report not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isFaculty = roles.includes("faculty");
  const isCoordinator = roles.some((r) => ["hod", "dean", "registrar", "program_coordinator"].includes(r));
  if (!isFaculty && !isCoordinator) {
    throw forbidden("Only faculty or academic coordinators can review reports.");
  }

  const newStatus = data.status;
  if (newStatus === "APPROVED") {
    validateTransition("report", report.status, "APPROVED", {
      userId: requestingUser._id || requestingUser.id,
      resource: "InternshipReport",
      resourceId: String(report._id),
      action: "internship.report.approve",
    });
  } else if (newStatus === "REVISION_REQUESTED") {
    validateTransition("report", report.status, "REVISION_REQUESTED", {
      userId: requestingUser._id || requestingUser.id,
      resource: "InternshipReport",
      resourceId: String(report._id),
      action: "internship.report.revision_requested",
    });
  } else if (newStatus === "UNDER_REVIEW") {
    validateTransition("report", report.status, "UNDER_REVIEW", {
      userId: requestingUser._id || requestingUser.id,
      resource: "InternshipReport",
      resourceId: String(report._id),
      action: "internship.report.review_started",
    });
  } else {
    throw badRequest(`Invalid report review status: ${newStatus}`);
  }

  report.status = newStatus;
  report.evaluatedBy = requestingUser._id || requestingUser.id;
  report.evaluatedAt = new Date();
  if (data.academicGrade) report.academicGrade = String(data.academicGrade).trim();
  if (data.facultyRemarks) report.facultyRemarks = String(data.facultyRemarks).trim().slice(0, 2000);
  await report.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "internship.report.review",
    module: "internship",
    resource: "InternshipReport",
    resourceId: String(report._id),
    details: `Report reviewed: ${newStatus}`,
    metadata: { reportId: String(report._id), newStatus },
  });

  await createAndEmitNotification({
    user: String(report.student),
    title: `Report ${newStatus.toLowerCase().replace(/_/g, " ")}`,
    message: `Your ${report.reportType.toLowerCase()} report has been ${newStatus.toLowerCase().replace(/_/g, " ")}.`,
    category: "internship",
    priority: newStatus === "REVISION_REQUESTED" ? "high" : "normal",
    actionUrl: `/internship/placements/${report.placement}/reports/${report._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "InternshipReport",
      relatedEntityId: String(report._id),
    },
  });

  return { id: String(report._id), ...report.toObject() };
}

/**
 * Resolve student for the current user (student role only).
 */
async function resolveStudentForUser(user) {
  const roles = getUserRoles(user);
  if (!roles.includes("student")) return null;
  const student = await Student.findOne({ user: user._id || user.id }).lean();
  return student || null;
}

/* ------------------------------------------------------------------ */
/* List helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * List tasks for a placement.
 */
export async function listTasks(placementId, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId).lean();
  if (!placement) throw notFound("Placement not found.");

  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");
  const isCoordinator = roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );

  const query = { placement: placementId };
  if (isStudent) {
    const student = await resolveStudentForUser(requestingUser);
    if (!student) throw notFound("Student profile not found.");
    if (String(student._id) !== String(placement.student)) throw forbidden("Access denied.");
    query.student = student._id;
  }

  const tasks = await InternshipTask.find(query)
    .populate("assignedBy", "firstName lastName email")
    .sort({ createdAt: -1 })
    .lean();

  return tasks.map((t) => ({ id: String(t._id), ...t }));
}

/**
 * List logbooks for a placement.
 */
export async function listLogbooks(placementId, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId).lean();
  if (!placement) throw notFound("Placement not found.");

  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");

  const query = { placement: placementId };
  if (isStudent) {
    const student = await resolveStudentForUser(requestingUser);
    if (!student) throw notFound("Student profile not found.");
    if (String(student._id) !== String(placement.student)) throw forbidden("Access denied.");
    query.student = student._id;
  }

  const logbooks = await InternshipLogbook.find(query)
    .populate("reviewedBy", "firstName lastName email")
    .sort({ weekNumber: 1 })
    .lean();

  return logbooks.map((l) => ({ id: String(l._id), ...l }));
}

/**
 * List attendance records for a placement.
 */
export async function listAttendance(placementId, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId).lean();
  if (!placement) throw notFound("Placement not found.");

  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");

  const query = { placement: placementId };
  if (isStudent) {
    const student = await resolveStudentForUser(requestingUser);
    if (!student) throw notFound("Student profile not found.");
    if (String(student._id) !== String(placement.student)) throw forbidden("Access denied.");
    query.student = student._id;
  }

  const records = await InternshipAttendance.find(query)
    .populate("supervisorUser", "firstName lastName email")
    .sort({ date: -1 })
    .lean();

  return records.map((a) => ({ id: String(a._id), ...a }));
}

/**
 * List reports for a placement.
 */
export async function listReports(placementId, { requestingUser }) {
  const placement = await InternshipPlacement.findById(placementId).lean();
  if (!placement) throw notFound("Placement not found.");

  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");

  const query = { placement: placementId };
  if (isStudent) {
    const student = await resolveStudentForUser(requestingUser);
    if (!student) throw notFound("Student profile not found.");
    if (String(student._id) !== String(placement.student)) throw forbidden("Access denied.");
    query.student = student._id;
  }

  const reports = await InternshipReport.find(query)
    .populate("evaluatedBy", "firstName lastName email")
    .sort({ createdAt: -1 })
    .lean();

  return reports.map((r) => ({ id: String(r._id), ...r }));
}
