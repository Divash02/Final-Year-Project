import mongoose from "mongoose";

const ResearchMilestoneSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResearchProject",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    order: {
      type: Number,
      required: true,
      min: 1,
    },
    plannedStartDate: {
      type: Date,
      default: null,
    },
    plannedEndDate: {
      type: Date,
      default: null,
    },
    actualStartDate: {
      type: Date,
      default: null,
    },
    actualEndDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REVISION_REQUIRED", "COMPLETED"],
      default: "NOT_STARTED",
      index: true,
    },
    deliverables: [{
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, required: true },
      description: { type: String, trim: true, maxlength: 500, default: "" },
    }],
    supervisorFeedback: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    supervisorReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    supervisorReviewedAt: {
      type: Date,
      default: null,
    },
    hodFeedback: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    hodReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    hodReviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

ResearchMilestoneSchema.index({ project: 1, order: 1 }, { unique: true });
ResearchMilestoneSchema.index({ project: 1, status: 1 });

const ResearchMeetingSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResearchProject",
      required: true,
      index: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    durationMinutes: {
      type: Number,
      min: 15,
      max: 240,
      default: 60,
    },
    meetingType: {
      type: String,
      enum: ["SUPERVISION", "PROGRESS_REVIEW", "MILESTONE_REVIEW", "FINAL_DEFENSE", "OTHER"],
      default: "SUPERVISION",
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    agenda: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    attendees: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      role: { type: String, enum: ["STUDENT", "SUPERVISOR", "CO_SUPERVISOR", "HOD", "EXTERNAL_EXAMINER"], required: true },
      attended: { type: Boolean, default: false },
    }],
    notes: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    actionItems: [{
      description: { type: String, required: true, trim: true, maxlength: 500 },
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      dueDate: { type: Date, default: null },
      completed: { type: Boolean, default: false },
      completedAt: { type: Date, default: null },
    }],
    status: {
      type: String,
      enum: ["SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED"],
      default: "SCHEDULED",
    },
    recordingUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true }
);

ResearchMeetingSchema.index({ project: 1, scheduledAt: -1 });

const ResearchProjectSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    primarySupervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    coSupervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    hod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
      index: true,
    },
    semester: {
      type: Number,
      min: 1,
      max: 12,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    abstract: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    keywords: [{
      type: String,
      trim: true,
      maxlength: 50,
    }],
    researchDomain: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: [
        "PROPOSAL_DRAFT",
        "PROPOSAL_SUBMITTED",
        "PROPOSAL_UNDER_REVIEW",
        "PROPOSAL_REVISION_REQUIRED",
        "PROPOSAL_APPROVED",
        "PROPOSAL_REJECTED",
        "IN_PROGRESS",
        "MILESTONE_REVIEW",
        "FINAL_REPORT_DRAFT",
        "FINAL_REPORT_SUBMITTED",
        "FINAL_REPORT_UNDER_REVIEW",
        "FINAL_REPORT_REVISION_REQUIRED",
        "COMPLETED",
        "DEFERRED",
        "TERMINATED",
      ],
      default: "PROPOSAL_DRAFT",
      index: true,
    },
    proposalSubmittedAt: {
      type: Date,
      default: null,
    },
    proposalApprovedAt: {
      type: Date,
      default: null,
    },
    proposalApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    expectedCompletionDate: {
      type: Date,
      default: null,
    },
    actualCompletionDate: {
      type: Date,
      default: null,
    },
    finalReportSubmittedAt: {
      type: Date,
      default: null,
    },
    finalReportApprovedAt: {
      type: Date,
      default: null,
    },
    finalGrade: {
      type: String,
      trim: true,
      maxlength: 10,
    },
    finalGradePoints: {
      type: Number,
      min: 0,
      max: 4,
    },
    externalExaminer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    defenseDate: {
      type: Date,
      default: null,
    },
    defenseResult: {
      type: String,
      enum: ["PASSED", "PASSED_WITH_REVISIONS", "REVISIONS_REQUIRED", "FAILED"],
      default: null,
    },
    attachments: [{
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      sizeBytes: { type: Number, required: true },
      category: {
        type: String,
        enum: ["PROPOSAL", "LITERATURE_REVIEW", "METHODOLOGY", "DATA", "FINAL_REPORT", "PRESENTATION", "OTHER"],
        default: "OTHER",
      },
    }],
  },
  { timestamps: true }
);

ResearchProjectSchema.index({ student: 1, status: 1 });
ResearchProjectSchema.index({ primarySupervisor: 1, status: 1 });
ResearchProjectSchema.index({ coSupervisor: 1, status: 1 });
ResearchProjectSchema.index({ hod: 1, status: 1 });
ResearchProjectSchema.index({ academicYear: 1, semester: 1, status: 1 });

export const ResearchMilestone = mongoose.model("ResearchMilestone", ResearchMilestoneSchema);
export const ResearchMeeting = mongoose.model("ResearchMeeting", ResearchMeetingSchema);
export const ResearchProject = mongoose.model("ResearchProject", ResearchProjectSchema);