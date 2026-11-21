import {
  listRecommendations,
  getRecommendation,
  createRecommendation,
  submitRecommendation,
  reviewRecommendation,
  listAssessments,
  getAssessment,
  recordAssessmentDecision,
  getReadinessDashboard,
} from "../../services/readinessAssessment/readinessAssessmentService.js";

export async function listRecommendationsController(req, res) {
  const result = await listRecommendations({ user: req.user, query: req.query });
  res.json(result);
}

export async function getRecommendationController(req, res) {
  const result = await getRecommendation({ user: req.user, recommendationId: req.params.id });
  res.json(result);
}

export async function createRecommendationController(req, res) {
  const result = await createRecommendation({ user: req.user, body: req.body });
  res.status(201).json(result);
}

export async function submitRecommendationController(req, res) {
  const result = await submitRecommendation({
    user: req.user,
    recommendationId: req.params.id,
  });
  res.json(result);
}

export async function reviewRecommendationController(req, res) {
  const result = await reviewRecommendation({
    user: req.user,
    recommendationId: req.params.id,
    body: req.body,
  });
  res.json(result);
}

export async function listAssessmentsController(req, res) {
  const result = await listAssessments({ user: req.user, query: req.query });
  res.json(result);
}

export async function getAssessmentController(req, res) {
  const result = await getAssessment({ user: req.user, assessmentId: req.params.id });
  res.json(result);
}

export async function recordAssessmentDecisionController(req, res) {
  const result = await recordAssessmentDecision({
    user: req.user,
    assessmentId: req.params.id,
    body: req.body,
  });
  res.json(result);
}

export async function getReadinessDashboardController(req, res) {
  const result = await getReadinessDashboard({ user: req.user, query: req.query });
  res.json(result);
}
