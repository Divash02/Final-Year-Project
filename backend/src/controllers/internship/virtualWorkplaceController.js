import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  badRequest,
  notFound,
} from "../../utils/apiError.js";
import * as vwService from "../../services/internship/virtualWorkplaceService.js";

/**
 * Domain D: Virtual Workplace Simulations Controllers
 * Thin HTTP layer; all business logic lives in virtualWorkplaceService.
 */

/* ------------------------------------------------------------------ */
/* Company Templates                                                  */
/* ------------------------------------------------------------------ */

export const createCompanyTemplate = asyncHandler(async (req, res) => {
  const { templateCode, name, sector, description } = req.body;
  if (!templateCode || !name || !sector || !description) {
    throw badRequest("templateCode, name, sector, and description are required.");
  }
  const template = await vwService.createCompanyTemplate(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ template });
});

export const updateCompanyTemplate = asyncHandler(async (req, res) => {
  const template = await vwService.updateCompanyTemplate(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ template });
});

export const listCompanyTemplates = asyncHandler(async (req, res) => {
  const result = await vwService.listCompanyTemplates(
    { sector: req.query.sector, isPublished: req.query.isPublished },
    { page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

/* ------------------------------------------------------------------ */
/* Simulations                                                        */
/* ------------------------------------------------------------------ */

export const createSimulation = asyncHandler(async (req, res) => {
  const { template, simulationCode, companyName, academicYear, semester, startDate, endDate } = req.body;
  if (!template || !simulationCode || !academicYear || !semester || !startDate || !endDate) {
    throw badRequest("template, simulationCode, academicYear, semester, startDate, and endDate are required.");
  }
  const simulation = await vwService.createSimulation(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ simulation });
});

export const configureSimulation = asyncHandler(async (req, res) => {
  const simulation = await vwService.configureSimulation(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ simulation });
});

export const listSimulations = asyncHandler(async (req, res) => {
  const result = await vwService.listSimulations(
    { status: req.query.status, academicYear: req.query.academicYear, semester: req.query.semester },
    { requestingUser: req.user, page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

/* ------------------------------------------------------------------ */
/* Simulation Applications                                            */
/* ------------------------------------------------------------------ */

export const applyToSimulation = asyncHandler(async (req, res) => {
  const { targetCareerPath } = req.body;
  if (!targetCareerPath) {
    throw badRequest("targetCareerPath is required.");
  }
  const application = await vwService.applyToSimulation(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ application });
});

export const reviewSimulationApplication = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status || !["ACCEPTED", "REJECTED"].includes(status)) {
    throw badRequest("Valid status (ACCEPTED or REJECTED) is required.");
  }
  const application = await vwService.reviewSimulationApplication(req.params.id, { status }, {
    requestingUser: req.user,
  });
  res.json({ application });
});

/* ------------------------------------------------------------------ */
/* Memberships                                                        */
/* ------------------------------------------------------------------ */

export const createMembership = asyncHandler(async (req, res) => {
  const membership = await vwService.createMembership(req.params.id, {
    careerPath: req.body.careerPath,
    teamId: req.body.teamId,
  }, { requestingUser: req.user });
  res.status(201).json({ membership });
});

export const listMemberships = asyncHandler(async (req, res) => {
  const memberships = await vwService.listMemberships(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ memberships });
});

/* ------------------------------------------------------------------ */
/* Teams                                                              */
/* ------------------------------------------------------------------ */

export const createTeam = asyncHandler(async (req, res) => {
  const { teamName } = req.body;
  if (!teamName) {
    throw badRequest("teamName is required.");
  }
  const team = await vwService.createTeam(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ team });
});

/* ------------------------------------------------------------------ */
/* Projects (simulation)                                              */
/* ------------------------------------------------------------------ */

export const createSimulationProject = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) {
    throw badRequest("name is required.");
  }
  const project = await vwService.createSimulationProject(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ project });
});

/* ------------------------------------------------------------------ */
/* Tasks (simulation)                                                 */
/* ------------------------------------------------------------------ */

export const createSimulationTask = asyncHandler(async (req, res) => {
  const { ticketNumber, title, careerPath } = req.body;
  if (!ticketNumber || !title || !careerPath) {
    throw badRequest("ticketNumber, title, and careerPath are required.");
  }
  const task = await vwService.createSimulationTask(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ task });
});

export const updateSimulationTask = asyncHandler(async (req, res) => {
  const task = await vwService.updateSimulationTask(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ task });
});

/* ------------------------------------------------------------------ */
/* Submissions (simulation)                                           */
/* ------------------------------------------------------------------ */

export const submitSimulationWork = asyncHandler(async (req, res) => {
  const submission = await vwService.submitSimulationWork(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ submission });
});

export const reviewSimulationSubmission = asyncHandler(async (req, res) => {
  const submission = await vwService.reviewSimulationSubmission(req.params.id, {
    feedback: req.body.feedback,
    score: req.body.score,
    reviewStatus: req.body.reviewStatus,
  }, { requestingUser: req.user });
  res.json({ submission });
});

/* ------------------------------------------------------------------ */
/* Workplace Events                                                   */
/* ------------------------------------------------------------------ */

export const createEvent = asyncHandler(async (req, res) => {
  const { eventType, severity, title } = req.body;
  if (!eventType || !severity || !title) {
    throw badRequest("eventType, severity, and title are required.");
  }
  const event = await vwService.createEvent(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ event });
});

/* ------------------------------------------------------------------ */
/* Competency Evidence                                                */
/* ------------------------------------------------------------------ */

export const createCompetencyEvidence = asyncHandler(async (req, res) => {
  const { competency, sourceDomain, sourceReferenceId } = req.body;
  if (!competency || !sourceDomain || !sourceReferenceId) {
    throw badRequest("competency, sourceDomain, and sourceReferenceId are required.");
  }
  const evidence = await vwService.createCompetencyEvidence(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ evidence });
});

export const verifyCompetencyEvidence = asyncHandler(async (req, res) => {
  const evidence = await vwService.verifyCompetencyEvidence(req.params.id, {
    scoreLevel: req.body.scoreLevel,
  }, { requestingUser: req.user });
  res.json({ evidence });
});

/* ------------------------------------------------------------------ */
/* Professional Portfolio                                             */
/* ------------------------------------------------------------------ */

export const createOrUpdatePortfolio = asyncHandler(async (req, res) => {
  const portfolio = await vwService.createOrUpdatePortfolio(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ portfolio });
});

export const getPortfolio = asyncHandler(async (req, res) => {
  const portfolio = await vwService.getPortfolio(req.params.slug, {
    requestingUser: req.user,
  });
  res.json({ portfolio });
});

export const listPortfolios = asyncHandler(async (req, res) => {
  const result = await vwService.listPortfolios({
    requestingUser: req.user,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json(result);
});

