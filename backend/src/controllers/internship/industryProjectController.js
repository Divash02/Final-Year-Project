import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  badRequest,
  notFound,
} from "../../utils/apiError.js";
import * as projectService from "../../services/internship/industryProjectService.js";

/**
 * Domain C: Industry Projects Controllers
 * Thin HTTP layer; all business logic lives in industryProjectService.
 */

/* ------------------------------------------------------------------ */
/* Projects                                                           */
/* ------------------------------------------------------------------ */

export const createProject = asyncHandler(async (req, res) => {
  const { title, clientBrief, applicationDeadline } = req.body;
  if (!title || !clientBrief || !applicationDeadline) {
    throw badRequest("title, clientBrief, and applicationDeadline are required.");
  }
  const project = await projectService.createProject(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ project });
});

export const approveProject = asyncHandler(async (req, res) => {
  const project = await projectService.approveProject(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ project });
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await projectService.updateProject(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ project });
});

export const listProjects = asyncHandler(async (req, res) => {
  const result = await projectService.listProjects(
    {
      status: req.query.status,
      difficulty: req.query.difficulty,
      sponsorEmployer: req.query.sponsorEmployer,
    },
    { page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

/* ------------------------------------------------------------------ */
/* Memberships                                                        */
/* ------------------------------------------------------------------ */

export const applyToProject = asyncHandler(async (req, res) => {
  const membership = await projectService.applyToProject(req.params.id, {
    requestingUser: req.user,
  });
  res.status(201).json({ membership });
});

export const decideMembership = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status || !["ACCEPTED", "REJECTED", "REMOVED"].includes(status)) {
    throw badRequest("Valid status (ACCEPTED, REJECTED, or REMOVED) is required.");
  }
  const membership = await projectService.decideMembership(req.params.id, { status, teamRole: req.body.teamRole }, {
    requestingUser: req.user,
  });
  res.json({ membership });
});

export const listMemberships = asyncHandler(async (req, res) => {
  const memberships = await projectService.listMemberships(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ memberships });
});

/* ------------------------------------------------------------------ */
/* Tasks                                                              */
/* ------------------------------------------------------------------ */

export const createProjectTask = asyncHandler(async (req, res) => {
  const { project, title } = req.body;
  if (!project || !title) {
    throw badRequest("project and title are required.");
  }
  const task = await projectService.createProjectTask(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ task });
});

export const updateProjectTask = asyncHandler(async (req, res) => {
  const task = await projectService.updateProjectTask(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ task });
});

/* ------------------------------------------------------------------ */
/* Submissions                                                        */
/* ------------------------------------------------------------------ */

export const submitWork = asyncHandler(async (req, res) => {
  const { task, repositoryUrl } = req.body;
  if (!task) {
    throw badRequest("task is required.");
  }
  const submission = await projectService.submitWork(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ submission });
});

export const reviewSubmission = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status || !["APPROVED", "REVISION_REQUESTED"].includes(status)) {
    throw badRequest("Valid status (APPROVED or REVISION_REQUESTED) is required.");
  }
  const submission = await projectService.reviewSubmission(req.params.id, {
    status,
    notes: req.body.notes,
  }, { requestingUser: req.user });
  res.json({ submission });
});

export const listSubmissions = asyncHandler(async (req, res) => {
  const submissions = await projectService.listSubmissions(
    { projectId: req.query.projectId, taskId: req.query.taskId },
    { requestingUser: req.user },
  );
  res.json({ submissions });
});

/* ------------------------------------------------------------------ */
/* Evaluations                                                        */
/* ------------------------------------------------------------------ */

export const evaluateProjectStudent = asyncHandler(async (req, res) => {
  const { project, student, technicalExecution, deliverableCompleteness, teamCollaboration, score, milestoneNumber } = req.body;
  if (!project || !student || technicalExecution === undefined || deliverableCompleteness === undefined || teamCollaboration === undefined || score === undefined) {
    throw badRequest("project, student, technicalExecution, deliverableCompleteness, teamCollaboration, and score are required.");
  }
  const evaluation = await projectService.evaluateProjectStudent(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ evaluation });
});

/* ------------------------------------------------------------------ */
/* Project completion                                                 */
/* ------------------------------------------------------------------ */

export const completeProject = asyncHandler(async (req, res) => {
  const project = await projectService.completeProject(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ project });
});

