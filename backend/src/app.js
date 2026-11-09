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
import { registerHRRoutes } from "./routes/hr.js";
import { registerLibraryRoutes } from "./routes/library.js";
import { registerFolderRoutes } from "./routes/folders.js";
import { registerDocumentRoutes } from "./routes/documents.js";
import { registerFacilitiesRoutes } from "./routes/facilities.js";
import { registerConnectRoutes } from "./routes/connect.js";
import { toErrorResponse } from "./utils/apiError.js";
import { hashToken } from "./db.js";
import { Session } from "./models/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../uploads");
  const signatureDir = path.join(uploadsDir, "signatures");

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow non-browser requests (curl, Postman, etc.) where origin is undefined
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS policy"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token", "X-CSRF-Token"],
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  // Only profile photos are delivered as ordinary static assets: they are
  // non-sensitive institutional directory images. Every other stored file —
  // calendar attachments, learning materials, assignment submissions,
  // documents — is served through the authenticated, entitlement-checked
  // `/api/files/:id` route instead.
  app.use(
    "/uploads/signatures",
    express.static(signatureDir, {
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
  app.use(
    "/uploads/avatars",
    express.static(path.join(uploadsDir, "avatars"), {
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

  // CSRF protection for state-changing, authenticated API requests. CollegeOS
  // bears its session token in localStorage (not a cookie), so a cross-site
  // attacker cannot attach an Authorization header; this middleware adds a
  // second check: a per-session csrfToken issued at login and presented as the
  // X-CSRF-Token header. Unauthenticated mutating endpoints (login, forgot /
  // reset password) are rate-limited instead and are exempt here.
  const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const CSRF_EXEMPT_PATHS = [
    /^\/api\/auth\/login\/?$/,
    /^\/api\/auth\/forgot-password\/?$/,
    /^\/api\/auth\/reset-password\/?$/,
  ];
  app.use(async (req, res, next) => {
    try {
      if (!MUTATING_METHODS.has(req.method)) return next();
      if (CSRF_EXEMPT_PATHS.some((pattern) => pattern.test(req.path))) return next();
      const auth = String(req.headers.authorization || "");
      if (!auth.startsWith("Bearer ")) return next();
      const token = auth.slice("Bearer ".length).trim();
      if (!token) return next();
      const session = await Session.findOne({ tokenHash: hashToken(token) }).lean();
      if (!session) return next();
      const expected = String(session.csrfToken || "");
      const provided = String(req.headers["x-csrf-token"] || "");
      if (!expected || !provided || expected !== provided) {
        return res.status(403).json({ error: "CSRF token required.", code: "CSRF_REQUIRED" });
      }
      return next();
    } catch {
      return next();
    }
  });

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
  registerHRRoutes(app);
  registerLibraryRoutes(app);
  registerFolderRoutes(app);
  registerDocumentRoutes(app);
  registerFacilitiesRoutes(app);
  registerConnectRoutes(app);

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
