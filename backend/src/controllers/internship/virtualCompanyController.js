import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  badRequest,
  notFound,
} from "../../utils/apiError.js";
import * as virtualCompanyService from "../../services/internship/virtualCompanyService.js";

/**
 * Virtual Company Engine Controllers
 */

export const generateVirtualCompanyTemplate = asyncHandler(async (req, res) => {
  const template = await virtualCompanyService.generateVirtualCompanyTemplate(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ template });
});

export const createVirtualCompanyFromTemplate = asyncHandler(async (req, res) => {
  const { templateId, simulationId } = req.body;
  if (!templateId || !simulationId) {
    throw badRequest("templateId and simulationId are required.");
  }
  const company = await virtualCompanyService.createVirtualCompanyFromTemplate(templateId, simulationId, {
    requestingUser: req.user,
  });
  res.status(201).json({ company });
});

export const listVirtualCompanies = asyncHandler(async (req, res) => {
  const result = await virtualCompanyService.listVirtualCompanies(
    { lifecycleStatus: req.query.lifecycleStatus, simulation: req.query.simulation },
    { page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

export const getVirtualCompany = asyncHandler(async (req, res) => {
  const company = await virtualCompanyService.getVirtualCompany(req.params.id);
  res.json({ company });
});

/* ------------------------------------------------------------------ */
/* Specialist Workspace Configurations                                */
/* ------------------------------------------------------------------ */

export const createSpecialistWorkspaceConfig = asyncHandler(async (req, res) => {
  const { careerPath } = req.body;
  if (!careerPath) {
    throw badRequest("careerPath is required.");
  }
  const config = await virtualCompanyService.createSpecialistWorkspaceConfig(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ config });
});

export const updateSpecialistWorkspaceConfig = asyncHandler(async (req, res) => {
  const { careerPath } = req.params;
  if (!careerPath) {
    throw badRequest("careerPath parameter is required.");
  }
  const config = await virtualCompanyService.updateSpecialistWorkspaceConfig(careerPath, req.body, {
    requestingUser: req.user,
  });
  res.json({ config });
});

export const listSpecialistWorkspaceConfigs = asyncHandler(async (req, res) => {
  const configs = await virtualCompanyService.listSpecialistWorkspaceConfigs({
    careerPath: req.query.careerPath,
  });
  res.json({ configs });
});

export const getSpecialistWorkspaceConfig = asyncHandler(async (req, res) => {
  const { careerPath } = req.params;
  if (!careerPath) {
    throw badRequest("careerPath parameter is required.");
  }
  const config = await virtualCompanyService.getSpecialistWorkspaceConfig(careerPath);
  res.json({ config });
});

export const seedDefaultWorkspaceConfigs = asyncHandler(async (req, res) => {
  const configs = await virtualCompanyService.seedDefaultWorkspaceConfigs({ requestingUser: req.user });
  res.json({ configs, count: configs.length });
});