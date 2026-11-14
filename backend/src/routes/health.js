import { getConnectionHealth } from "../config/database.js";

/**
 * Liveness and readiness probe.
 *
 * `/api/health` reports process liveness plus the MongoDB connection state so
 * orchestration and monitoring can distinguish "process up" from "ready to
 * serve". It never exposes credentials, URIs or record data.
 */
export function registerHealthRoutes(app) {
  app.get("/api/health", (_, res) => {
    const database = getConnectionHealth();
    res.status(database.ok ? 200 : 503).json({
      ok: database.ok,
      service: "CollegeOS API",
      time: new Date().toISOString(),
      database,
    });
  });
}