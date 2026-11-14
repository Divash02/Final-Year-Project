import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/environment.js";
import { getBaseSessionPolicy } from "../config/sessionSecurity.js";

/**
 * Session token signing, verification and hashing.
 *
 * This module owns all JWT concerns so authentication middleware, the session
 * service and the CSRF check share one implementation.
 */

export function signToken(payload) {
  const tokenPayload = {
    ...payload,
    userId: String(payload?.userId || ""),
    jti: payload?.jti || randomUUID(),
  };
  return jwt.sign(tokenPayload, env.jwtSecret, {
    expiresIn: getBaseSessionPolicy().accessTokenTtl,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}