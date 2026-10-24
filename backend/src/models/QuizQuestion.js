import mongoose from "mongoose";

export const QUESTION_TYPES = [
  "MULTIPLE_CHOICE",
  "MULTIPLE_SELECT",
  "TRUE_FALSE",
  "FILL_BLANK",
  "SHORT_ANSWER",
  "LONG_ANSWER",
  "NUMERIC",
];

export const QUESTION_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];

/** A question is either bound to one quiz or kept in the reusable bank. */
export const QUESTION_SOURCES = ["QUIZ", "BANK"];

/**
 * Quiz question.
 *
 * `quiz: null` means the question lives in the bank, where it can be reused in
 * any later quiz. Adding a bank question to a quiz copies it into a new
 * document and records the origin in `bankOriginId`, so editing the quiz copy
 * can never rewrite a bank entry (or a quiz that already ran) — academic
 * history stays intact.
 *
 * Correct answers live only on this server-side document. The client that
 * serves an attempt never receives `correctAnswer` or `acceptedAnswers`.
 */
const QuizQuestionSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    /** `null` identifies a reusable bank question. */
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      default: null,
      index: true,
    },
    /** Set when this question was copied out of the bank. */
    bankOriginId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuizQuestion",
      default: null,
    },

    type: { type: String, enum: QUESTION_TYPES, required: true, index: true },
    difficulty: {
      type: String,
      enum: QUESTION_DIFFICULTIES,
      default: "MEDIUM",
      index: true,
    },
    /** Question body; `text` is the plain copy used for lists and exports. */
    text: { type: String, required: true, trim: true, maxlength: 8000 },
    richText: { type: String, default: "", maxlength: 24000 },
    /** Optional supporting image stored through the normal file pipeline. */
    imageFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoredFile",
      default: null,
    },
    /** Optional code block shown with the question. */
    codeSnippet: { type: String, default: "", maxlength: 8000 },
    /** Optional mathematical notation rendered by the client. */
    notation: { type: String, default: "", maxlength: 4000 },

    /** Options for MULTIPLE_CHOICE / MULTIPLE_SELECT. */
    options: [
      {
        _id: false,
        id: { type: String, required: true, trim: true, maxlength: 40 },
        text: { type: String, required: true, trim: true, maxlength: 2000 },
      },
    ],

    marks: { type: Number, required: true, min: 0, max: 1000 },
    category: { type: String, default: null, trim: true, maxlength: 120 },
    topic: { type: String, default: null, trim: true, maxlength: 160, index: true },
    learningObjective: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningObjective",
      default: null,
      index: true,
    },
    explanation: { type: String, default: "", trim: true, maxlength: 8000 },

    /**
     * Grading key.
     *  - MULTIPLE_CHOICE / TRUE_FALSE: `[optionId]`
     *  - MULTIPLE_SELECT: `[optionId, ...]`
     *  - FILL_BLANK: `[[accepted, ...], [accepted, ...]]` one group per blank
     *  - SHORT_ANSWER / LONG_ANSWER: `[[modelAnswer]]` used only as a marking
     *    reference; both still require a human mark.
     */
    correctAnswer: { type: [mongoose.Schema.Types.Mixed], default: [] },

    /** Manually graded question types never receive an automatic mark. */
    requiresManualGrading: { type: Boolean, default: false, index: true },

    position: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

QuizQuestionSchema.index({ quiz: 1, position: 1 });
QuizQuestionSchema.index({ quiz: null, course: 1, difficulty: 1, type: 1 });

export const QuizQuestion = mongoose.model("QuizQuestion", QuizQuestionSchema);

/** Question types a machine can mark, and therefore never wait for a human. */
export const AUTO_GRADED_TYPES = [
  "MULTIPLE_CHOICE",
  "MULTIPLE_SELECT",
  "TRUE_FALSE",
  "FILL_BLANK",
  "NUMERIC",
];

/** Question types that always enter the teacher grading queue. */
export const MANUAL_GRADED_TYPES = ["SHORT_ANSWER", "LONG_ANSWER"];