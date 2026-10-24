import mongoose from "mongoose";

export const COURSE_TYPES = ["CORE", "ELECTIVE", "LAB", "PROJECT", "INTERNSHIP"];
export const COURSE_STATUSES = ["ACTIVE", "ARCHIVED"];

/**
 * Course / curriculum record.
 *
 * The identifier (`code`) and the owning department stay authoritative, and the
 * academic placement fields (programme, semester, academic year, prerequisites)
 * are what make a course schedulable, assignable and targetable. `status`
 * implements archive-instead-of-delete: institutional records referenced by
 * enrolments, timetables, assignments or results are archived so historical
 * reporting keeps a resolvable course, while `ARCHIVED` courses are excluded
 * from new academic work.
 */
const CourseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, default: null, trim: true },
    program: { type: String, default: null, uppercase: true, trim: true, index: true },
    programCode: { type: String, default: null, uppercase: true, trim: true },
    credits: { type: Number, default: 3, min: 0, max: 60 },
    semester: { type: Number, default: 1, index: true },
    academicYear: { type: String, default: null, trim: true, index: true },
    courseType: { type: String, enum: COURSE_TYPES, default: "CORE" },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    /** Course codes that must be passed before this course can be taken. */
    prerequisites: [{ type: String, uppercase: true, trim: true }],
    status: {
      type: String,
      enum: COURSE_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

CourseSchema.index({ department: 1, semester: 1 });

export const Course = mongoose.model("Course", CourseSchema);
