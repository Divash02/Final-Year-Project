import mongoose from "mongoose";

export const ATTEMPT_STATUSES = [
  "IN_PROGRESS",
  "SUBMITTED",
  "AUTO_SUBMITTED",
  "GRADED",
];

/**
 * One answered question inside an attempt.
 *
 * Marks are only ever written by the grading service: `awardedMarks` is null
 * while a manual answer is unreviewed, and `markedBy` / `markedAt` record the
 * human decision so a changed grade is attributable.
 */
const QuizAnswerSchema = new mongoose.Schema(
  {
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuizQuestion",
      required: true,
    },
    /** Marks at the moment the question was issued, so later edits to the
     *  question cannot retroactively change what was assessed. */
    marksSnapshot: { type: Number, required: true },
    /** Marks this answer actually earned. */
    awardedMarks: { type: Number, default: null },
    requiresManualGrading: { type: Boolean, default: false },
    isCorrect: { type: Boolean, default: null },
    /** Student response. Shape depends on the question type. */
    response: { type: mongoose.Schema.Types.Mixed, default: null },
    responseText: { type: String, default: "", maxlength: 20000 },
    markedForReview: { type: Boolean, default: false },
    feedback: { type: String, default: "", trim: true, maxlength: 4000 },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt: { type: Date, default: null },
  },
  { _id: false, timestamps: true },
);

/**
 * An academic-integrity event recorded against an attempt.
 *
 * These are signals, not verdicts: the browser can report that a tab was
 * hidden or that the connection dropped, and the record is kept so a teacher
 * can review it. CollegeOS never presents them as proof of misconduct.
 */
const IntegrityEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "ATTEMPT_STARTED",
        "TAB_HIDDEN",
        "TAB_VISIBLE",
        "RECONNECTED",
        "AUTOSAVE_FAILED",
        "PAUSE",
      ],
      required: true,
    },
    at: { type: Date, default: Date.now },
    /** Request metadata captured where the institution permits it. */
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 400 },
    /** Free-form, non-conclusive context (e.g. duration hidden). */
    detail: { type: String, default: null, maxlength: 200 },
  },
  { _id: false },
);

/**
 * Quiz attempt.
 *
 * The attempt is the durable record of one sitting: the exact question order
 * and option order the student saw, every saved answer, the server-computed
 * deadline, and the marks. Because the order is snapshotted here, a refresh
 * resumes the same attempt with the same layout, and a mid-quiz refresh cannot
 * reshuffle a paper.
 */
const QuizAttemptSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    studentUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Denormalised institutional id for teacher rosters only. */
    studentCode: { type: String, default: null, trim: true, index: true },
    attemptNumber: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: ATTEMPT_STATUSES,
      default: "IN_PROGRESS",
      index: true,
    },

    /** Question ids in the order this student received them. */
    questionOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: "QuizQuestion" }],
    /** `questionId -> ordered option ids` when option randomisation is on. */
    optionOrder: { type: Map, of: [String], default: () => new Map() },

    /** Absolute server deadlines; the browser never decides these. */
    startedAt: { type: Date, required: true },
    /** Original server-computed deadline before any authorized extensions. */
    originalExpiresAt: { type: Date, default: null },
    /** Current effective deadline (respecting extensions and quiz close). */
    expiresAt: { type: Date, required: true, index: true },
    submittedAt: { type: Date, default: null },
    /** Marks are null until submission; `duration` is wall-clock, not scored. */
    durationSeconds: { type: Number, default: null },
    /** True when the closing time submitted the attempt, not the student. */
    autoSubmitted: { type: Boolean, default: false },

    /** Authorized extensions granted to this individual attempt. */
    extensionHistory: [
      {
        _id: false,
        grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        grantedAt: { type: Date, default: Date.now },
        previousExpiresAt: { type: Date, required: true },
        revisedExpiresAt: { type: Date, required: true },
        additionalMinutes: { type: Number, default: 0 },
        reason: { type: String, default: "", trim: true, maxlength: 500 },
        action: {
          type: String,
          enum: ["EXTENSION", "REOPEN"],
          default: "EXTENSION",
        },
      },
    ],
    reopenedAt: { type: Date, default: null },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    answers: { type: [QuizAnswerSchema], default: [] },
    integrityEvents: { type: [IntegrityEventSchema], default: [] },

    // --- Result ------------------------------------------------------------
    objectiveMarks: { type: Number, default: 0 },
    manualMarks: { type: Number, default: 0 },
    awardedMarks: { type: Number, default: null },
    maxMarksSnapshot: { type: Number, required: true },
    percentage: { type: Number, default: null },
    passed: { type: Boolean, default: null },
    correctCount: { type: Number, default: 0 },
    incorrectCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
    pendingManualCount: { type: Number, default: 0 },

    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt: { type: Date, default: null },
    overallFeedback: { type: String, default: "", trim: true, maxlength: 8000 },
  },
  { timestamps: true },
);

QuizAttemptSchema.index({ quiz: 1, student: 1, attemptNumber: 1 }, { unique: true });
QuizAttemptSchema.index({ quiz: 1, status: 1 });

export const QuizAttempt = mongoose.model("QuizAttempt", QuizAttemptSchema);