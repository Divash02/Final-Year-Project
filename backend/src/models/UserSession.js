import mongoose from "mongoose";

const UserSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sessionTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    loginAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    logoutAt: {
      type: Date,
      default: null,
    },
    activeDuration: {
      type: Number,
      default: 0,
    },
    idleDuration: {
      type: Number,
      default: 0,
    },
    totalDuration: {
      type: Number,
      default: 0,
    },
    sessionStatus: {
      type: String,
      enum: ["active", "idle", "logged_out", "expired", "abandoned"],
      default: "active",
      index: true,
    },
    deviceCategory: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    location: {
      type: String,
      default: null,
    },
    heartbeatInterval: {
      type: Number,
      default: 30000,
    },
    idleThreshold: {
      type: Number,
      default: 300000,
    },
    pagesVisited: {
      type: Number,
      default: 0,
    },
    modulesAccessed: {
      type: [String],
      default: [],
    },
    firstModule: {
      type: String,
      default: null,
    },
    lastModule: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

UserSessionSchema.index({ user: 1, loginAt: -1 });
UserSessionSchema.index({ sessionStatus: 1, lastActiveAt: -1 });

export const UserSession = mongoose.model("UserSession", UserSessionSchema);