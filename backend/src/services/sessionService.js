import { Session, LoginAttempt } from "../models/index.js";
import { hashToken } from "../utils/token.js";

/**
 * Session lifecycle and login-attempt tracking.
 *
 * Persistence is MongoDB (the institutional source of truth); no in-memory
 * counters or competing session store are introduced. All counter updates use
 * atomic operators so concurrent requests across instances cannot desynchronise.
 *
 * Fail-safe behaviour: if MongoDB is unreachable these functions throw and the
 * caller denies the attempt rather than allowing unlimited retries.
 */

export async function createSession(userId, token, expiresAt, metadata = {}, csrfToken = null) {
  const tokenHash = hashToken(token);
  const existingSession = await Session.findOne({ tokenHash });
  const payload = {
    user: userId,
    tokenHash,
    csrfToken: csrfToken || null,
    expiresAt: new Date(expiresAt),
    userAgent: String(metadata.userAgent || "").slice(0, 512),
    ipAddress: metadata.ipAddress || null,
    location: metadata.location || null,
    lastActiveAt: new Date(),
    revokedAt: null,
  };
  if (existingSession) {
    Object.assign(existingSession, payload);
    await existingSession.save();
    return existingSession;
  }
  return await Session.create(payload);
}

/**
 * Classifies a bearer token's session without applying the staleness window
 * used by touchSession. Used to report precise session failure reasons
 * (revoked, absolutely expired, inactive, or missing) instead of a generic
 * "invalid session". No token value or secret is ever logged by callers.
 */
export async function classifySession(token) {
  const tokenHash = hashToken(token);
  const session = await Session.findOne({ tokenHash }).lean();
  if (!session) return { session: null, status: "MISSING" };
  if (session.revokedAt) return { session, status: "REVOKED" };
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    return { session, status: "EXPIRED_ABSOLUTE" };
  }
  return { session, status: "ACTIVE" };
}

export async function getSessionByToken(token) {
  const classification = await classifySession(token);
  if (classification.status !== "ACTIVE") return null;
  const session = classification.session;
  return {
    ...session,
    id: session._id.toString(),
    user_id: session.user.toString(),
  };
}

export async function forceTouchSession(sessionId) {
  return await Session.updateOne(
    { _id: sessionId, revokedAt: null },
    { $set: { lastActiveAt: new Date() } },
  );
}

export async function revokeSession(token) {
  const tokenHash = hashToken(token);
  return await Session.updateOne(
    { tokenHash, revokedAt: null },
    { revokedAt: new Date() }
  );
}

export async function revokeUserSessions(userId) {
  return await Session.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: new Date() }
  );
}

export async function touchSession(sessionId, metadata, session) {
  const now = new Date();
  const set = {};
  const lastActiveAt = session.lastActiveAt
    ? new Date(session.lastActiveAt).getTime()
    : 0;
  const activityIsStale = lastActiveAt < now.getTime() - 60_000;
  if (activityIsStale) set.lastActiveAt = now;
  if (!session.userAgent && metadata.userAgent) {
    set.userAgent = String(metadata.userAgent).slice(0, 512);
  }
  if (!session.ipAddress && metadata.ipAddress) {
    set.ipAddress = metadata.ipAddress;
  }
  if (Object.keys(set).length === 0) return null;

  const conditions = [];
  if (activityIsStale) {
    conditions.push({
      lastActiveAt: { $lt: new Date(now.getTime() - 60_000) },
    });
  }
  if (set.userAgent) conditions.push({ userAgent: { $in: ["", null] } });
  if (set.ipAddress) conditions.push({ ipAddress: { $in: ["", null] } });
  return await Session.updateOne(
    {
      _id: sessionId,
      revokedAt: null,
      $or: conditions,
    },
    { $set: set },
  );
}

/* ------------------------------------------------------------------ */
/* Login attempt tracking                                              */
/* ------------------------------------------------------------------ */

export function createLoginAttemptKey(email, ip) {
  return `${String(email).trim().toLowerCase()}:${String(ip || "unknown")}`;
}

export async function isLoginLocked(attemptKey) {
  const entry = await LoginAttempt.findOne({ attemptKey }).lean();
  if (!entry || !entry.lockedUntil) return false;
  return entry.lockedUntil.getTime() > Date.now();
}

export async function recordLoginFailure(attemptKey) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const cutoff = new Date(now - windowMs);

  // Atomic find-or-increment. $inc is atomic across instances.
  const entry = await LoginAttempt.findOneAndUpdate(
    { attemptKey },
    { $inc: { failures: 1 } },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );

  const withinWindow =
    entry && entry.windowStartedAt && entry.windowStartedAt.getTime() > cutoff.getTime();

  if (!withinWindow) {
    // Window expired — reset counter atomically.
    await LoginAttempt.findOneAndUpdate(
      { attemptKey },
      {
        $set: {
          failures: 1,
          windowStartedAt: new Date(now),
          lockedUntil: null,
          expiresAt: new Date(now + windowMs * 2),
        },
      }
    );
    return { locked: false, remaining: 14 };
  }

  const failures = entry ? entry.failures : 1;

  if (failures >= 15 && (!entry || !entry.lockedUntil)) {
    await LoginAttempt.findOneAndUpdate(
      { attemptKey },
      {
        $set: {
          lockedUntil: new Date(now + windowMs),
          expiresAt: new Date(now + windowMs * 2),
        },
      }
    );
    return { locked: true, remaining: 0 };
  }

  const remaining = Math.max(0, 15 - failures);
  const locked = Boolean(
    entry && entry.lockedUntil && entry.lockedUntil.getTime() > now
  );
  return { locked, remaining };
}

export async function clearLoginFailures(attemptKey) {
  await LoginAttempt.deleteOne({ attemptKey });
}