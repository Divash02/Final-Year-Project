import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerRoutes } from "./routes/index.js";
import { requestContext } from "./middleware/requestContext.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { authRateLimiter } from "./middleware/rateLimit.js";
import { toErrorResponse } from "./utils/apiError.js";
import { logger } from "./utils/logger.js";
import { env } from "./config/environment.js";
import { hashToken } from "./utils/token.js";
import { Session } from "./models/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../uploads");
const signatureDir = path.join(uploadsDir, "signatures");

/**
 * Application bootstrap.
 *
 * Responsibilities are intentionally narrow: express construction, global
 * middleware, security policy, one call to the centralized route registry and
 * the central error boundary. Domain business logic lives in `routes/`,
 * `controllers/`, `services/` and `models/`.
 */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow non-browser requests (curl, Postman, etc.) where origin is undefined
      if (!origin) return callback(null, true);
      if (env.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS policy"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token", "X-CSRF-Token", "X-Request-Id"],
  };

  app.use(cors(corsOptions));
  app.use(securityHeaders);
  app.use(requestContext);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // Only profile photos and signatures are delivered as ordinary static assets:
  // they are non-sensitive institutional directory images. Every other stored
  // file is served through the authenticated, entitlement-checked `/api/files/:id`
  // route instead.
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

  // Unauthenticated, mutating auth endpoints are the credential-guessing
  // surface: rate-limit them by client before any handler runs.
  app.use(
    ["/api/auth/login", "/api/auth/forgot-password", "/api/auth/reset-password"],
    authRateLimiter,
  );

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

  registerRoutes(app);

  // Unknown API routes answer in the same structured shape as every other
  // error, so the frontend never has to special-case a bare HTML 404.
  app.use("/api", (req, res) => {
    res.status(404).json({
      error: "This CollegeOS endpoint does not exist.",
      code: "NOT_FOUND",
      requestId: req.requestId,
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
      requestId: req.requestId,
    });
    if (status >= 500) {
      logger.error("unhandled_error", {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        message: error?.message,
        stack: error?.stack,
      });
    }
    res.status(status).json(body);
  });

  return app;
}

export default createApp;