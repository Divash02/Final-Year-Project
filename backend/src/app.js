import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdministrationRoutes } from "./routes/administration.js";
import { registerAcademicsRoutes } from "./routes/academics.js";
import { registerAcademicCalendarRoutes } from "./routes/calendar.js";
import { registerLearningMaterialRoutes } from "./routes/materials.js";
import { registerAssignmentRoutes } from "./routes/assignments.js";
import { registerLmsRoutes } from "./routes/lms.js";
import { registerQuizRoutes } from "./routes/quizzes.js";
import { registerTimetableRoutes } from "./routes/timetable.js";
import { registerMyTimetableRoutes } from "./routes/myTimetable.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerNoticesRoutes } from "./routes/notices.js";
import { registerCommunicationRoutes } from "./routes/communication.js";
import { registerWorkflowRoutes } from "./routes/workflow.js";
import { registerReportingRoutes } from "./routes/reporting.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerDepartmentalRoutes } from "./routes/departmental.js";
import { registerAttendanceRoutes } from "./routes/attendance.js";
import { registerFinanceRoutes } from "./routes/finance.js";
import { registerAdmissionsRoutes } from "./routes/admissions.js";
import { registerExaminationRoutes } from "./routes/examinations.js";
import { registerExamSeatingRoutes } from "./routes/examSeating.js";
import { registerCodingRoutes } from "./routes/coding.js";
import { registerAssessmentRoutes } from "./routes/assessments.js";
import { registerAIRoutes } from "./routes/ai.js";
import { toErrorResponse } from "./utils/apiError.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../uploads");
const avatarDir = path.join(uploadsDir, "avatars");

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  // Only profile photos are delivered as ordinary static assets: they are
  // non-sensitive institutional directory images. Every other stored file —
  // calendar attachments, learning materials, assignment submissions,
  // documents — is served through the authenticated, entitlement-checked
  // `/api/files/:id` route instead.
  app.use(
    "/uploads/avatars",
    express.static(avatarDir, {
      index: false,
      dotfiles: "deny",
      maxAge: "1h",
      fallthrough: false,
      setHeaders: (res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", "inline");
      },
    }),
  );

  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerAdministrationRoutes(app);
  registerAcademicsRoutes(app);
  registerAcademicCalendarRoutes(app);
  registerLearningMaterialRoutes(app);
  registerAssignmentRoutes(app);
  // The weekly planner and the quiz runtime share one authorisation service, so
  // they are registered together and before the reporting reads that summarise
  // their records.
  registerLmsRoutes(app);
  registerQuizRoutes(app);
  registerTimetableRoutes(app);
  registerMyTimetableRoutes(app);
  registerFileRoutes(app);
  registerNoticesRoutes(app);
  registerCommunicationRoutes(app);
  registerWorkflowRoutes(app);
  registerReportingRoutes(app);
  registerFinanceRoutes(app);
  registerAdmissionsRoutes(app);
  registerAssessmentRoutes(app);
  // Seating routes register before the examination routes so the
  // literal `/api/exams/seating...` and `/api/exams/venues` paths
  // are never captured by the examination module's `/api/exams/:id`.
  registerExamSeatingRoutes(app);
  registerExaminationRoutes(app);
  registerProfileRoutes(app);
  registerDepartmentalRoutes(app);
  registerAttendanceRoutes(app);
  registerCodingRoutes(app);
  registerAIRoutes(app);

  // Unknown API routes answer in the same structured shape as every other
  // error, so the frontend never has to special-case a bare HTML 404.
  app.use("/api", (req, res) => {
    res.status(404).json({
      error: "This CollegeOS endpoint does not exist.",
      code: "NOT_FOUND",
    });
  });

  // Central error boundary. Known errors keep their safe message; anything
  // unexpected is logged in full here and reported as an opaque reference, so
  // a stack trace, driver message or file path never reaches the browser.
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const { status, body } = toErrorResponse(error, {
      logContext: `${req.method} ${req.originalUrl}`,
    });
    if (status >= 500) {
      console.error(`${req.method} ${req.originalUrl} failed:`, error);
    }
    res.status(status).json(body);
  });

  return app;
}
