import mongoose from "mongoose";

/**
 * Faculty Workload Record
 *
 * Periodic snapshot of a faculty member's assigned teaching load for a
 * given semester. HoD and authorized management may view departmental
 * or institutional summaries; individual faculty see only their own.
 */
const FacultyWorkloadSchema = new mongoose.Schema(
  {
    facultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    academicYear: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    semester: {
      type: Number,
      min: 1,
      max: 12,
      required: true,
      index: true,
    },
    department: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    totalTeachingHours: {
      type: Number,
      default: 0,
    },
    weeklyTeachingHours: {
      type: Number,
      default: 0,
    },
    practicalLabHours: {
      type: Number,
      default: 0,
    },
    totalCourses: {
      type: Number,
      default: 0,
    },
    assignedSections: {
      type: [String],
      default: [],
    },
    assignedCourses: [
      {
        course: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
        },
        courseCode: { type: String, trim: true, default: "" },
        courseName: { type: String, trim: true, default: "" },
        sectionCodes: { type: [String], default: [] },
        hoursPerWeek: { type: Number, default: 0 },
        credits: { type: Number, default: 3 },
        _id: false,
      },
    ],
    assessmentWorkloadHours: {
      type: Number,
      default: 0,
    },
    pendingMarkingTasks: {
      type: Number,
      default: 0,
    },
    pendingGradingCount: {
      type: Number,
      default: 0,
    },
    consultationHoursPlanned: {
      type: Number,
      default: 0,
    },
    consultationHoursActual: {
      type: Number,
      default: 0,
    },
    syllabusCompletionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    syllabusCompletedTopics: {
      type: Number,
      default: 0,
    },
    syllabusTotalTopics: {
      type: Number,
      default: 0,
    },
    researchSupervisionLoad: {
      type: Number,
      default: 0,
    },
    administrativeLoadHours: {
      type: Number,
      default: 0,
    },
    totalWorkloadHours: {
      type: Number,
      default: 0,
    },
    workloadBalanceFlag: {
      type: String,
      enum: ["BALANCED", "UNDER_LOAD", "OVER_LOAD", "CRITICAL"],
      default: "BALANCED",
      index: true,
    },
    workloadBalanceNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    computedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    computedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

FacultyWorkloadSchema.index({ facultyUser: 1, academicYear: 1, semester: 1 }, { unique: true });
FacultyWorkloadSchema.index({ department: 1, semester: 1, workloadBalanceFlag: 1 });
FacultyWorkloadSchema.index({ academicYear: 1, semester: 1, totalWorkloadHours: -1 });

export const FacultyWorkload = mongoose.model("FacultyWorkload", FacultyWorkloadSchema);