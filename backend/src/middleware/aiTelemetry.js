/**
 * AI system health telemetry middleware.
 *
 * Captures real API latency and status for every request that passes through
 * the AI router, feeding the System Health diagnostics service. Kept as a
 * dedicated middleware so the AI route file only declares endpoints.
 */

import { recordApiMetric } from "../services/ai/systemHealthService.js";

export function aiTelemetryMiddleware(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    recordApiMetric({
      method: req.method,
      path: req.baseUrl + req.path,
      status: res.statusCode,
      durationMs,
    });
  });
  next();
}
