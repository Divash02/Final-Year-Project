import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  listRecommendationsController,
  getRecommendationController,
  createRecommendationController,
  submitRecommendationController,
  reviewRecommendationController,
  listAssessmentsController,
  getAssessmentController,
  recordAssessmentDecisionController,
  getReadinessDashboardController,
} from "../controllers/readinessAssessment/readinessAssessmentController.js";

export function registerReadinessAssessmentRoutes(app) {
  /* ========================================================================
   * Career Readiness - Recommendations
   * ======================================================================== */

  app.get(
    "/api/readiness-assessments/recommendations",
    requireAuth,
    requirePermission("readiness.view"),
    listRecommendationsController
  );

  app.get(
    "/api/readiness-assessments/recommendations/:id",
    requireAuth,
    requirePermission("readiness.view"),
    getRecommendationController
  );

  app.post(
    "/api/readiness-assessments/recommendations",
    requireAuth,
    requirePermission("mentorship.recommend_readiness"),
    createRecommendationController
  );

  app.post(
    "/api/readiness-assessments/recommendations/:id/submit",
    requireAuth,
    requirePermission("mentorship.recommend_readiness"),
    submitRecommendationController
  );

  app.patch(
    "/api/readiness-assessments/recommendations/:id/review",
    requireAuth,
    requirePermission("readiness.manage"),
    reviewRecommendationController
  );

  /* ========================================================================
   * Career Readiness - Assessments
   * ======================================================================== */

  app.get(
    "/api/readiness-assessments",
    requireAuth,
    requirePermission("readiness.view"),
    listAssessmentsController
  );

  app.get(
    "/api/readiness-assessments/:id",
    requireAuth,
    requirePermission("readiness.view"),
    getAssessmentController
  );

  app.patch(
    "/api/readiness-assessments/:id/decision",
    requireAuth,
    requirePermission("readiness.manage"),
    recordAssessmentDecisionController
  );

  /* ========================================================================
   * Career Readiness - Dashboard
   * ======================================================================== */

  app.get(
    "/api/readiness-assessments/dashboard",
    requireAuth,
    requirePermission("readiness.manage"),
    getReadinessDashboardController
  );
}
