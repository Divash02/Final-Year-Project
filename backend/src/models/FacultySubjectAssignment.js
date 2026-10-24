import mongoose from "mongoose";

/**
 * Faculty ↔ Subject assignment.
 *
 * Links a faculty member (User with role "faculty") to one or more subjects
 * (Course records) they are assigned to teach. This is the authoritative
 * record of which subjects a faculty member is qualified/responsible for,
 * used during account creation and editing by administrators.
 *
 * Unlike CourseTeachingAssignment (which links faculty → course → section
 * for timetable/attendance purposes), this model captures the broader
 * subject-matter responsibility without requiring a section or timetable
 * entry. It is the administrative record of "this faculty teaches these
 * subjects".
 */
const FacultySubjectAssignmentSchema = new mongoose.Schema(
  {
    facultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

// One active assignment per (faculty, course) pair.
FacultySubjectAssignmentSchema.index(
  { facultyUser: 1, course: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

export const FacultySubjectAssignment = mongoose.model(
  "FacultySubjectAssignment",
  FacultySubjectAssignmentSchema,
);