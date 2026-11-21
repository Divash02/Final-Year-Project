import mongoose from "mongoose";

// ============================================================================
// CAREER READINESS ASSESSMENT DOMAIN
// ============================================================================

// Faculty recommends a student for a specific career role after observing
// practical work. Recommendations are role-specific and do not automatically
// approve readiness.
export const ReadinessRecommendationSchema = new mongoose.Schema(
  {
    institutionId: {
      type: String,
      default: "techspire",
      index: true,
      trim: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    careerRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CareerRole",
      required: true,
      index: true,
    },
    careerPathCode: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "SUBMITTED",
        "UNDER_REVIEW",
        "ADDITIONAL_EVIDENCE_REQUIRED",
        "ACCEPTED_FOR_ASSESSMENT",
        "RETURNED_FOR_REVISION",
        "CLOSED",
      ],
      default: "DRAFT",
      index: true,
    },
    recommendedCompetencies: [
      {
        competency: { type: mongoose.Schema.Types.ObjectId, ref: "Competency" },
        demonstratedLevel: { type: Number, min: 1, max: 100, default: 0 },
        notes: { type: String, trim: true, maxlength: 1000, default: "" },
      },
    ],
    skillGaps: [
      {
        competency: { type: mongoose.Schema.Types.ObjectId, ref: "Competency" },
        description: { type: String, trim: true, maxlength: 1000 },
      },
    ],
    areasOfStrength: [{ type: String, trim: true, maxlength: 500 }],
    facultyComments: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    supportingSubmissions: [
      {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true, maxlength: 1000, default: "" },
        url: { type: String, trim: true, default: null },
        sourceDomain: {
          type: String,
          enum: ["REAL_INTERNSHIP", "INDUSTRY_PROJECT", "VIRTUAL_SIMULATION", "OTHER"],
          default: "OTHER",
        },
      },
    ],
    relevantProjects: [
      {
        project: { type: mongoose.Schema.Types.ObjectId, ref: "IndustryProject" },
        role: { type: String, trim: true, default: "" },
        contribution: { type: String, trim: true, maxlength: 2000, default: "" },
      },
    ],
    recommendationDate: {
      type: Date,
      default: Date.now,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewDecision: {
      type: String,
      enum: ["ACCEPTED_FOR_ASSESSMENT", "RETURNED_FOR_REVISION", "CLOSED"],
      default: null,
    },
    reviewComments: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    additionalEvidenceRequested: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    auditTrail: [
      {
        action: { type: String, required: true },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, trim: true, default: "" },
      },
    ],
  },
  { timestamps: true }
);

ReadinessRecommendationSchema.index({ student: 1, careerRole: 1, status: 1 });
ReadinessRecommendationSchema.index({ faculty: 1, status: 1 });
ReadinessRecommendationSchema.index({ careerRole: 1, status: 1 });
ReadinessRecommendationSchema.index({ status: 1, recommendationDate: -1 });

export const ReadinessRecommendation =
  mongoose.models.ReadinessRecommendation ||
  mongoose.model("ReadinessRecommendation", ReadinessRecommendationSchema);

// The formal career readiness review created when a recommendation is accepted
// for assessment. Tracks evidence collection and the authorized decision.
export const CareerReadinessAssessmentSchema = new mongoose.Schema(
  {
    institutionId: {
      type: String,
      default: "techspire",
      index: true,
      trim: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    recommendation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReadinessRecommendation",
      required: true,
      index: true,
    },
    careerRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CareerRole",
      required: true,
      index: true,
    },
    careerPathCode: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "NOT_RECOMMENDED",
        "RECOMMENDATION_SUBMITTED",
        "PENDING_REVIEW",
        "MORE_EVIDENCE_REQUIRED",
        "ASSESSMENT_IN_PROGRESS",
        "READY_FOR_SPECIFIED_ROLE",
        "NOT_YET_READY",
        "REASSESSMENT_REQUESTED",
      ],
      default: "PENDING_REVIEW",
      index: true,
    },
    assessor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    evidenceCollected: [
      {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true, maxlength: 1000, default: "" },
        url: { type: String, trim: true, default: null },
        sourceDomain: {
          type: String,
          enum: ["REAL_INTERNSHIP", "INDUSTRY_PROJECT", "VIRTUAL_SIMULATION", "OTHER"],
          default: "OTHER",
        },
        reviewedAt: { type: Date, default: Date.now },
      },
    ],
    competencyReviews: [
      {
        competency: { type: mongoose.Schema.Types.ObjectId, ref: "Competency" },
        met: { type: Boolean, default: false },
        evidenceNote: { type: String, trim: true, maxlength: 1000, default: "" },
        reviewerComment: { type: String, trim: true, maxlength: 2000, default: "" },
      },
    ],
    decision: {
      type: String,
      enum: ["READY", "NOT_YET_READY", "REASSESSMENT_REQUESTED"],
      default: null,
    },
    decisionRationale: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
    notifiedAt: {
      type: Date,
      default: null,
    },
    reassessmentDueAt: {
      type: Date,
      default: null,
    },
    auditTrail: [
      {
        action: { type: String, required: true },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, trim: true, default: "" },
      },
    ],
  },
  { timestamps: true }
);

CareerReadinessAssessmentSchema.index({ student: 1, careerRole: 1, status: 1 });
CareerReadinessAssessmentSchema.index({ careerRole: 1, status: 1 });
CareerReadinessAssessmentSchema.index({ status: 1, createdAt: -1 });

export const CareerReadinessAssessment =
  mongoose.models.CareerReadinessAssessment ||
  mongoose.model("CareerReadinessAssessment", CareerReadinessAssessmentSchema);

// Authorized readiness decision record kept for audit. A student may have
// multiple readiness records, one per career role.
export const ReadinessDecisionSchema = new mongoose.Schema(
  {
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CareerReadinessAssessment",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    careerRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CareerRole",
      required: true,
      index: true,
    },
    careerPathCode: {
      type: String,
      trim: true,
      default: null,
    },
    decision: {
      type: String,
      enum: ["READY", "NOT_YET_READY", "REASSESSMENT_REQUESTED"],
      required: true,
      index: true,
    },
    rationale: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    decidedAt: {
      type: Date,
      default: Date.now,
    },
    evidenceSummary: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    competenciesMet: [
      {
        competency: { type: mongoose.Schema.Types.ObjectId, ref: "Competency" },
        met: { type: Boolean, default: false },
      },
    ],
    reassessmentDueAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

ReadinessDecisionSchema.index({ student: 1, careerRole: 1 });
ReadinessDecisionSchema.index({ careerRole: 1, decision: 1 });

export const ReadinessDecision =
  mongoose.models.ReadinessDecision ||
  mongoose.model("ReadinessDecision", ReadinessDecisionSchema);
