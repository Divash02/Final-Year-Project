/**
 * In-memory fixed-window rate limiter.
 *
 * CollegeOS already stores login-attempt counters in MongoDB, but that only
 * protects a single account. This middleware protects the *endpoint* from a
 * distributed guessing or credential-stuffing pattern that rotates accounts.
 *
 * It is deliberately process-local and dependency-free: no Redis is required,
 * and a multi-instance deployment can front it with a shared limiter later
 * without changing call sites.
 */

import { logger } from "../utils/logger.js";

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 300,
  name = "api",
  keyGenerator = clientKey,
} = {}) {
  const hits = new Map();

  // Periodically drop idle windows so the map cannot grow without bound.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  cleanup.unref?.();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = `${name}:${keyGenerator(req)}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      logger.warn("rate_limited", {
        limiter: name,
        path: req.path,
        method: req.method,
        retryAfter,
      });
      res.status(429).json({
        error: "Too many requests. Please wait a moment and try again.",
        code: "RATE_LIMITED",
      });
      return;
    }
    next();
  };
}

/**
 * Authentication endpoints: login, password reset. These are the only
 * unauthenticated mutating routes, so they get the strictest budget.
 */
export const authRateLimiter = createRateLimiter({
  name: "auth",
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 300),
});

export default createRateLimiter;