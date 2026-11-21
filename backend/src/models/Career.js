import mongoose from "mongoose";

// ============================================================================
// CAREER EXPLORER MODELS
// ============================================================================

export const CareerCategorySchema = new mongoose.Schema(
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
      maxlength: 150,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    icon: {
      type: String,
      trim: true,
      default: "faLaptopCode",
    },
    color: {
      type: String,
      trim: true,
      default: "indigo",
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

export const CareerCategory =
  mongoose.models.CareerCategory ||
  mongoose.model("CareerCategory", CareerCategorySchema);

export const CareerRoleSchema = new mongoose.Schema(
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
      type: mongoose.Schema.Types.ObjectId,
      ref: "CareerCategory",
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    industry: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "Information Technology",
    },
    responsibilities: [
      {
        type: String,
        trim: true,
        maxlength: 500,
      },
    ],
    requiredTechnicalSkills: [
      {
        skill: { type: String, required: true, trim: true },
        proficiency: {
          type: String,
          enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"],
          default: "INTERMEDIATE",
        },
        isCore: { type: Boolean, default: false },
      },
    ],
    requiredSoftSkills: [
      {
        type: String,
        trim: true,
        maxlength: 100,
      },
    ],
    professionalTools: [
      {
        name: { type: String, required: true, trim: true },
        category: {
          type: String,
          enum: [
            "IDE_EDITOR",
            "VERSION_CONTROL",
            "CI_CD",
            "TESTING",
            "DESIGN",
            "DATABASE",
            "CLOUD",
            "MONITORING",
            "COLLABORATION",
            "DOCUMENTATION",
            "PROJECT_MANAGEMENT",
            "OTHER",
          ],
          default: "OTHER",
        },
        proficiency: {
          type: String,
          enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"],
          default: "INTERMEDIATE",
        },
      },
    ],
    exampleProjects: [
      {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true, maxlength: 1000 },
        technologies: [{ type: String, trim: true }],
        difficulty: {
          type: String,
          enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
          default: "INTERMEDIATE",
        },
      },
    ],
    competencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Competency",
      },
    ],
    assessmentCriteria: [
      {
        criterion: { type: String, required: true, trim: true },
        weight: { type: Number, min: 1, max: 100, default: 10 },
        description: { type: String, trim: true, maxlength: 1000 },
      },
    ],
    portfolioEvidenceRequirements: [
      {
        evidenceType: {
          type: String,
          enum: [
            "CODE_REPOSITORY",
            "PULL_REQUEST",
            "WORKING_APPLICATION",
            "API_DOCUMENTATION",
            "DESIGN_FILE",
            "WIREFRAME",
            "PROTOTYPE",
            "NETWORK_DIAGRAM",
            "TROUBLESHOOTING_REPORT",
            "DATABASE_SCHEMA",
            "SQL_QUERIES",
            "TEST_PLAN",
            "BUG_REPORT",
            "CLOUD_ARCHITECTURE",
            "PROJECT_DOCUMENT",
            "MEETING_CONTRIBUTION",
            "PRESENTATION",
            "REVIEW",
            "ASSESSMENT",
            "OTHER",
          ],
        },
        description: { type: String, trim: true, maxlength: 500 },
        isRequired: { type: Boolean, default: false },
        minCount: { type: Number, default: 1, min: 0 },
      },
    ],
    relatedJobTitles: [
      {
        type: String,
        trim: true,
        maxlength: 150,
      },
    ],
    careerProgression: [
      {
        level: {
          type: String,
          enum: ["ENTRY", "JUNIOR", "MID", "SENIOR", "LEAD", "PRINCIPAL", "DIRECTOR"],
        },
        title: { type: String, required: true, trim: true },
        typicalExperienceYears: { type: Number, min: 0 },
        keyResponsibilities: [{ type: String, trim: true }],
      },
    ],
    difficulty: {
      type: String,
      enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"],
      default: "INTERMEDIATE",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
  },
  { timestamps: true }
);

CareerRoleSchema.index({ category: 1, isActive: 1 });
CareerRoleSchema.index({ difficulty: 1, isActive: 1 });

export const CareerRole =
  mongoose.models.CareerRole || mongoose.model("CareerRole", CareerRoleSchema);

export const StudentCareerInterestSchema = new mongoose.Schema(
  {
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
    interestLevel: {
      type: String,
      enum: ["EXPLORING", "INTERESTED", "COMMITTED", "PRACTICING"],
      default: "EXPLORING",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    lastExploredAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
  },
  { timestamps: true }
);

StudentCareerInterestSchema.index(
  { student: 1, careerRole: 1 },
  { unique: true }
);

export const StudentCareerInterest =
  mongoose.models.StudentCareerInterest ||
  mongoose.model("StudentCareerInterest", StudentCareerInterestSchema);

export const CareerExplorationActivitySchema = new mongoose.Schema(
  {
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
    activityType: {
      type: String,
      enum: [
        "VIEWED_ROLE",
        "VIEWED_RESPONSIBILITIES",
        "VIEWED_SKILLS",
        "VIEWED_TOOLS",
        "VIEWED_PROJECTS",
        "VIEWED_PROGRESSION",
        "COMPARED_CAREERS",
        "SAVED_CAREER",
        "STARTED_SIMULATION",
        "COMPLETED_TASK",
        "SUBMITTED_WORK",
        "RECEIVED_FEEDBACK",
      ],
      required: true,
    },
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
  },
  { timestamps: true }
);

CareerExplorationActivitySchema.index({ student: 1, careerRole: 1, createdAt: -1 });

export const CareerExplorationActivity =
  mongoose.models.CareerExplorationActivity ||
  mongoose.model("CareerExplorationActivity", CareerExplorationActivitySchema);