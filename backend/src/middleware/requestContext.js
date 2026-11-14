import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.js";

/**
 * Request correlation and timing.
 *
 * Every request receives a correlation id (honouring an inbound
 * `X-Request-Id` when present) that is echoed to the client and attached to
 * every log line and error response for that request. This makes a failure
 * reported by a user traceable to a single server log entry without exposing
 * internals.
 */

const REQUEST_ID_HEADER = "x-request-id";

function readInboundRequestId(req) {
  const inbound = req.get(REQUEST_ID_HEADER);
  if (!inbound) return null;
  const trimmed = String(inbound).trim();
  // Only accept a conservative, printable id so a client cannot inject control
  // characters into logs.
  return /^[A-Za-z0-9._:-]{1,64}$/.test(trimmed) ? trimmed : null;
}

export function requestContext(req, res, next) {
  const requestId = readInboundRequestId(req) || `req_${randomUUID()}`;
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startedAt = process.hrtime.bigint();
  const requestLogger = logger.child({ requestId });

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // Health probes and socket handshakes are high-volume and carry no
    // diagnostic value; everything else is recorded with its outcome.
    if (req.path === "/api/health") return;
    requestLogger.info("request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      userId: req.user ? String(req.user._id || req.user.id) : null,
    });
  });

  next();
}

export default requestContext;