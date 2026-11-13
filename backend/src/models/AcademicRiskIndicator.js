import mongoose from "mongoose";

const RiskFactorSchema = new mongoose.Schema(
  {
    factor: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    severity: {
      type: String,
      enum: ["LOW", "MODERATE", "HIGH"],
      required: true,
    },
    sourceRecord: {
      collectionName: { type: String, required: true },
      recordId: { type: mongoose.Schema.Types.ObjectId, required: true },
      label: { type: String, required: true },
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const RecommendedInterventionSchema = new mongoose.Schema(
  {
    intervention: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    priority: {
      type: String,
      enum: ["LOW", "MODERATE", "HIGH"],
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "DEFERRED"],
      default: "PENDING",
    },
    note: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const AcademicRiskIndicatorSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 120,
      index: true,
    },
    program: {
      type: String,
      trim: true,
      maxlength: 80,
      index: true,
    },
    semester: {
      type: Number,
      min: 1,
      max: 12,
      index: true,
    },
    academicYear: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MODERATE", "HIGH"],
      default: "LOW",
      index: true,
    },
    contributingFactors: {
      type: [RiskFactorSchema],
      default: [],
    },
    recommendedInterventions: {
      type: [RecommendedInterventionSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "MONITORING", "RESOLVED", "ESCALATED"],
      default: "ACTIVE",
      index: true,
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
    reviewNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    escalatedAt: {
      type: Date,
      default: null,
    },
    escalatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastCalculatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

AcademicRiskIndicatorSchema.index({ student: 1, status: 1 });
AcademicRiskIndicatorSchema.index({ department: 1, program: 1, semester: 1, priority: 1 });
AcademicRiskIndicatorSchema.index({ priority: 1, lastCalculatedAt: -1 });

export const AcademicRiskIndicator = mongoose.model(
  "AcademicRiskIndicator",
  AcademicRiskIndicatorSchema
);