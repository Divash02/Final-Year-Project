import mongoose from "mongoose";

/**
 * Persistent login attempt tracking for distributed rate limiting.
 *
 * Replaces the previous in-memory `Map` so counters survive server restarts
 * and are shared across multiple CollegeOS instances. MongoDB is already the
 * primary data store, so no new infrastructure dependency is introduced.
 *
 * Schema:
 *   - attemptKey: `${email}:${ip}` — unique per account + IP pair
 *   - failures: number of consecutive failed attempts in the current window
 *   - windowStartedAt: when the current 15-minute window began
 *   - lockedUntil: when the lockout expires (null if not locked)
 *   - expiresAt: TTL for automatic cleanup of stale records
 *
 * All updates use atomic MongoDB operators ($inc, $set) so concurrent requests
 * across instances cannot desynchronise the counter.
 */
const LoginAttemptSchema = new mongoose.Schema(
  {
    attemptKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    failures: {
      type: Number,
      required: true,
      default: 0,
    },
    windowStartedAt: {
      type: Date,
      required: true,
    },
    lockedUntil: {
      type: Date,
      default: null,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// TTL index: automatically remove records when expiresAt is reached.
// This bounds collection growth without a background cleanup job.
LoginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginAttempt = mongoose.model(
  "LoginAttempt",
  LoginAttemptSchema,
);
