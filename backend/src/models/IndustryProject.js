import mongoose from "mongoose";

// ============================================================================
// DOMAIN B: INDUSTRY PROJECTS
// ============================================================================

export const IndustryProjectSchema = new mongoose.Schema(
  {
    institutionId: {
      type: String,
      default: "techspire",
      index: true,
    },
    title: {
      type: String,
      required: [true, "Project title is required"],
      trim: true,
      maxlength: 250,
      index: true,
    },
    sponsorEmployer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      default: null,
      index: true,
    },
    sponsorName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
    industry: {
      type: String,
      trim: true,
      maxlength: 120,
      index: true,
    },
    durationWeeks: {
      type: Number,
      required: true,
      min: 1,
      max: 52,
      default: 12,
    },
    teamSize: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
      default: 4,
    },
    difficulty: {
      type: String,
      enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
      default: "INTERMEDIATE",
      index: true,
    },
    stipendOrPrize: {
      type: String,
      trim: true,
      default: null,
    },
    clientBrief: {
      type: String,
      required: [true, "Client problem brief is required"],
      trim: true,
      maxlength: 5000,
    },
    objectives: [{ type: String, trim: true }],
    deliverables: [{ type: String, trim: true }],
    requiredSkills: [{ type: String, trim: true, index: true }],
    mentorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    mentorName: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    mentorDesignation: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    applicationDeadline: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "ACCEPTING_APPLICATIONS",
        "IN_PROGRESS",
        "UNDER_REVIEW",
        "COMPLETED",
        "ARCHIVED",
      ],
      default: "ACCEPTING_APPLICATIONS",
      index: true,
    },
    enrolledStudentsCount: {
      type: Number,
      default: 0,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

IndustryProjectSchema.index({ status: 1, applicationDeadline: 1 });
IndustryProjectSchema.index({ sponsorEmployer: 1, status: 1 });
IndustryProjectSchema.index({ difficulty: 1, status: 1 });

export const IndustryProject =
  mongoose.models.IndustryProject ||
  mongoose.model("IndustryProject", IndustryProjectSchema);

export const IndustryProjectMembershipSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IndustryProject",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    teamRole: {
      type: String,
      enum: [
        "TEAM_LEAD",
        "FULL_STACK",
        "BACKEND",
        "FRONTEND",
        "UI_UX",
        "DATA_AI",
        "QA",
      ],
      default: "FULL_STACK",
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: [
        "APPLIED",
        "ACCEPTED",
        "ACTIVE",
        "COMPLETED",
        "WITHDRAWN",
        "REMOVED",
      ],
      default: "ACTIVE",
      index: true,
    },
    statementOfContribution: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
  },
  { timestamps: true }
);

IndustryProjectMembershipSchema.index({ project: 1, student: 1 }, { unique: true });

export const IndustryProjectMembership =
  mongoose.models.IndustryProjectMembership ||
  mongoose.model("IndustryProjectMembership", IndustryProjectMembershipSchema);

export const IndustryProjectTaskSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IndustryProject",
      required: true,
      index: true,
    },
    milestoneNumber: {
      type: Number,
      default: 1,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    assignedMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
      },
    ],
    dueDate: {
      type: Date,
      index: true,
    },
    status: {
      type: String,
      enum: ["TODO", "IN_PROGRESS", "SUBMITTED", "APPROVED", "CHANGES_REQUESTED"],
      default: "TODO",
      index: true,
    },
  },
  { timestamps: true }
);

IndustryProjectTaskSchema.index({ project: 1, milestoneNumber: 1 });

export const IndustryProjectTask =
  mongoose.models.IndustryProjectTask ||
  mongoose.model("IndustryProjectTask", IndustryProjectTaskSchema);

export const IndustryProjectSubmissionSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IndustryProject",
      required: true,
      index: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IndustryProjectTask",
      required: true,
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    repositoryUrl: {
      type: String,
      trim: true,
    },
    liveDemoUrl: {
      type: String,
      trim: true,
    },
    deliverableFiles: [
      {
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
        fileName: String,
        url: String,
      },
    ],
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REVISION_REQUESTED"],
      default: "SUBMITTED",
      index: true,
    },
  },
  { timestamps: true }
);

IndustryProjectSubmissionSchema.index({ project: 1, task: 1, submittedAt: -1 });

export const IndustryProjectSubmission =
  mongoose.models.IndustryProjectSubmission ||
  mongoose.model("IndustryProjectSubmission", IndustryProjectSubmissionSchema);

export const IndustryProjectEvaluationSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IndustryProject",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    milestoneNumber: {
      type: Number,
      default: 1,
    },
    technicalExecution: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    deliverableCompleteness: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    teamCollaboration: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    grade: {
      type: String,
      default: null,
    },
    writtenFeedback: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    evaluatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

IndustryProjectEvaluationSchema.index({ project: 1, student: 1, milestoneNumber: 1 });

export const IndustryProjectEvaluation =
  mongoose.models.IndustryProjectEvaluation ||
  mongoose.model("IndustryProjectEvaluation", IndustryProjectEvaluationSchema);
