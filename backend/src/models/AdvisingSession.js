import mongoose from "mongoose";

/**
 * Student Advising & Consultation Session
 *
 * Records faculty-student consultation interactions. Privacy-aware: only
 * the participating faculty, the student, and authorized support staff
 * may read these records.
 */
const AdvisingSessionSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    facultyUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    consultationType: {
      type: String,
      enum: ["ACADEMIC_ADVISING", "CAREER_COUNSELING", "PERSONAL_SUPPORT", "ACADEMIC_INTERVENTION", "COURSE_SELECTION", "OTHER"],
      default: "ACADEMIC_ADVISING",
      index: true,
    },
    title: {
      type: String,
      trim: true,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    scheduledDate: {
      type: Date,
      required: true,
      index: true,
    },
    scheduledTime: {
      type: String,
      trim: true,
      default: "",
    },
    durationMinutes: {
      type: Number,
      default: 30,
      min: 15,
      max: 180,
    },
    mode: {
      type: String,
      enum: ["IN_PERSON", "ONLINE", "PHONE", "GROUP"],
      default: "IN_PERSON",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED", "NO_SHOW"],
      default: "SCHEDULED",
      index: true,
    },
    isPrivate: {
      type: Boolean,
      default: true,
    },
    studentConcerns: [
      {
        type: String,
        trim: true,
      },
    ],
    facultyNotes: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    actionItems: [
      {
        description: { type: String, trim: true, required: true },
        assignedTo: { type: String, trim: true, default: "" },
        dueDate: { type: Date, default: null },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date, default: null },
        _id: false,
      },
    ],
    followUpDate: {
      type: Date,
      default: null,
      index: true,
    },
    referredTo: {
      type: String,
      trim: true,
      default: "",
    },
    referredToUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    relatedCourse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    relatedCourseCode: {
      type: String,
      trim: true,
      default: "",
    },
    academicYear: {
      type: String,
      trim: true,
      default: "",
    },
    semester: {
      type: Number,
      min: 1,
      max: 12,
      default: null,
    },
    attachmentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StoredFile",
      },
    ],
    previousSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdvisingSession",
      default: null,
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

AdvisingSessionSchema.index({ facultyUser: 1, scheduledDate: -1 });
AdvisingSessionSchema.index({ student: 1, scheduledDate: -1 });
AdvisingSessionSchema.index({ status: 1, scheduledDate: -1 });
AdvisingSessionSchema.index({ facultyUser: 1, status: 1, followUpDate: 1 });

export const AdvisingSession = mongoose.model("AdvisingSession", AdvisingSessionSchema);