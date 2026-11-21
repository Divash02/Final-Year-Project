import mongoose from "mongoose";

// ============================================================================
// COMPETENCY AND PROFESSIONAL PORTFOLIO MODELS
// ============================================================================

export const CompetencySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    category: {
      type: String,
      enum: ["TECHNICAL", "DOMAIN", "COLLABORATION", "PROCESS"],
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    targetProficiency: {
      type: Number,
      min: 1,
      max: 100,
      default: 80,
    },
    isInstitutionalStandard: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

export const Competency =
  mongoose.models.Competency ||
  mongoose.model("Competency", CompetencySchema);

export const CompetencyEvidenceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    competency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Competency",
      required: true,
      index: true,
    },
    sourceDomain: {
      type: String,
      enum: ["REAL_INTERNSHIP", "INDUSTRY_PROJECT", "VIRTUAL_SIMULATION"],
      required: true,
      index: true,
    },
    sourceReferenceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    evidenceSummary: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    evidenceUrl: {
      type: String,
      trim: true,
      default: null,
    },
    evidenceFile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoredFile",
      default: null,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: Date.now,
    },
    scoreLevel: {
      type: Number,
      min: 1,
      max: 100,
      required: true,
    },
    endorsementCount: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

CompetencyEvidenceSchema.index(
  { student: 1, competency: 1, sourceDomain: 1, sourceReferenceId: 1 },
  { unique: true }
);

export const CompetencyEvidence =
  mongoose.models.CompetencyEvidence ||
  mongoose.model("CompetencyEvidence", CompetencyEvidenceSchema);

export const ProfessionalPortfolioSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      unique: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    headline: {
      type: String,
      trim: true,
      maxlength: 250,
      default: "",
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    featuredSkills: [
      {
        skillName: { type: String, required: true },
        level: { type: Number, min: 1, max: 100, default: 80 },
        category: { type: String, default: "TECHNICAL" },
        endorsementCount: { type: Number, default: 0 },
        isVerified: { type: Boolean, default: false },
      },
    ],
    verifiedDeliverables: [
      {
        title: { type: String, required: true },
        description: String,
        sourceDomain: {
          type: String,
          enum: ["REAL_INTERNSHIP", "INDUSTRY_PROJECT", "VIRTUAL_SIMULATION"],
        },
        deliverableUrl: String,
        verifiedAt: { type: Date, default: Date.now },
      },
    ],
    isPublic: {
      type: Boolean,
      default: true,
      index: true,
    },
    viewsCount: {
      type: Number,
      default: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const ProfessionalPortfolio =
  mongoose.models.ProfessionalPortfolio ||
  mongoose.model("ProfessionalPortfolio", ProfessionalPortfolioSchema);
