import {
  IndustryProject,
  IndustryProjectMembership,
  IndustryProjectTask,
  IndustryProjectSubmission,
  IndustryProjectEvaluation,
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
  SubmissionWorkflow,
  validateTransition,
} from "./workflowService.js";

/**
 * Domain C: Industry Projects
 *
 * Project creation, approval, student/team allocation, task assignment,
 * work submissions, reviews, project completion.
 */

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function isCoordinator(user) {
  const roles = getUserRoles(user);
  return roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin"].includes(r),
  );
}

function isFaculty(user) {
  const roles = getUserRoles(user);
  return roles.includes("faculty");
}

/* ------------------------------------------------------------------ */
/* Projects                                                           */
/* ------------------------------------------------------------------ */

/**
 * Create an industry project.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createProject(data, { requestingUser }) {
  const sponsorEmployer = data.sponsorEmployer
    ? await Employer.findById(data.sponsorEmployer)
    : null;
  if (data.sponsorEmployer && !sponsorEmployer) {
    throw notFound("Sponsor employer not found.");
  }

  const project = await IndustryProject.create({
    institutionId: "techspire",
    title: String(data.title).trim(),
    sponsorEmployer: data.sponsorEmployer || null,
    sponsorName: data.sponsorName ? String(data.sponsorName).trim() : sponsorEmployer ? sponsorEmployer.name : undefined,
    industry: data.industry ? String(data.industry).trim() : undefined,
    durationWeeks: Number(data.durationWeeks || 12),
    teamSize: Number(data.teamSize || 4),
    difficulty: data.difficulty || "INTERMEDIATE",
    stipendOrPrize: data.stipendOrPrize ? String(data.stipendOrPrize).trim() : undefined,
    clientBrief: String(data.clientBrief).trim(),
    objectives: Array.isArray(data.objectives) ? data.objectives : [],
    deliverables: Array.isArray(data.deliverables) ? data.deliverables : [],
    requiredSkills: Array.isArray(data.requiredSkills) ? data.requiredSkills : [],
    mentorUser: data.mentorUser || null,
    mentorName: data.mentorName ? String(data.mentorName).trim() : undefined,
    mentorDesignation: data.mentorDesignation ? String(data.mentorDesignation).trim() : undefined,
    applicationDeadline: new Date(data.applicationDeadline),
    status: "DRAFT",
    enrolledStudentsCount: 0,
    isArchived: false,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "industry.project.create",
    module: "internship",
    resource: "IndustryProject",
    resourceId: String(project._id),
    details: `Industry project "${project.title}" created`,
    metadata: { projectId: String(project._id), sponsorEmployer: data.sponsorEmployer },
  });

  return { id: String(project._id), ...project.toObject() };
}

/**
 * Approve an industry project, moving it to ACCEPTING_APPLICATIONS.
 *
 * @param {string} projectId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function approveProject(projectId, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can approve industry projects.");
  }

  const project = await IndustryProject.findById(projectId);
  if (!project) {
    throw notFound("Industry project not found.");
  }

  if (project.status !== "DRAFT") {
    throw badRequest(`Only draft projects can be approved. Current: ${project.status}`);
  }

  project.status = "ACCEPTING_APPLICATIONS";
  await project.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "industry.project.approve",
    module: "internship",
    resource: "IndustryProject",
    resourceId: String(project._id),
    details: `Project approved: DRAFT -> ACCEPTING_APPLICATIONS`,
    metadata: { projectId: String(project._id) },
  });

  return { id: String(project._id), ...project.toObject() };
}

/**
 * Update an industry project.
 *
 * @param {string} projectId
 * @param {Object} updates
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function updateProject(projectId, updates, { requestingUser }) {
  const project = await IndustryProject.findById(projectId);
  if (!project) {
    throw notFound("Industry project not found.");
  }

  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can update industry projects.");
  }

  if (project.status !== "DRAFT") {
    throw badRequest("Only draft projects can be updated.");
  }

  const allowedFields = [
    "title",
    "sponsorEmployer",
    "sponsorName",
    "industry",
    "durationWeeks",
    "teamSize",
    "difficulty",
    "stipendOrPrize",
    "clientBrief",
    "objectives",
    "deliverables",
    "requiredSkills",
    "mentorUser",
    "mentorName",
    "mentorDesignation",
    "applicationDeadline",
  ];

  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(project._id), ...project.toObject() };
  }

  Object.assign(project, changes);
  await project.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "industry.project.update",
    module: "internship",
    resource: "IndustryProject",
    resourceId: String(project._id),
    details: `Project updated: ${Object.keys(changes).join(", ")}`,
    metadata: { projectId: String(project._id), changedFields: Object.keys(changes) },
  });

  return { id: String(project._id), ...project.toObject() };
}

/**
 * List industry projects with filtering.
 *
 * @param {Object} filter
 * @param {Object} options { page, limit }
 * @returns {Promise<Object>}
 */
export async function listProjects(filter = {}, { page = 1, limit = 20 }) {
  const query = { isArchived: { $ne: true } };
  if (filter.status) query.status = filter.status;
  if (filter.difficulty) query.difficulty = filter.difficulty;
  if (filter.sponsorEmployer) query.sponsorEmployer = filter.sponsorEmployer;

  const p = Math.max(1, Number(page));
  const l = Math.min(100, Math.max(1, Number(limit)));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    IndustryProject.find(query)
      .populate("sponsorEmployer", "name industry city")
      .populate("mentorUser", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    IndustryProject.countDocuments(query),
  ]);

  return {
    items: items.map((p) => ({
      id: String(p._id),
      ...p,
      sponsorEmployer: p.sponsorEmployer
        ? { id: String(p.sponsorEmployer._id), name: p.sponsorEmployer.name, industry: p.sponsorEmployer.industry, city: p.sponsorEmployer.city }
        : null,
      mentorUser: p.mentorUser
        ? { id: String(p.mentorUser._id), name: `${p.mentorUser.firstName} ${p.mentorUser.lastName}`, email: p.mentorUser.email }
        : null,
    })),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  };
}

/* ------------------------------------------------------------------ */
/* Memberships (team allocation)                                      */
/* ------------------------------------------------------------------ */

/**
 * Apply to join an industry project.
 *
 * @param {string} projectId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function applyToProject(projectId, { requestingUser }) {
  const project = await IndustryProject.findById(projectId).lean();
  if (!project) {
    throw notFound("Industry project not found.");
  }

  if (project.status !== "ACCEPTING_APPLICATIONS") {
    throw badRequest("This project is not accepting applications.", {
      code: "PROJECT_NOT_ACCEPTING",
    });
  }

  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can apply to industry projects.");
  }

  const existing = await IndustryProjectMembership.findOne({
    project: projectId,
    student: student._id,
  });
  if (existing) {
    throw conflict("You have already applied to this project.", {
      code: "DUPLICATE_MEMBERSHIP",
      membershipId: String(existing._id),
    });
  }

  const membership = await IndustryProjectMembership.create({
    project: projectId,
    student: student._id,
    teamRole: dataTeamRole(requestingUser),
    status: "APPLIED",
    statementOfContribution: dataStatement(requestingUser),
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "industry.project.apply",
    module: "internship",
    resource: "IndustryProjectMembership",
    resourceId: String(membership._id),
    details: `Student ${student.firstName} ${student.lastName} applied to project "${project.title}"`,
    metadata: { membershipId: String(membership._id), projectId: String(projectId), studentId: String(student._id) },
  });

  return { id: String(membership._id), ...membership.toObject() };
}

function dataTeamRole(user) {
  return "FULL_STACK";
}

function dataStatement(user) {
  return "";
}

/**
 * Approve or reject a project application (membership).
 *
 * @param {string} membershipId
 * @param {Object} data { status: "ACCEPTED"|"REJECTED"|"REMOVED", teamRole? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function decideMembership(membershipId, data, { requestingUser }) {
  const membership = await IndustryProjectMembership.findById(membershipId).lean();
  if (!membership) {
    throw notFound("Project membership not found.");
  }

  const project = await IndustryProject.findById(membership.project).lean();
  if (!project) {
    throw notFound("Project not found.");
  }

  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can decide on project memberships.");
  }

  if (membership.status !== "APPLIED") {
    throw badRequest(`Only applied memberships can be decided. Current: ${membership.status}`);
  }

  const newStatus = data.status;
  if (!["ACCEPTED", "REJECTED", "REMOVED"].includes(newStatus)) {
    throw badRequest(`Invalid membership status: ${newStatus}`);
  }

  membership.status = newStatus;
  if (data.teamRole) membership.teamRole = data.teamRole;

  await IndustryProjectMembership.updateOne({ _id: membershipId }, { $set: { status: newStatus, teamRole: membership.teamRole } });

  if (newStatus === "ACCEPTED") {
    await IndustryProject.updateOne(
      { _id: project._id },
      { $inc: { enrolledStudentsCount: 1 } },
    );
  }

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "industry.project.membership.decide",
    module: "internship",
    resource: "IndustryProjectMembership",
    resourceId: String(membershipId),
    details: `Membership ${newStatus.toLowerCase()}. Team role: ${membership.teamRole}`,
    metadata: { membershipId: String(membershipId), projectId: String(project._id), studentId: String(membership.student), newStatus },
  });

  await createAndEmitNotification({
    user: String(membership.student),
    title: `Project application ${newStatus.toLowerCase()}`,
    message: `Your application to join project "${project.title}" has been ${newStatus.toLowerCase()}.`,
    category: "internship",
    priority: newStatus === "ACCEPTED" ? "high" : "normal",
    actionUrl: `/industry-projects/${project._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "IndustryProjectMembership",
      relatedEntityId: String(membershipId),
    },
  });

  return { id: String(membershipId), ...membership, status: newStatus };
}

/**
 * List memberships for a project.
 *
 * @param {string} projectId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Array>}
 */
export async function listMemberships(projectId, { requestingUser }) {
  const project = await IndustryProject.findById(projectId).lean();
  if (!project) throw notFound("Industry project not found.");

  const memberships = await IndustryProjectMembership.find({ project: projectId })
    .populate("student", "studentId firstName lastName program semester department")
    .sort({ joinedAt: -1 })
    .lean();

  return memberships.map((m) => ({
    id: String(m._id),
    ...m,
    student: m.student
      ? { id: String(m.student._id), studentId: m.student.studentId, name: `${m.student.firstName} ${m.student.lastName}`, program: m.student.program, semester: m.student.semester }
      : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Tasks                                                              */
/* ------------------------------------------------------------------ */

/**
 * Create a task for an industry project.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createProjectTask(data, { requestingUser }) {
  const project = await IndustryProject.findById(data.project).lean();
  if (!project) {
    throw notFound("Industry project not found.");
  }

  if (!isCoordinator(requestingUser) && !isFaculty(requestingUser)) {
    throw forbidden("Only coordinators or faculty can create project tasks.");
  }

  const task = await IndustryProjectTask.create({
    project: data.project,
    milestoneNumber: Number(data.milestoneNumber || 1),
    title: String(data.title).trim(),
    description: data.description ? String(data.description).trim() : undefined,
    assignedMembers: Array.isArray(data.assignedMembers) ? data.assignedMembers : [],
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    status: data.status || "TODO",
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "industry.project.task.create",
    module: "internship",
    resource: "IndustryProjectTask",
    resourceId: String(task._id),
    details: `Task "${task.title}" created for project "${project.title}"`,
    metadata: { taskId: String(task._id), projectId: String(data.project) },
  });

  return { id: String(task._id), ...task.toObject() };
}

/**
 * Update a project task.
 *
 * @param {string} taskId
 * @param {Object} updates
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function updateProjectTask(taskId, updates, { requestingUser }) {
  const task = await IndustryProjectTask.findById(taskId);
  if (!task) {
    throw notFound("Task not found.");
  }

  if (!isCoordinator(requestingUser) && !isFaculty(requestingUser)) {
    throw forbidden("Only coordinators or faculty can update project tasks.");
  }

  const allowedFields = ["title", "description", "assignedMembers", "dueDate", "status", "milestoneNumber"];
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
    action: "industry.project.task.update",
    module: "internship",
    resource: "IndustryProjectTask",
    resourceId: String(taskId),
    details: `Task updated: ${Object.keys(changes).join(", ")}`,
    metadata: { taskId: String(taskId), changedFields: Object.keys(changes) },
  });

  return { id: String(task._id), ...task.toObject() };
}

/* ------------------------------------------------------------------ */
/* Submissions                                                        */
/* ------------------------------------------------------------------ */

/**
 * Submit work for a project task.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function submitWork(data, { requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can submit work.");
  }

  const task = await IndustryProjectTask.findById(data.task).lean();
  if (!task) {
    throw notFound("Task not found.");
  }

  const project = await IndustryProject.findById(task.project).lean();
  if (!project) {
    throw notFound("Project not found.");
  }

  const membership = await IndustryProjectMembership.findOne({
    project: task.project,
    student: student._id,
    status: "ACCEPTED",
  }).lean();
  if (!membership) {
    throw forbidden("You are not an accepted member of this project.", {
      code: "NOT_PROJECT_MEMBER",
    });
  }

  const existing = await IndustryProjectSubmission.findOne({
    project: task.project,
    task: data.task,
    submittedBy: student._id,
  }).sort({ submittedAt: -1 });

  const submissionData = {
    project: task.project,
    task: data.task,
    submittedBy: student._id,
    repositoryUrl: data.repositoryUrl ? String(data.repositoryUrl).trim() : undefined,
    liveDemoUrl: data.liveDemoUrl ? String(data.liveDemoUrl).trim() : undefined,
    deliverableFiles: Array.isArray(data.deliverableFiles) ? data.deliverableFiles : [],
    notes: data.notes ? String(data.notes).trim() : "",
    status: "SUBMITTED",
  };

  if (existing && existing.status === "REVISION_REQUESTED") {
    validateTransition("submission", existing.status, "RESUBMITTED", {
      userId: requestingUser._id || requestingUser.id,
      resource: "IndustryProjectSubmission",
      resourceId: String(existing._id),
      action: "industry.project.submission.resubmit",
    });
    Object.assign(existing, submissionData);
    existing.submittedAt = new Date();
    existing.status = "SUBMITTED";
    await existing.save();

    await logAudit({
      userId: requestingUser._id || requestingUser.id,
      action: "industry.project.submission.resubmit",
      module: "internship",
      resource: "IndustryProjectSubmission",
      resourceId: String(existing._id),
      details: `Resubmission for task ${task.title}`,
      metadata: { submissionId: String(existing._id), taskId: String(data.task) },
    });

    return { id: String(existing._id), ...existing.toObject() };
  }

  if (existing) {
    throw conflict("A submission already exists for this task.", {
      code: "DUPLICATE_SUBMISSION",
      submissionId: String(existing._id),
    });
  }

  const submission = await IndustryProjectSubmission.create(submissionData);

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "industry.project.submission.create",
    module: "internship",
    resource: "IndustryProjectSubmission",
    resourceId: String(submission._id),
    details: `Work submitted for task "${task.title}"`,
    metadata: { submissionId: String(submission._id), taskId: String(data.task), studentId: String(student._id) },
  });

  return { id: String(submission._id), ...submission.toObject() };
}

/**
 * Review a submission (approve or request revision).
 *
 * @param {string} submissionId
 * @param {Object} data { status, notes? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function reviewSubmission(submissionId, data, { requestingUser }) {
  const submission = await IndustryProjectSubmission.findById(submissionId);
  if (!submission) {
    throw notFound("Submission not found.");
  }

  const task = await IndustryProjectTask.findById(submission.task).lean();
  if (!task) {
    throw notFound("Task not found.");
  }

  const project = await IndustryProject.findById(task.project).lean();
  if (!project) {
    throw notFound("Project not found.");
  }

  if (!isCoordinator(requestingUser) && !isFaculty(requestingUser)) {
    throw forbidden("Only coordinators or faculty can review submissions.");
  }

  const newStatus = data.status;
  if (newStatus === "APPROVED") {
    validateTransition("submission", submission.status, "APPROVED", {
      userId: requestingUser._id || requestingUser.id,
      resource: "IndustryProjectSubmission",
      resourceId: String(submission._id),
      action: "industry.project.submission.approve",
    });
  } else if (newStatus === "REVISION_REQUESTED") {
    validateTransition("submission", submission.status, "REVISION_REQUESTED", {
      userId: requestingUser._id || requestingUser.id,
      resource: "IndustryProjectSubmission",
      resourceId: String(submission._id),
      action: "industry.project.submission.revision_requested",
    });
  } else if (newStatus === "UNDER_REVIEW") {
    validateTransition("submission", submission.status, "UNDER_REVIEW", {
      userId: requestingUser._id || requestingUser.id,
      resource: "IndustryProjectSubmission",
      resourceId: String(submission._id),
      action: "industry.project.submission.review_started",
    });
  } else {
    throw badRequest(`Invalid submission review status: ${newStatus}`);
  }

  submission.status = newStatus;
  if (data.notes) submission.notes = String(data.notes).trim().slice(0, 2000);
  await submission.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "industry.project.submission.review",
    module: "internship",
    resource: "IndustryProjectSubmission",
    resourceId: String(submission._id),
    details: `Submission reviewed: ${newStatus}`,
    metadata: { submissionId: String(submission._id), newStatus },
  });

  await createAndEmitNotification({
    user: String(submission.submittedBy),
    title: `Submission ${newStatus.toLowerCase().replace(/_/g, " ")}`,
    message: `Your submission for task "${task.title}" has been ${newStatus.toLowerCase().replace(/_/g, " ")}.`,
    category: "internship",
    priority: newStatus === "REVISION_REQUESTED" ? "high" : "normal",
    actionUrl: `/industry-projects/${task.project}/submissions/${submission._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "IndustryProjectSubmission",
      relatedEntityId: String(submission._id),
    },
  });

  return { id: String(submission._id), ...submission.toObject() };
}

/* ------------------------------------------------------------------ */
/* Evaluations                                                        */
/* ------------------------------------------------------------------ */

/**
 * Evaluate a student on a project.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function evaluateProjectStudent(data, { requestingUser }) {
  const project = await IndustryProject.findById(data.project).lean();
  if (!project) {
    throw notFound("Industry project not found.");
  }

  const student = await Student.findById(data.student).lean();
  if (!student) {
    throw notFound("Student not found.");
  }

  if (!isCoordinator(requestingUser) && !isFaculty(requestingUser)) {
    throw forbidden("Only coordinators or faculty can evaluate project students.");
  }

  const membership = await IndustryProjectMembership.findOne({
    project: data.project,
    student: data.student,
    status: "ACCEPTED",
  }).lean();
  if (!membership) {
    throw forbidden("The student is not an accepted member of this project.");
  }

  const existing = await IndustryProjectEvaluation.findOne({
    project: data.project,
    student: data.student,
    milestoneNumber: Number(data.milestoneNumber || 1),
  });
  if (existing) {
    throw conflict("An evaluation already exists for this student and milestone.", {
      code: "DUPLICATE_EVALUATION",
      evaluationId: String(existing._id),
    });
  }

  const evaluation = await IndustryProjectEvaluation.create({
    project: data.project,
    student: data.student,
    evaluatedBy: requestingUser._id || requestingUser.id,
    milestoneNumber: Number(data.milestoneNumber || 1),
    technicalExecution: Number(data.technicalExecution),
    deliverableCompleteness: Number(data.deliverableCompleteness),
    teamCollaboration: Number(data.teamCollaboration),
    score: Number(data.score),
    grade: data.grade ? String(data.grade).trim() : undefined,
    writtenFeedback: data.writtenFeedback ? String(data.writtenFeedback).trim() : "",
    evaluatedAt: new Date(),
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "industry.project.evaluate",
    module: "internship",
    resource: "IndustryProjectEvaluation",
    resourceId: String(evaluation._id),
    details: `Project evaluation created for ${student.firstName} ${student.lastName}. Score: ${evaluation.score}/100`,
    metadata: { evaluationId: String(evaluation._id), projectId: String(data.project), studentId: String(data.student), score: evaluation.score },
  });

  return { id: String(evaluation._id), ...evaluation.toObject() };
}

/* ------------------------------------------------------------------ */
/* Project completion                                                 */
/* ------------------------------------------------------------------ */

/**
 * Complete an industry project.
 *
 * @param {string} projectId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function completeProject(projectId, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can complete industry projects.");
  }

  const project = await IndustryProject.findById(projectId);
  if (!project) {
    throw notFound("Industry project not found.");
  }

  if (project.status === "COMPLETED") {
    throw badRequest("Project is already completed.");
  }

  project.status = "COMPLETED";
  await project.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "industry.project.complete",
    module: "internship",
    resource: "IndustryProject",
    resourceId: String(project._id),
    details: `Project completed: "${project.title}"`,
    metadata: { projectId: String(project._id) },
  });

  return { id: String(project._id), ...project.toObject() };
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

/**
 * List submissions for a task or project.
 *
 * @param {Object} filter { projectId?, taskId? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Array>}
 */
export async function listSubmissions(filter = {}, { requestingUser }) {
  const query = {};
  if (filter.projectId) query.project = filter.projectId;
  if (filter.taskId) query.task = filter.taskId;

  const submissions = await IndustryProjectSubmission.find(query)
    .populate("submittedBy", "studentId firstName lastName")
    .populate("task", "title milestoneNumber")
    .sort({ submittedAt: -1 })
    .lean();

  return submissions.map((s) => ({
    id: String(s._id),
    ...s,
    submittedBy: s.submittedBy
      ? { id: String(s.submittedBy._id), studentId: s.submittedBy.studentId, name: `${s.submittedBy.firstName} ${s.submittedBy.lastName}` }
      : null,
  }));
}
