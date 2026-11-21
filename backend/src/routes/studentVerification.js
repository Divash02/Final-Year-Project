import { requireAuth, requirePermission } from "../middleware/auth.js";
import {
  listVerificationsController,
  getVerificationController,
  submitVerificationController,
  reviewVerificationController,
  getVerificationHistoryController,
  getVerificationDashboardController,
} from "../controllers/studentVerification/studentVerificationController.js";

export function registerStudentVerificationRoutes(app) {
  /* ========================================================================
   * Student Identity Verification
   * ======================================================================== */

  app.get(
    "/api/student-verification",
    requireAuth,
    requirePermission("student.verification.view"),
    listVerificationsController
  );

  app.get(
    "/api/student-verification/:id",
    requireAuth,
    requirePermission("student.verification.view"),
    getVerificationController
  );

  app.post(
    "/api/student-verification",
    requireAuth,
    requirePermission("student.verification.view"),
    submitVerificationController
  );

  app.patch(
    "/api/student-verification/:id/review",
    requireAuth,
    requirePermission("student.verification.manage"),
    reviewVerificationController
  );

  app.get(
    "/api/student-verification/:id/history",
    requireAuth,
    requirePermission("student.verification.view"),
    getVerificationHistoryController
  );

  app.get(
    "/api/student-verification/dashboard",
    requireAuth,
    requirePermission("student.verification.manage"),
    getVerificationDashboardController
  );
}
