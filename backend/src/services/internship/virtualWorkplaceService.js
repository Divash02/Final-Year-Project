import {
  VirtualCompanyTemplate,
  VirtualDepartment,
  VirtualSimulation,
  SimulationApplication,
  SimulationMembership,
  SimulationTeam,
  SimulationProject,
  SimulationTask,
  SimulationSubmission,
  SimulationReview,
  SimulationEvent,
  SimulationAssessment,
  Competency,
  CompetencyEvidence,
  ProfessionalPortfolio,
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
import { SubmissionWorkflow, validateTransition } from "./workflowService.js";

/**
 * Domain D: Virtual Workplace Simulations
 *
 * Company template management, simulation creation/configuration, career path
 * selection, baseline assessment processing, simulation applications, membership
 * creation, team assignment, project management, task assignment, submission
 * management, review workflow, workplace event management, competency evidence
 * creation, portfolio preparation.
 *
 * Business rule: virtual simulation completion must NOT create a real internship
 * placement. This domain is entirely separate from the real internship domain.
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
  return roles.includes("student");
}

function isStudent(user) {
  const roles = getUserRoles(user);
  return roles.includes("student");
}

async function resolveStudentForUser(user) {
  const roles = getUserRoles(user);
  if (!roles.includes("student")) return null;
  const student = await Student.findOne({ user: user._id || user.id }).lean();
  return student || null;
}

/* ------------------------------------------------------------------ */
/* Company Templates                                                  */
/* ------------------------------------------------------------------ */

/**
 * Create a virtual company template.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createCompanyTemplate(data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can create company templates.");
  }

  const existing = await VirtualCompanyTemplate.findOne({
    templateCode: String(data.templateCode).toUpperCase().trim(),
  });
  if (existing) {
    throw conflict("A template with this code already exists.", {
      code: "DUPLICATE_TEMPLATE_CODE",
    });
  }

  const template = await VirtualCompanyTemplate.create({
    templateCode: String(data.templateCode).toUpperCase().trim(),
    name: String(data.name).trim(),
    brandTagline: data.brandTagline ? String(data.brandTagline).trim() : undefined,
    sector: data.sector,
    description: String(data.description).trim(),
    headquarters: data.headquarters ? String(data.headquarters).trim() : "Virtual Innovation District",
    simulatedEmployeeCount: Number(data.simulatedEmployeeCount || 450),
    technologies: Array.isArray(data.technologies) ? data.technologies : [],
    difficulty: data.difficulty || "PRODUCTION_GRADE",
    defaultDepartments: Array.isArray(data.defaultDepartments) ? data.defaultDepartments : [],
    defaultProjects: Array.isArray(data.defaultProjects) ? data.defaultProjects : [],
    isPublished: data.isPublished !== undefined ? Boolean(data.isPublished) : true,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.template.create",
    module: "internship",
    resource: "VirtualCompanyTemplate",
    resourceId: String(template._id),
    details: `Company template "${template.name}" created`,
    metadata: { templateId: String(template._id), templateCode: template.templateCode },
  });

  return { id: String(template._id), ...template.toObject() };
}

/**
 * Update a company template.
 *
 * @param {string} templateId
 * @param {Object} updates
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function updateCompanyTemplate(templateId, updates, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can update company templates.");
  }

  const template = await VirtualCompanyTemplate.findById(templateId);
  if (!template) {
    throw notFound("Company template not found.");
  }

  const allowedFields = [
    "name",
    "brandTagline",
    "sector",
    "description",
    "headquarters",
    "simulatedEmployeeCount",
    "technologies",
    "difficulty",
    "defaultDepartments",
    "defaultProjects",
    "isPublished",
  ];

  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(template._id), ...template.toObject() };
  }

  if (changes.templateCode) {
    changes.templateCode = String(changes.templateCode).toUpperCase().trim();
  }

  Object.assign(template, changes);
  await template.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.template.update",
    module: "internship",
    resource: "VirtualCompanyTemplate",
    resourceId: String(template._id),
    details: `Template updated: ${Object.keys(changes).join(", ")}`,
    metadata: { templateId: String(template._id), changedFields: Object.keys(changes) },
  });

  return { id: String(template._id), ...template.toObject() };
}

/**
 * List company templates.
 *
 * @param {Object} filter
 * @param {Object} options { page, limit }
 * @returns {Promise<Object>}
 */
export async function listCompanyTemplates(filter = {}, { page = 1, limit = 20 }) {
  const query = {};
  if (filter.sector) query.sector = filter.sector;
  if (filter.isPublished !== undefined) query.isPublished = filter.isPublished === true;

  const p = Math.max(1, Number(page));
  const l = Math.min(100, Math.max(1, Number(limit)));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    VirtualCompanyTemplate.find(query)
      .sort({ name: 1 })
      .skip(skip)
      .limit(l)
      .lean(),
    VirtualCompanyTemplate.countDocuments(query),
  ]);

  return {
    items: items.map((t) => ({ id: String(t._id), ...t })),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  };
}

/* ------------------------------------------------------------------ */
/* Simulations                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create a virtual simulation from a template.
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createSimulation(data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can create simulations.");
  }

  const template = await VirtualCompanyTemplate.findById(data.template).lean();
  if (!template) {
    throw notFound("Company template not found.");
  }

  const existing = await VirtualSimulation.findOne({
    simulationCode: String(data.simulationCode).toUpperCase().trim(),
  });
  if (existing) {
    throw conflict("A simulation with this code already exists.", {
      code: "DUPLICATE_SIMULATION_CODE",
    });
  }

  const simulation = await VirtualSimulation.create({
    simulationCode: String(data.simulationCode).toUpperCase().trim(),
    template: data.template,
    companyName: data.companyName || template.name,
    institutionId: "techspire",
    academicYear: String(data.academicYear).trim(),
    semester: Number(data.semester),
    currentSprintNumber: 1,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    status: "ENROLLING",
    enrolledCount: 0,
    coordinator: requestingUser._id || requestingUser.id,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.simulation.create",
    module: "internship",
    resource: "VirtualSimulation",
    resourceId: String(simulation._id),
    details: `Simulation "${simulation.companyName}" created from template ${template.templateCode}`,
    metadata: { simulationId: String(simulation._id), simulationCode: simulation.simulationCode, templateId: data.template },
  });

  return { id: String(simulation._id), ...simulation.toObject() };
}

/**
 * Configure a simulation (dates, status, etc.).
 *
 * @param {string} simulationId
 * @param {Object} updates
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function configureSimulation(simulationId, updates, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can configure simulations.");
  }

  const simulation = await VirtualSimulation.findById(simulationId);
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  const allowedFields = ["academicYear", "semester", "startDate", "endDate", "status", "currentSprintNumber"];
  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(simulation._id), ...simulation.toObject() };
  }

  Object.assign(simulation, changes);
  await simulation.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.simulation.configure",
    module: "internship",
    resource: "VirtualSimulation",
    resourceId: String(simulation._id),
    details: `Simulation configured: ${Object.keys(changes).join(", ")}`,
    metadata: { simulationId: String(simulation._id), changedFields: Object.keys(changes) },
  });

  return { id: String(simulation._id), ...simulation.toObject() };
}

/**
 * List simulations.
 *
 * @param {Object} filter
 * @param {Object} options { requestingUser, page, limit }
 * @returns {Promise<Object>}
 */
export async function listSimulations(filter = {}, { requestingUser, page = 1, limit = 20 }) {
  const query = {};
  if (filter.status) query.status = filter.status;
  if (filter.academicYear) query.academicYear = filter.academicYear;
  if (filter.semester) query.semester = Number(filter.semester);

  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");

  if (isStudent) {
    const student = await resolveStudentForUser(requestingUser);
    if (!student) throw notFound("Student profile not found.");
    const membership = await SimulationMembership.findOne({ student: student._id }).lean();
    if (membership) query._id = membership.simulation;
  }

  const p = Math.max(1, Number(page));
  const l = Math.min(100, Math.max(1, Number(limit)));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    VirtualSimulation.find(query)
      .populate("template", "name sector templateCode")
      .populate("coordinator", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    VirtualSimulation.countDocuments(query),
  ]);

  return {
    items: items.map((s) => ({
      id: String(s._id),
      ...s,
      template: s.template
        ? { id: String(s.template._id), name: s.template.name, sector: s.template.sector, templateCode: s.template.templateCode }
        : null,
      coordinator: s.coordinator
        ? { id: String(s.coordinator._id), name: `${s.coordinator.firstName} ${s.coordinator.lastName}`, email: s.coordinator.email }
        : null,
    })),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  };
}

/* ------------------------------------------------------------------ */
/* Simulation Applications                                            */
/* ------------------------------------------------------------------ */

/**
 * Apply to a simulation with a career path selection.
 *
 * @param {string} simulationId
 * @param {Object} data { targetCareerPath, statementOfIntent? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function applyToSimulation(simulationId, data, { requestingUser }) {
  const simulation = await VirtualSimulation.findById(simulationId).lean();
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  if (simulation.status !== "ENROLLING" && simulation.status !== "ACTIVE") {
    throw badRequest("This simulation is not accepting applications.", {
      code: "SIMULATION_NOT_ENROLLING",
    });
  }

  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can apply to simulations.");
  }

  const existing = await SimulationApplication.findOne({
    simulation: simulationId,
    student: student._id,
  });
  if (existing) {
    throw conflict("You have already applied to this simulation.", {
      code: "DUPLICATE_SIMULATION_APPLICATION",
      applicationId: String(existing._id),
    });
  }

  const application = await SimulationApplication.create({
    simulation: simulationId,
    student: student._id,
    targetCareerPath: data.targetCareerPath,
    statementOfIntent: data.statementOfIntent ? String(data.statementOfIntent).trim() : "",
    status: "PENDING",
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.simulation.apply",
    module: "internship",
    resource: "SimulationApplication",
    resourceId: String(application._id),
    details: `Student ${student.firstName} ${student.lastName} applied to simulation ${simulation.simulationCode} as ${data.targetCareerPath}`,
    metadata: { applicationId: String(application._id), simulationId: String(simulationId), studentId: String(student._id), careerPath: data.targetCareerPath },
  });

  return { id: String(application._id), ...application.toObject() };
}

/**
 * Review a simulation application (accept or reject).
 *
 * @param {string} applicationId
 * @param {Object} data { status: "ACCEPTED"|"REJECTED" }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function reviewSimulationApplication(applicationId, data, { requestingUser }) {
  if (!isCoordinator(requestingUser) && !isFaculty(requestingUser)) {
    throw forbidden("Only coordinators or faculty can review simulation applications.");
  }

  const application = await SimulationApplication.findById(applicationId);
  if (!application) {
    throw notFound("Simulation application not found.");
  }

  if (application.status !== "PENDING") {
    throw badRequest(`Only pending applications can be reviewed. Current: ${application.status}`);
  }

  const newStatus = data.status;
  if (!["ACCEPTED", "REJECTED"].includes(newStatus)) {
    throw badRequest(`Invalid application status: ${newStatus}`);
  }

  application.status = newStatus;
  application.reviewedBy = requestingUser._id || requestingUser.id;
  await application.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.simulation.application.review",
    module: "internship",
    resource: "SimulationApplication",
    resourceId: String(application._id),
    details: `Application ${newStatus.toLowerCase()}`,
    metadata: { applicationId: String(application._id), newStatus },
  });

  await createAndEmitNotification({
    user: String(application.student),
    title: `Simulation application ${newStatus.toLowerCase()}`,
    message: `Your application to the virtual workplace simulation has been ${newStatus.toLowerCase()}.`,
    category: "internship",
    priority: newStatus === "ACCEPTED" ? "high" : "normal",
    actionUrl: `/virtual-workplace/applications/${application._id}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "SimulationApplication",
      relatedEntityId: String(application._id),
    },
  });

  return { id: String(application._id), ...application.toObject() };
}

/* ------------------------------------------------------------------ */
/* Memberships                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create a simulation membership (after application acceptance).
 *
 * @param {string} applicationId
 * @param {Object} data { careerPath?, teamId? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createMembership(applicationId, data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can create simulation memberships.");
  }

  const application = await SimulationApplication.findById(applicationId).lean();
  if (!application) {
    throw notFound("Simulation application not found.");
  }

  if (application.status !== "ACCEPTED") {
    throw badRequest("Only accepted applications can be converted to memberships.", {
      code: "APPLICATION_NOT_ACCEPTED",
    });
  }

  const existing = await SimulationMembership.findOne({
    simulation: application.simulation,
    student: application.student,
  });
  if (existing) {
    throw conflict("A membership already exists for this student in this simulation.", {
      code: "DUPLICATE_MEMBERSHIP",
      membershipId: String(existing._id),
    });
  }

  const membership = await SimulationMembership.create({
    simulation: application.simulation,
    student: application.student,
    careerPath: data.careerPath || application.targetCareerPath,
    team: data.teamId || null,
    status: "ACTIVE",
    completedStoryPoints: 0,
  });

  await VirtualSimulation.updateOne(
    { _id: application.simulation },
    { $inc: { enrolledCount: 1 } },
  );

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.membership.create",
    module: "internship",
    resource: "SimulationMembership",
    resourceId: String(membership._id),
    details: `Membership created for student ${application.student} in simulation ${application.simulation}`,
    metadata: { membershipId: String(membership._id), simulationId: String(application.simulation), studentId: String(application.student), careerPath: membership.careerPath },
  });

  await createAndEmitNotification({
    user: String(application.student),
    title: "Simulation membership activated",
    message: `You are now a member of the virtual workplace simulation as a ${membership.careerPath}.`,
    category: "internship",
    priority: "high",
    actionUrl: `/virtual-workplace/simulations/${application.simulation}`,
    sender: requestingUser._id || requestingUser.id,
    metadata: {
      relatedEntityType: "SimulationMembership",
      relatedEntityId: String(membership._id),
    },
  });

  return { id: String(membership._id), ...membership.toObject() };
}

/**
 * List memberships for a simulation.
 *
 * @param {string} simulationId
 * @param {Object} options { requestingUser }
 * @returns {Promise<Array>}
 */
export async function listMemberships(simulationId, { requestingUser }) {
  const simulation = await VirtualSimulation.findById(simulationId).lean();
  if (!simulation) throw notFound("Simulation not found.");

  const memberships = await SimulationMembership.find({ simulation: simulationId })
    .populate("student", "studentId firstName lastName program semester department")
    .populate("team", "teamName department")
    .sort({ joinedAt: -1 })
    .lean();

  return memberships.map((m) => ({
    id: String(m._id),
    ...m,
    student: m.student
      ? { id: String(m.student._id), studentId: m.student.studentId, name: `${m.student.firstName} ${m.student.lastName}`, program: m.student.program }
      : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Teams                                                              */
/* ------------------------------------------------------------------ */

/**
 * Create a team within a simulation.
 *
 * @param {string} simulationId
 * @param {Object} data { teamName, department?, squadLeadUser? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createTeam(simulationId, data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can create teams.");
  }

  const simulation = await VirtualSimulation.findById(simulationId).lean();
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  const team = await SimulationTeam.create({
    simulation: simulationId,
    department: data.department || null,
    teamName: String(data.teamName).trim(),
    squadLeadUser: data.squadLeadUser || null,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.team.create",
    module: "internship",
    resource: "SimulationTeam",
    resourceId: String(team._id),
    details: `Team "${team.teamName}" created in simulation ${simulation.simulationCode}`,
    metadata: { teamId: String(team._id), simulationId: String(simulationId) },
  });

  return { id: String(team._id), ...team.toObject() };
}

/* ------------------------------------------------------------------ */
/* Projects (simulation)                                              */
/* ------------------------------------------------------------------ */

/**
 * Create a project within a simulation.
 *
 * @param {string} simulationId
 * @param {Object} data { name, team?, epic?, description? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createSimulationProject(simulationId, data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can create simulation projects.");
  }

  const simulation = await VirtualSimulation.findById(simulationId).lean();
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  const project = await SimulationProject.create({
    simulation: simulationId,
    team: data.teamId || null,
    name: String(data.name).trim(),
    epic: data.epic ? String(data.epic).trim() : "Core Platform",
    description: data.description ? String(data.description).trim() : "",
    status: "PLANNING",
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.project.create",
    module: "internship",
    resource: "SimulationProject",
    resourceId: String(project._id),
    details: `Simulation project "${project.name}" created`,
    metadata: { projectId: String(project._id), simulationId: String(simulationId) },
  });

  return { id: String(project._id), ...project.toObject() };
}

/* ------------------------------------------------------------------ */
/* Tasks (simulation)                                                 */
/* ------------------------------------------------------------------ */

/**
 * Create a task within a simulation.
 *
 * @param {string} simulationId
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createSimulationTask(simulationId, data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can create simulation tasks.");
  }

  const simulation = await VirtualSimulation.findById(simulationId).lean();
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  const task = await SimulationTask.create({
    simulation: simulationId,
    project: data.projectId || null,
    ticketNumber: String(data.ticketNumber).toUpperCase().trim(),
    title: String(data.title).trim(),
    description: data.description ? String(data.description).trim() : undefined,
    careerPath: data.careerPath,
    priority: data.priority || "MEDIUM",
    status: data.status || "TODO",
    storyPoints: Number(data.storyPoints || 3),
    assigneeMembership: data.assigneeMembershipId || null,
    acceptanceCriteria: Array.isArray(data.acceptanceCriteria) ? data.acceptanceCriteria : [],
    labels: Array.isArray(data.labels) ? data.labels : [],
    sprintNumber: Number(data.sprintNumber || simulation.currentSprintNumber || 1),
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.task.create",
    module: "internship",
    resource: "SimulationTask",
    resourceId: String(task._id),
    details: `Task "${task.title}" (${task.ticketNumber}) created in simulation ${simulation.simulationCode}`,
    metadata: { taskId: String(task._id), simulationId: String(simulationId) },
  });

  return { id: String(task._id), ...task.toObject() };
}

/**
 * Update a simulation task (status, assignee, etc.).
 *
 * @param {string} taskId
 * @param {Object} updates
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function updateSimulationTask(taskId, updates, { requestingUser }) {
  const task = await SimulationTask.findById(taskId);
  if (!task) {
    throw notFound("Simulation task not found.");
  }

  const roles = getUserRoles(requestingUser);
  const isStudent = roles.includes("student");
  const isCoordinatorUser = isCoordinator(requestingUser);

  let canUpdate = isCoordinatorUser;
  if (isStudent && updates.status) {
    const student = await resolveStudentForUser(requestingUser);
    if (student) {
      const membership = await SimulationMembership.findOne({
        simulation: task.simulation,
        student: student._id,
      }).lean();
      if (membership && String(task.assigneeMembership) === String(membership._id)) {
        canUpdate = true;
      }
    }
  }

  if (!canUpdate) {
    throw forbidden("You are not authorized to update this task.");
  }

  const allowedFields = ["title", "description", "careerPath", "priority", "status", "storyPoints", "assigneeMembership", "acceptanceCriteria", "labels", "sprintNumber"];
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
    action: "virtual.workplace.task.update",
    module: "internship",
    resource: "SimulationTask",
    resourceId: String(taskId),
    details: `Task updated: ${Object.keys(changes).join(", ")}`,
    metadata: { taskId: String(taskId), changedFields: Object.keys(changes) },
  });

  return { id: String(task._id), ...task.toObject() };
}

/* ------------------------------------------------------------------ */
/* Submissions (simulation)                                           */
/* ------------------------------------------------------------------ */

/**
 * Submit work for a simulation task.
 *
 * @param {string} taskId
 * @param {Object} data { pullRequestUrl?, figmaLink?, testSuiteSummary?, documentationLink?, notes? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function submitSimulationWork(taskId, data, { requestingUser }) {
  const task = await SimulationTask.findById(taskId).lean();
  if (!task) {
    throw notFound("Simulation task not found.");
  }

  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can submit work.");
  }

  const membership = await SimulationMembership.findOne({
    simulation: task.simulation,
    student: student._id,
    status: "ACTIVE",
  }).lean();
  if (!membership) {
    throw forbidden("You are not an active member of this simulation.", {
      code: "NOT_SIMULATION_MEMBER",
    });
  }

  const existing = await SimulationSubmission.findOne({
    task: taskId,
    submittedByMembership: membership._id,
  });
  if (existing) {
    throw conflict("A submission already exists for this task.", {
      code: "DUPLICATE_SIMULATION_SUBMISSION",
      submissionId: String(existing._id),
    });
  }

  const submission = await SimulationSubmission.create({
    task: taskId,
    simulation: task.simulation,
    submittedByMembership: membership._id,
    pullRequestUrl: data.pullRequestUrl ? String(data.pullRequestUrl).trim() : undefined,
    figmaLink: data.figmaLink ? String(data.figmaLink).trim() : undefined,
    testSuiteSummary: data.testSuiteSummary ? String(data.testSuiteSummary).trim() : undefined,
    documentationLink: data.documentationLink ? String(data.documentationLink).trim() : undefined,
    notes: data.notes ? String(data.notes).trim() : "",
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.submission.create",
    module: "internship",
    resource: "SimulationSubmission",
    resourceId: String(submission._id),
    details: `Work submitted for task ${task.ticketNumber}`,
    metadata: { submissionId: String(submission._id), taskId: String(taskId), membershipId: String(membership._id) },
  });

  return { id: String(submission._id), ...submission.toObject() };
}

/**
 * Review a simulation submission.
 *
 * @param {string} submissionId
 * @param {Object} data { feedback, score? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function reviewSimulationSubmission(submissionId, data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can review simulation submissions.");
  }

  const submission = await SimulationSubmission.findById(submissionId);
  if (!submission) {
    throw notFound("Submission not found.");
  }

  submission.reviewedBy = requestingUser._id || requestingUser.id;
  submission.reviewedAt = new Date();
  submission.reviewerFeedback = data.feedback ? String(data.feedback).trim() : "";
  submission.reviewScore = data.score !== undefined ? Number(data.score) : undefined;
  submission.reviewStatus = data.reviewStatus || "REVIEWED";
  await submission.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.submission.review",
    module: "internship",
    resource: "SimulationSubmission",
    resourceId: String(submission._id),
    details: `Submission reviewed: ${submission.reviewStatus}`,
    metadata: { submissionId: String(submission._id) },
  });

  return { id: String(submission._id), ...submission.toObject() };
}

/* ------------------------------------------------------------------ */
/* Workplace Events                                                   */
/* ------------------------------------------------------------------ */

/**
 * Create a workplace event (incident, crisis, milestone, etc.).
 *
 * @param {string} simulationId
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createEvent(simulationId, data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can create workplace events.");
  }

  const simulation = await VirtualSimulation.findById(simulationId).lean();
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  const event = await SimulationEvent.create({
    simulation: simulationId,
    eventType: data.eventType,
    severity: data.severity,
    title: String(data.title).trim(),
    scenarioDescription: data.scenarioDescription ? String(data.scenarioDescription).trim() : "",
    status: data.status || "ACTIVE",
    startsAt: data.startsAt ? new Date(data.startsAt) : new Date(),
    endsAt: data.endsAt ? new Date(data.endsAt) : null,
    responseRequired: Boolean(data.responseRequired),
    responseDeadline: data.responseDeadline ? new Date(data.responseDeadline) : null,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.event.create",
    module: "internship",
    resource: "SimulationEvent",
    resourceId: String(event._id),
    details: `Event "${event.title}" (${event.eventType}) created in simulation ${simulation.simulationCode}`,
    metadata: { eventId: String(event._id), simulationId: String(simulationId) },
  });

  return { id: String(event._id), ...event.toObject() };
}

/* ------------------------------------------------------------------ */
/* Competency Evidence                                                */
/* ------------------------------------------------------------------ */

/**
 * Create competency evidence with a traceable source.
 *
 * Business rule: competency evidence must have a traceable source
 * (sourceDomain + sourceReferenceId).
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createCompetencyEvidence(data, { requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can create competency evidence.");
  }

  const competency = await Competency.findById(data.competency).lean();
  if (!competency) {
    throw notFound("Competency not found.");
  }

  if (!data.sourceDomain || !["REAL_INTERNSHIP", "INDUSTRY_PROJECT", "VIRTUAL_SIMULATION"].includes(data.sourceDomain)) {
    throw badRequest("A valid source domain is required: REAL_INTERNSHIP, INDUSTRY_PROJECT, or VIRTUAL_SIMULATION.", {
      code: "INVALID_SOURCE_DOMAIN",
    });
  }

  if (!data.sourceReferenceId || String(data.sourceReferenceId).trim() === "") {
    throw badRequest("A traceable source reference ID is required.", {
      code: "MISSING_SOURCE_REFERENCE",
    });
  }

  const existing = await CompetencyEvidence.findOne({
    student: student._id,
    competency: data.competency,
    sourceDomain: data.sourceDomain,
    sourceReferenceId: String(data.sourceReferenceId).trim(),
  });
  if (existing) {
    throw conflict("Competency evidence with this source already exists.", {
      code: "DUPLICATE_COMPETENCY_EVIDENCE",
      evidenceId: String(existing._id),
    });
  }

  const evidence = await CompetencyEvidence.create({
    student: student._id,
    competency: data.competency,
    sourceDomain: data.sourceDomain,
    sourceReferenceId: String(data.sourceReferenceId).trim(),
    evidenceSummary: data.evidenceSummary ? String(data.evidenceSummary).trim() : "",
    evidenceUrl: data.evidenceUrl ? String(data.evidenceUrl).trim() : undefined,
    evidenceFile: data.evidenceFile || null,
    verifiedBy: null,
    verifiedAt: null,
    scoreLevel: Number(data.scoreLevel || competency.targetProficiency || 80),
    endorsementCount: 1,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.competency.evidence.create",
    module: "internship",
    resource: "CompetencyEvidence",
    resourceId: String(evidence._id),
    details: `Competency evidence created for ${competency.code}: ${evidence.sourceDomain}/${evidence.sourceReferenceId}`,
    metadata: { evidenceId: String(evidence._id), studentId: String(student._id), competencyId: String(data.competency), sourceDomain: data.sourceDomain, sourceReferenceId: String(data.sourceReferenceId) },
  });

  return { id: String(evidence._id), ...evidence.toObject() };
}

/**
 * Verify competency evidence (faculty/coordinator).
 *
 * @param {string} evidenceId
 * @param {Object} data { verifiedBy?, scoreLevel? }
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function verifyCompetencyEvidence(evidenceId, data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only college coordinators can verify competency evidence.");
  }

  const evidence = await CompetencyEvidence.findById(evidenceId);
  if (!evidence) {
    throw notFound("Competency evidence not found.");
  }

  evidence.verifiedBy = requestingUser._id || requestingUser.id;
  evidence.verifiedAt = new Date();
  if (data.scoreLevel !== undefined) evidence.scoreLevel = Number(data.scoreLevel);
  await evidence.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.competency.evidence.verify",
    module: "internship",
    resource: "CompetencyEvidence",
    resourceId: String(evidence._id),
    details: `Competency evidence verified by ${requestingUser.firstName || ""} ${requestingUser.lastName || ""}`,
    metadata: { evidenceId: String(evidence._id), scoreLevel: evidence.scoreLevel },
  });

  return { id: String(evidence._id), ...evidence.toObject() };
}

/* ------------------------------------------------------------------ */
/* Professional Portfolio                                             */
/* ------------------------------------------------------------------ */

/**
 * Create or update a professional portfolio.
 *
 * Business rule: portfolio sharing must respect participant consent
 * (isPublic flag controls visibility).
 *
 * @param {Object} data
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function createOrUpdatePortfolio(data, { requestingUser }) {
  const student = await resolveStudentForUser(requestingUser);
  if (!student) {
    throw forbidden("Only students can manage portfolios.");
  }

  const existing = await ProfessionalPortfolio.findOne({ student: student._id });

  const portfolioData = {
    student: student._id,
    slug: data.slug ? String(data.slug).toLowerCase().trim() : `${student.studentId || student._id}-portfolio`,
    headline: data.headline ? String(data.headline).trim() : "",
    bio: data.bio ? String(data.bio).trim() : "",
    featuredSkills: Array.isArray(data.featuredSkills) ? data.featuredSkills : [],
    verifiedDeliverables: Array.isArray(data.verifiedDeliverables) ? data.verifiedDeliverables : [],
    isPublic: data.isPublic !== undefined ? Boolean(data.isPublic) : true,
    lastUpdated: new Date(),
  };

  let portfolio;
  if (existing) {
    Object.assign(existing, portfolioData);
    portfolio = await existing.save();
  } else {
    portfolio = await ProfessionalPortfolio.create(portfolioData);
  }

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.workplace.portfolio.update",
    module: "internship",
    resource: "ProfessionalPortfolio",
    resourceId: String(portfolio._id),
    details: `Portfolio ${existing ? "updated" : "created"} for student ${student.firstName} ${student.lastName}. Public: ${portfolio.isPublic}`,
    metadata: { portfolioId: String(portfolio._id), studentId: String(student._id), isPublic: portfolio.isPublic },
  });

  return { id: String(portfolio._id), ...portfolio.toObject() };
}

/**
 * Get a portfolio by slug with consent-respecting visibility.
 *
 * @param {string} slug
 * @param {Object} options { requestingUser }
 * @returns {Promise<Object>}
 */
export async function getPortfolio(slug, { requestingUser }) {
  const portfolio = await ProfessionalPortfolio.findOne({ slug })
    .populate("student", "studentId firstName lastName program semester department")
    .lean();

  if (!portfolio) {
    throw notFound("Portfolio not found.");
  }

  if (!portfolio.isPublic) {
    const roles = getUserRoles(requestingUser);
    const isOwner = roles.includes("student") &&
      String(portfolio.student._id) === String(await (await resolveStudentForUser(requestingUser))?._id);
    const isCoordinatorUser = isCoordinator(requestingUser);
    if (!isOwner && !isCoordinatorUser) {
      throw forbidden("This portfolio is not publicly shared.", {
        code: "PORTFOLIO_NOT_PUBLIC",
      });
    }
  }

  return { id: String(portfolio._id), ...portfolio };
}

/**
 * List portfolios (public only unless coordinator).
 *
 * @param {Object} options { requestingUser, page, limit }
 * @returns {Promise<Object>}
 */
export async function listPortfolios({ requestingUser, page = 1, limit = 20 }) {
  const roles = getUserRoles(requestingUser);
  const isCoordinatorUser = isCoordinator(requestingUser);

  const query = isCoordinatorUser ? {} : { isPublic: true };

  const p = Math.max(1, Number(page));
  const l = Math.min(100, Math.max(1, Number(limit)));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    ProfessionalPortfolio.find(query)
      .populate("student", "studentId firstName lastName program semester department")
      .sort({ lastUpdated: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    ProfessionalPortfolio.countDocuments(query),
  ]);

  return {
    items: items.map((p) => ({
      id: String(p._id),
      ...p,
      student: p.student
        ? { id: String(p.student._id), studentId: p.student.studentId, name: `${p.student.firstName} ${p.student.lastName}`, program: p.student.program }
        : null,
    })),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  };
}
