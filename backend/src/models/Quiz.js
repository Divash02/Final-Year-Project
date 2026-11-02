import mongoose from "mongoose";
import { AudienceSchema, normalizeAudienceInput } from "./Audience.js";

export const QUIZ_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "OPEN",
  "CLOSED",
  "GRADING",
  "COMPLETED",
];

/** How much of a multiple-select question is correct. */
export const MULTI_SELECT_GRADING = ["EXACT", "PARTIAL_CREDIT"];

/** When a student is allowed to see their own score. */
export const RESULT_RELEASE_POLICIES = [
  "IMMEDIATELY",
  "AFTER_CLOSE",
  "AFTER_GRADING",
  "MANUAL",
];

/**
 * Quiz — one assessment inside a course week.
 *
 * The stored `status` is the teacher's lifecycle decision; the state a student
 * actually experiences is derived from `status` together with the server clock
 * in `services/lms/quizEngine.js`. Nothing in the browser may advance the quiz:
 * opening, closing and auto-submission are all decided here from `openAt` /
 * `closeAt`, so a student cannot extend a quiz by changing the device clock.
 *
 * The cohort the quiz is for is carried in `audience`, exactly like every other
 * targeted CollegeOS record, so quiz visibility is decided by the same
 * authorisation service as materials and assignments.
 */
const QuizSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    week: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseWeek",
      required: true,
      index: true,
    },
    facultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", trim: true, maxlength: 8000 },
    instructions: { type: String, default: "", trim: true, maxlength: 8000 },

    // --- Assessment configuration -----------------------------------------
    maxMarks: { type: Number, required: true, min: 0, max: 1000 },
    passingMarks: { type: Number, default: 0, min: 0, max: 1000 },
    /** Minutes a single attempt may take, measured from the server start time. */
    durationMinutes: { type: Number, required: true, min: 1, max: 600 },
    attemptsAllowed: { type: Number, default: 1, min: 1, max: 20 },

    // --- Delivery configuration -------------------------------------------
    randomizeQuestions: { type: Boolean, default: false },
    randomizeOptions: { type: Boolean, default: false },
    allowBackNavigation: { type: Boolean, default: true },
    allowReviewBeforeSubmit: { type: Boolean, default: true },
    multipleSelectGrading: {
      type: String,
      enum: MULTI_SELECT_GRADING,
      default: "EXACT",
    },
    /** Fill-in-the-blank matching is case- and whitespace-insensitive by default. */
    blankAnswerCaseSensitive: { type: Boolean, default: false },
    /** Question navigation mode: FREE (any order) or SEQUENTIAL (must answer in order). */
    navigationMethod: {
      type: String,
      enum: ["FREE", "SEQUENTIAL"],
      default: "FREE",
    },
    /** Whether policy allows teachers to reopen an attempt that has already expired. */
    allowReopenExpired: { type: Boolean, default: true },
    /** History of whole-class or quiz-level deadline extensions. */
    extensionHistory: [
      {
        _id: false,
        extendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        extendedAt: { type: Date, default: Date.now },
        previousCloseAt: { type: Date, required: true },
        revisedCloseAt: { type: Date, required: true },
        reason: { type: String, default: "", trim: true, maxlength: 500 },
      },
    ],

    // --- Result release ----------------------------------------------------
    resultReleasePolicy: {
      type: String,
      enum: RESULT_RELEASE_POLICIES,
      default: "AFTER_GRADING",
      index: true,
    },
    showCorrectAnswers: { type: Boolean, default: false },
    resultsReleasedAt: { type: Date, default: null },
    resultsReleasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // --- Schedule ----------------------------------------------------------
    openAt: { type: Date, default: null, index: true },
    closeAt: { type: Date, required: true, index: true },
    openedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // --- Cohort ------------------------------------------------------------
    audience: { type: AudienceSchema, default: () => normalizeAudienceInput({}) },
    academicYear: { type: String, required: true, trim: true, index: true },
    program: { type: String, default: null, uppercase: true, trim: true },
    semester: { type: Number, default: null, index: true },
    sectionCodes: { type: [String], default: [], index: true },

    status: {
      type: String,
      enum: QUIZ_STATUSES,
      default: "DRAFT",
      index: true,
    },

    /** Rolling counters kept for fast workspace badges; recomputed on read too. */
    attemptCount: { type: Number, default: 0 },
    pendingManualGradeCount: { type: Number, default: 0 },

    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

QuizSchema.index({ course: 1, week: 1, createdAt: -1 });
QuizSchema.index({ status: 1, openAt: 1, closeAt: 1 });

export const Quiz = mongoose.model("Quiz", QuizSchema);