import mongoose from "mongoose";

const UserActivityEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserSession",
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: ["page_view", "module_access", "navigation", "interaction", "logout", "heartbeat"],
      required: true,
      index: true,
    },
    module: {
      type: String,
      default: null,
      index: true,
    },
    route: {
      type: String,
      default: null,
    },
    previousRoute: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
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
  },
  {
    timestamps: true,
  }
);

UserActivityEventSchema.index({ user: 1, timestamp: -1 });
UserActivityEventSchema.index({ session: 1, timestamp: 1 });
UserActivityEventSchema.index({ module: 1, timestamp: -1 });
UserActivityEventSchema.index({ eventType: 1, timestamp: -1 });

export const UserActivityEvent = mongoose.model("UserActivityEvent", UserActivityEventSchema);