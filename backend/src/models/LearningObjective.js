import mongoose from "mongoose";

/**
 * Learning objective.
 *
 * Objectives are separate records rather than an embedded array so a quiz
 * question can reference the objective it assesses, which is what makes
 * "question → learning objective → week" reporting possible. Objectives survive
 * a week being archived, and a duplicated week gets new objectives rather than
 * shared ones.
 */
const LearningObjectiveSchema = new mongoose.Schema(
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
    /** Objective text as written by the teacher. */
    text: { type: String, required: true, trim: true, maxlength: 500 },
    /** Optional short code used in blueprints, e.g. "LO-1.2". */
    code: { type: String, default: null, trim: true, maxlength: 40 },
    /** Teacher-facing note: how this objective will be evidenced. */
    note: { type: String, default: "", trim: true, maxlength: 2000 },
    /** Bloom-style level used for analytics, optional. */
    cognitiveLevel: {
      type: String,
      enum: [
        "REMEMBER",
        "UNDERSTAND",
        "APPLY",
        "ANALYSE",
        "EVALUATE",
        "CREATE",
      ],
      default: null,
    },
    position: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

LearningObjectiveSchema.index({ course: 1, week: 1, position: 1 });

export const LearningObjective = mongoose.model(
  "LearningObjective",
  LearningObjectiveSchema,
);