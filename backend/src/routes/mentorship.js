import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  listAssignmentsController,
  getAssignmentController,
  createAssignmentController,
  updateAssignmentController,
  listSessionsController,
  createSessionController,
  updateSessionController,
  listObservationsController,
  createObservationController,
  getMentoringDashboardController,
} from "../controllers/mentorship/mentorshipController.js";

export function registerMentorshipRoutes(app) {
  /* ========================================================================
   * Faculty Mentoring - Assignments
   * ======================================================================== */

  app.get(
    "/api/mentorship/assignments",
    requireAuth,
    requirePermission("mentorship.view"),
    listAssignmentsController
  );

  app.get(
    "/api/mentorship/assignments/:id",
    requireAuth,
    requirePermission("mentorship.view"),
    getAssignmentController
  );

  app.post(
    "/api/mentorship/assignments",
    requireAuth,
    requirePermission("mentorship.manage"),
    createAssignmentController
  );

  app.patch(
    "/api/mentorship/assignments/:id",
    requireAuth,
    requirePermission("mentorship.manage"),
    updateAssignmentController
  );

  /* ========================================================================
   * Faculty Mentoring - Sessions
   * ======================================================================== */

  app.get(
    "/api/mentorship/sessions",
    requireAuth,
    requirePermission("mentorship.view"),
    listSessionsController
  );

  app.post(
    "/api/mentorship/sessions",
    requireAuth,
    requirePermission("mentorship.manage"),
    createSessionController
  );

  app.patch(
    "/api/mentorship/sessions/:id",
    requireAuth,
    requirePermission("mentorship.manage"),
    updateSessionController
  );

  /* ========================================================================
   * Faculty Mentoring - Observations
   * ======================================================================== */

  app.get(
    "/api/mentorship/observations",
    requireAuth,
    requirePermission("mentorship.view"),
    listObservationsController
  );

  app.post(
    "/api/mentorship/observations",
    requireAuth,
    requirePermission("mentorship.manage"),
    createObservationController
  );

  /* ========================================================================
   * Faculty Mentoring - Dashboard
   * ======================================================================== */

  app.get(
    "/api/mentorship/dashboard",
    requireAuth,
    requirePermission("mentorship.view"),
    getMentoringDashboardController
  );
}
