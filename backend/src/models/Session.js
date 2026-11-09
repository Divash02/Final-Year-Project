import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    csrfToken: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, default: "", maxlength: 512 },
    ipAddress: { type: String, default: null, maxlength: 128 },
    location: { type: String, default: null, maxlength: 128 },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Session = mongoose.model("Session", SessionSchema);
