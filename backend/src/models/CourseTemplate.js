import mongoose from "mongoose";

/**
 * Reusable course structure.
 *
 * A template is a structural snapshot: week topics, learning objectives,
 * assignment briefs and quiz question structures with no student, no
 * submission, no attempt, no grade and no mark attached to it. Creating a
 * course from a template therefore always produces a new academic instance —
 * a previous year's cohort can never bleed into the next one, because nothing
 * that belongs to a person is ever stored here.
 *
 * Stored file material is recorded as a reference note rather than a copied
 * file so the original upload is not duplicated per cohort; the teacher chooses
 * which files to attach to the new instance.
 */
const TemplateWeekSchema = new mongoose.Schema(
  {
    sourceWeekNumber: { type: Number, required: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", maxlength: 12000 },
    teachingPlan: { type: String, default: "", maxlength: 12000 },
    expectedOutcome: { type: String, default: "", maxlength: 8000 },
    studyTimeMinutes: { type: Number, default: null },
    objectives: [
      {
        _id: false,
        text: { type: String, required: true, trim: true, maxlength: 500 },
        code: { type: String, default: null, maxlength: 40 },
        cognitiveLevel: { type: String, default: null },
        note: { type: String, default: "", maxlength: 2000 },
      },
    ],
    materials: [
      {
        _id: false,
        title: { type: String, required: true, trim: true, maxlength: 180 },
        materialType: { type: String, default: "FILE" },
        note: { type: String, default: "", maxlength: 500 },
      },
    ],
    assignments: [
      {
        _id: false,
        title: { type: String, required: true, trim: true, maxlength: 180 },
        assignmentType: { type: String, default: "OTHER" },
        instructions: { type: String, default: "", maxlength: 8000 },
        maxMarks: { type: Number, default: 100 },
      },
    ],
    quizzes: [
      {
        _id: false,
        title: { type: String, required: true, trim: true, maxlength: 180 },
        description: { type: String, default: "", maxlength: 8000 },
        maxMarks: { type: Number, default: 20 },
        passingMarks: { type: Number, default: 0 },
        durationMinutes: { type: Number, default: 30 },
        attemptsAllowed: { type: Number, default: 1 },
        randomizeQuestions: { type: Boolean, default: false },
        randomizeOptions: { type: Boolean, default: false },
        resultReleasePolicy: { type: String, default: "AFTER_GRADING" },
        showCorrectAnswers: { type: Boolean, default: false },
        questions: [
          {
            _id: false,
            type: { type: String, required: true },
            difficulty: { type: String, default: "MEDIUM" },
            text: { type: String, required: true, maxlength: 8000 },
            codeSnippet: { type: String, default: "", maxlength: 8000 },
            notation: { type: String, default: "", maxlength: 4000 },
            options: [
              {
                _id: false,
                id: { type: String, required: true },
                text: { type: String, required: true, maxlength: 2000 },
              },
            ],
            marks: { type: Number, default: 1 },
            category: { type: String, default: null },
            topic: { type: String, default: null },
            explanation: { type: String, default: "", maxlength: 8000 },
            correctAnswer: { type: [mongoose.Schema.Types.Mixed], default: [] },
          },
        ],
      },
    ],
  },
  { _id: false },
);

/**
 * Saved course structure.
 *
 * Keyed by `code` so a template can be applied deliberately in a later academic
 * year; `sourceCourse` records which delivery it was captured from for
 * traceability.
 */
const CourseTemplateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    sourceCourse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },
    program: { type: String, default: null, uppercase: true, trim: true, index: true },
    semester: { type: Number, default: null, index: true },
    credits: { type: Number, default: null },
    courseType: { type: String, default: "CORE" },
    weeks: { type: [TemplateWeekSchema], default: [] },
    weekCount: { type: Number, default: 0 },
    archivedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

CourseTemplateSchema.index({ code: 1, name: 1 }, { unique: true });

export const CourseTemplate = mongoose.model("CourseTemplate", CourseTemplateSchema);