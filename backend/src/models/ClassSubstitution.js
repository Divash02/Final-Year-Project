import mongoose from "mongoose";

/**
 * Class Substitution Request
 *
 * When a faculty member is absent, they (or HoD) request a replacement
 * for scheduled classes. Separate from the HR leave approval flow:
 * HR approves the leave; Academic Admin coordinates the timetable
 * substitution.
 */
const ClassSubstitutionSchema = new mongoose.Schema(
  {
    leaveRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveRequest",
      default: null,
      index: true,
    },
    requesterFacultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requesterName: {
      type: String,
      trim: true,
      required: true,
    },
    requesterDepartment: {
      type: String,
      trim: true,
      default: "",
    },
    replacementFacultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    replacementName: {
      type: String,
      trim: true,
      default: "",
    },
    replacementAvailability: {
      type: String,
      enum: ["AVAILABLE", "UNAVAILABLE", "PENDING_CHECK", "CONFLICT"],
      default: "PENDING_CHECK",
      index: true,
    },
    affectedSessions: [
      {
        timetable: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Timetable",
          required: true,
        },
        course: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
        },
        courseCode: { type: String, trim: true, default: "" },
        courseName: { type: String, trim: true, default: "" },
        sectionCode: { type: String, trim: true, default: "" },
        scheduledDay: { type: String, trim: true, default: "" },
        scheduledDate: { type: Date, default: null },
        startTime: { type: String, trim: true, default: "" },
        endTime: { type: String, trim: true, default: "" },
        sessionType: { type: String, trim: true, default: "" },
        room: { type: String, trim: true, default: "" },
        substitutionStatus: {
          type: String,
          enum: ["PENDING", "ASSIGNED", "NOTIFIED", "CONFIRMED", "CANCELLED"],
          default: "PENDING",
        },
        _id: false,
      },
    ],
    affectedSessionCount: {
      type: Number,
      default: 0,
    },
    leaveDates: {
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
    },
    leaveReason: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING_HOD", "PENDING_ACADEMIC_ADMIN", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"],
      default: "DRAFT",
      index: true,
    },
    hodApproverUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    hodApprovalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "RETURNED", "REJECTED"],
      default: "PENDING",
    },
    hodApprovalNotes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    hodApprovedAt: {
      type: Date,
      default: null,
    },
    academicAdminUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    academicAdminStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "COORDINATED"],
      default: "PENDING",
    },
    academicAdminNotes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    academicAdminApprovedAt: {
      type: Date,
      default: null,
    },
    timetableUpdated: {
      type: Boolean,
      default: false,
    },
    studentsNotified: {
      type: Boolean,
      default: false,
    },
    replacementNotified: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

ClassSubstitutionSchema.index({ requesterFacultyUser: 1, status: 1, createdAt: -1 });
ClassSubstitutionSchema.index({ replacementFacultyUser: 1, status: 1 });
ClassSubstitutionSchema.index({ status: 1, createdAt: -1 });

export const ClassSubstitution = mongoose.model("ClassSubstitution", ClassSubstitutionSchema);