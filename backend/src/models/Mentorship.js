import mongoose from "mongoose";

// ============================================================================
// FACULTY MENTORING DOMAIN
// ============================================================================

// A faculty mentor is assigned to one or more students within the faculty's
// authorized institutional scope. Assignments persist historical mentoring
// relationships and are the basis for scoping faculty observations and
// readiness recommendations.
export const MentorshipAssignmentSchema = new mongoose.Schema(
  {
    institutionId: {
      type: String,
      default: "techspire",
      index: true,
      trim: true,
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    program: {
      type: String,
      trim: true,
      default: null,
    },
    batch: {
      type: String,
      trim: true,
      default: null,
    },
    semester: {
      type: Number,
      default: null,
      index: true,
    },
    careerPath: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "PAUSED", "ENDED"],
      default: "ACTIVE",
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

MentorshipAssignmentSchema.index({ faculty: 1, student: 1 }, { unique: true });
MentorshipAssignmentSchema.index({ student: 1, status: 1 });
MentorshipAssignmentSchema.index({ faculty: 1, status: 1 });
MentorshipAssignmentSchema.index({ careerPath: 1, status: 1 });

export const MentorshipAssignment =
  mongoose.models.MentorshipAssignment ||
  mongoose.model("MentorshipAssignment", MentorshipAssignmentSchema);

// Scheduled or ad-hoc mentoring sessions between a faculty mentor and a
// student. Sessions carry an agenda, outcome and optional follow-up actions.
export const MentoringSessionSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorshipAssignment",
      required: true,
      index: true,
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },
    durationMinutes: {
      type: Number,
      min: 15,
      max: 480,
      default: 60,
    },
    mode: {
      type: String,
      enum: ["IN_PERSON", "VIDEO_CALL", "PHONE", "ASYNC"],
      default: "VIDEO_CALL",
    },
    meetingLink: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"],
      default: "SCHEDULED",
      index: true,
    },
    agenda: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    outcomes: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    followUpActions: [
      {
        action: { type: String, trim: true, maxlength: 1000 },
        dueDate: { type: Date, default: null },
        completed: { type: Boolean, default: false },
      },
    ],
    studentRequested: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

MentoringSessionSchema.index({ student: 1, scheduledAt: -1 });
MentoringSessionSchema.index({ faculty: 1, scheduledAt: -1 });
MentoringSessionSchema.index({ status: 1, scheduledAt: 1 });

export const MentoringSession =
  mongoose.models.MentoringSession ||
  mongoose.model("MentoringSession", MentoringSessionSchema);

// Faculty observations recorded during mentoring, project reviews or workplace
// supervision. Observations are private to authorized institutional staff and
// are never exposed to employers. They feed readiness recommendations.
export const FacultyObservationSchema = new mongoose.Schema(
  {
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorshipAssignment",
      default: null,
      index: true,
    },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentoringSession",
      default: null,
      index: true,
    },
    observationType: {
      type: String,
      enum: ["PROGRESS", "STRENGTH", "CONCERN", "SKILL", "BEHAVIOR", "GENERAL"],
      default: "GENERAL",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    competency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Competency",
      default: null,
      index: true,
    },
    competencyLevel: {
      type: Number,
      min: 1,
      max: 100,
      default: null,
    },
    careerPath: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    isPrivate: {
      type: Boolean,
      default: true,
      index: true,
    },
    visibleToStudent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

FacultyObservationSchema.index({ student: 1, createdAt: -1 });
FacultyObservationSchema.index({ faculty: 1, createdAt: -1 });
FacultyObservationSchema.index({ student: 1, observationType: 1 });

export const FacultyObservation =
  mongoose.models.FacultyObservation ||
  mongoose.model("FacultyObservation", FacultyObservationSchema);
