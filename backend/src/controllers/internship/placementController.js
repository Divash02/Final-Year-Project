import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  badRequest,
  notFound,
} from "../../utils/apiError.js";
import * as placementService from "../../services/internship/placementService.js";

/**
 * Domain B: Placement, Supervisor, Onboarding Controllers
 * Thin HTTP layer; all business logic lives in placementService.
 */

export const createPlacement = asyncHandler(async (req, res) => {
  const { applicationId, offerId, academicSupervisorId, startDate, endDate } = req.body;
  if (!applicationId || !offerId || !academicSupervisorId || !startDate || !endDate) {
    throw badRequest("applicationId, offerId, academicSupervisorId, startDate, and endDate are required.");
  }
  const placement = await placementService.createPlacement(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ placement });
});

export const confirmPlacement = asyncHandler(async (req, res) => {
  const placement = await placementService.confirmPlacement(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ placement });
});

export const updatePlacement = asyncHandler(async (req, res) => {
  const placement = await placementService.updatePlacement(req.params.id, req.body, {
    requestingUser: req.user,
  });
  res.json({ placement });
});

export const managePlacementLeave = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status || !["ON_LEAVE", "ACTIVE"].includes(status)) {
    throw badRequest("Valid status (ON_LEAVE or ACTIVE) is required.");
  }
  const placement = await placementService.managePlacementLeave(req.params.id, { status }, {
    requestingUser: req.user,
  });
  res.json({ placement });
});

export const terminatePlacement = asyncHandler(async (req, res) => {
  const placement = await placementService.terminatePlacement(req.params.id, {
    reason: req.body.reason,
  }, { requestingUser: req.user });
  res.json({ placement });
});

export const extendPlacement = asyncHandler(async (req, res) => {
  const placement = await placementService.extendPlacement(req.params.id, {
    endDate: req.body.endDate,
  }, { requestingUser: req.user });
  res.json({ placement });
});

export const completePlacement = asyncHandler(async (req, res) => {
  const placement = await placementService.completePlacement(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ placement });
});

export const listPlacements = asyncHandler(async (req, res) => {
  const result = await placementService.listPlacements(
    {
      status: req.query.status,
      employer: req.query.employer,
      student: req.query.student,
    },
    { requestingUser: req.user, page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

export const getPlacement = asyncHandler(async (req, res) => {
  const placement = await placementService.getPlacement(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ placement });
});

/* ------------------------------------------------------------------ */
/* Supervisors                                                        */
/* ------------------------------------------------------------------ */

export const createSupervisor = asyncHandler(async (req, res) => {
  const { company, firstName, lastName } = req.body;
  if (!company || !firstName || !lastName) {
    throw badRequest("Company, firstName, and lastName are required.");
  }
  const supervisor = await placementService.createSupervisor(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ supervisor });
});

export const assignIndustrySupervisor = asyncHandler(async (req, res) => {
  const { supervisorId } = req.body;
  if (!supervisorId) {
    throw badRequest("supervisorId is required.");
  }
  const placement = await placementService.assignIndustrySupervisor(req.params.id, supervisorId, {
    requestingUser: req.user,
  });
  res.json({ placement });
});

