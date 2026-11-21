import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  badRequest,
  notFound,
} from "../../utils/apiError.js";
import * as evaluationService from "../../services/internship/evaluationService.js";

/**
 * Domain B: Evaluations, Completion, Credentials Controllers
 * Thin HTTP layer; all business logic lives in evaluationService.
 */

/* ------------------------------------------------------------------ */
/* Evaluations                                                        */
/* ------------------------------------------------------------------ */

export const createEvaluation = asyncHandler(async (req, res) => {
  const { placement, student, technicalSkills, professionalism, communication, problemSolving, teamwork, initiative, overallRating, evaluatorType, evaluationType, isFinal } = req.body;
  if (!placement || !student || technicalSkills === undefined || professionalism === undefined || communication === undefined || problemSolving === undefined || teamwork === undefined || initiative === undefined || overallRating === undefined) {
    throw badRequest("placement, student, and all rubric scores (1-10) are required.");
  }
  const evaluation = await evaluationService.createEvaluation(req.body, {
    requestingUser: req.user,
  });
  res.status(201).json({ evaluation });
});

export const listEvaluations = asyncHandler(async (req, res) => {
  const evaluations = await evaluationService.listEvaluations(
    {
      placementId: req.query.placementId,
      studentId: req.query.studentId,
      evaluatorType: req.query.evaluatorType,
      evaluationType: req.query.evaluationType,
    },
    { requestingUser: req.user },
  );
  res.json({ evaluations });
});

/* ------------------------------------------------------------------ */
/* Completion verification                                            */
/* ------------------------------------------------------------------ */

export const verifyCompletionRequirements = asyncHandler(async (req, res) => {
  const result = await evaluationService.verifyCompletionRequirements(req.params.id);
  res.json(result);
});

/* ------------------------------------------------------------------ */
/* Credentials                                                        */
/* ------------------------------------------------------------------ */

export const issueCredential = asyncHandler(async (req, res) => {
  const credential = await evaluationService.issueCredential(req.params.id, {
    requestingUser: req.user,
  });
  res.status(201).json({ credential });
});

export const revokeCredential = asyncHandler(async (req, res) => {
  const credential = await evaluationService.revokeCredential(req.params.id, {
    requestingUser: req.user,
  });
  res.json({ credential });
});

export const verifyCredentialByHash = asyncHandler(async (req, res) => {
  const credential = await evaluationService.verifyCredentialByHash(req.params.hash);
  if (!credential) {
    throw notFound("Credential not found or invalid verification hash.");
  }
  res.json({ credential });
});

export const listCredentials = asyncHandler(async (req, res) => {
  const result = await evaluationService.listCredentials(
    {
      studentId: req.query.studentId,
      status: req.query.status,
    },
    { requestingUser: req.user, page: req.query.page, limit: req.query.limit },
  );
  res.json(result);
});

