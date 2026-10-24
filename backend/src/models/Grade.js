import mongoose from "mongoose";

/**
 * Central academic grade record.
 *
 * One row per (student, assessment) is projected from wherever the mark is
 * actually held: a `Submission` for an assignment, a graded `QuizAttempt` for a
 * quiz, an `ExamResult` for an examination. The projection never becomes a
 * second source of truth — `sourceType`/`sourceId` point back at the record
 * that owns the mark, and `syncGradeFromSource` rewrites the projection from
 * that record. Grades, therefore, flow into the course gradebook, the student
 * transcript view and examination reporting without any of them keeping a
 * disconnected marking database.
 */
const GradeSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    studentUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
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

    sourceType: {
      type: String,
      enum: ["ASSIGNMENT", "QUIZ", "EXAM"],
      required: true,
      index: true,
    },
    sourceId: { type: String, required: true, index: true },

    /** Denormalised only for report readability; the reference stays canonical. */
    assessmentTitle: { type: String, required: true, trim: true, maxlength: 200 },
    assessmentType: { type: String, required: true, trim: true, maxlength: 40 },

    maxMarks: { type: Number, required: true, min: 0 },
    marksObtained: { type: Number, default: null, min: 0 },
    percentage: { type: Number, default: null },

    /** `PENDING` marks the work as awaiting a marker, never as a zero. */
    status: {
      type: String,
      enum: ["PENDING", "GRADED", "PUBLISHED"],
      default: "PENDING",
      index: true,
    },
    feedback: { type: String, default: "", trim: true, maxlength: 8000 },
    isLate: { type: Boolean, default: false },

    academicYear: { type: String, required: true, trim: true, index: true },
    semester: { type: Number, default: null, index: true },
    sectionCodes: { type: [String], default: [] },

    /** Record of who published the mark to the student, for auditability. */
    releasedAt: { type: Date, default: null },
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

GradeSchema.index(
  { student: 1, sourceType: 1, sourceId: 1 },
  { unique: true },
);
GradeSchema.index({ course: 1, sourceType: 1, status: 1 });

export const Grade = mongoose.model("Grade", GradeSchema);