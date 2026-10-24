import mongoose from "mongoose";

/**
 * Acknowledgement Record.
 *
 * Tracks explicit acknowledgement of critical published decisions by students.
 * Separate from notification read status.
 */
const AcknowledgementRecordSchema = new mongoose.Schema(
  {
    decision: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicDecision",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    acknowledged: {
      type: Boolean,
      default: false,
      index: true,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    notificationDelivered: {
      type: Boolean,
      default: false,
    },
    notificationDeliveredAt: {
      type: Date,
      default: null,
    },
    notificationOpened: {
      type: Boolean,
      default: false,
    },
    notificationOpenedAt: {
      type: Date,
      default: null,
    },
    reminderCount: {
      type: Number,
      default: 0,
    },
    lastReminderAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

AcknowledgementRecordSchema.index({ decision: 1, student: 1 }, { unique: true });
AcknowledgementRecordSchema.index({ student: 1, acknowledged: 1 });
AcknowledgementRecordSchema.index({ decision: 1, acknowledged: 1 });

export const AcknowledgementRecord = mongoose.model("AcknowledgementRecord", AcknowledgementRecordSchema);