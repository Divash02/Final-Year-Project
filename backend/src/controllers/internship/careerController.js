import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  badRequest,
  notFound,
} from "../../utils/apiError.js";
import * as careerService from "../../services/internship/careerService.js";

/**
 * Career Explorer Controllers
 * Thin HTTP layer; all business logic lives in careerService.
 */

/* ------------------------------------------------------------------ */
/* Career Categories                                                  */
/* ------------------------------------------------------------------ */

export const createCareerCategory = asyncHandler(async (req, res) => {
  const { code, name, description, icon, color, displayOrder, isActive } = req.body;
  if (!code || !name) {
    throw badRequest("code and name are required.");
  }
  const category = await careerService.createCareerCategory(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ category });
});

export const updateCareerCategory = asyncHandler(async (req, res) => {
  const category = await careerService.updateCareerCategory(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ category });
});

export const listCareerCategories = asyncHandler(async (req, res) => {
  const result = await careerService.listCareerCategories(
    { isActive: req.query.isActive },
    { page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

export const getCareerCategory = asyncHandler(async (req, res) => {
  const category = await careerService.getCareerCategory(req.params.id);
  res.json({ category });
});

/* ------------------------------------------------------------------ */
/* Career Roles                                                       */
/* ------------------------------------------------------------------ */

export const createCareerRole = asyncHandler(async (req, res) => {
  const { code, name, category, description } = req.body;
  if (!code || !name || !category || !description) {
    throw badRequest("code, name, category, and description are required.");
  }
  const role = await careerService.createCareerRole(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ role });
});

export const updateCareerRole = asyncHandler(async (req, res) => {
  const role = await careerService.updateCareerRole(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ role });
});

export const listCareerRoles = asyncHandler(async (req, res) => {
  const result = await careerService.listCareerRoles(
    {
      category: req.query.category,
      difficulty: req.query.difficulty,
      isActive: req.query.isActive,
      isFeatured: req.query.isFeatured,
      search: req.query.search,
    },
    { page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

export const getCareerRole = asyncHandler(async (req, res) => {
  const role = await careerService.getCareerRole(req.params.id);
  res.json({ role });
});

export const compareCareerRoles = asyncHandler(async (req, res) => {
  const { roleIds } = req.body;
  if (!roleIds || !Array.isArray(roleIds) || roleIds.length < 2 || roleIds.length > 5) {
    throw badRequest("roleIds array with 2-5 role IDs is required.");
  }
  const roles = await careerService.compareCareerRoles(roleIds, { requestingUser: req.user });
  res.json({ roles });
});

/* ------------------------------------------------------------------ */
/* Student Career Interests                                           */
/* ------------------------------------------------------------------ */

export const addCareerInterest = asyncHandler(async (req, res) => {
  const { careerRole, interestLevel, notes } = req.body;
  if (!careerRole) {
    throw badRequest("careerRole is required.");
  }
  const interest = await careerService.addCareerInterest(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ interest });
});

export const updateCareerInterest = asyncHandler(async (req, res) => {
  const interest = await careerService.updateCareerInterest(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ interest });
});

export const removeCareerInterest = asyncHandler(async (req, res) => {
  await careerService.removeCareerInterest(req.params.id, { requestingUser: req.user });
  res.json({ success: true });
});

export const listCareerInterests = asyncHandler(async (req, res) => {
  const interests = await careerService.listCareerInterests({ requestingUser: req.user });
  res.json({ interests });
});

/* ------------------------------------------------------------------ */
/* Career Exploration Activity                                        */
/* ------------------------------------------------------------------ */

export const recordExplorationActivity = asyncHandler(async (req, res) => {
  const { careerRole, activityType, metadata } = req.body;
  if (!careerRole || !activityType) {
    throw badRequest("careerRole and activityType are required.");
  }
  const activity = await careerService.recordExplorationActivity(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ activity });
});

export const getExplorationHistory = asyncHandler(async (req, res) => {
  const history = await careerService.getExplorationHistory({
    requestingUser: req.user,
    careerRoleId: req.query.careerRole,
    limit: req.query.limit,
  });
  res.json({ history });
});

/* ------------------------------------------------------------------ */
/* Career Explorer Dashboard                                          */
/* ------------------------------------------------------------------ */

export const getCareerExplorerDashboard = asyncHandler(async (req, res) => {
  const dashboard = await careerService.getCareerExplorerDashboard({ requestingUser: req.user });
  res.json({ dashboard });
});