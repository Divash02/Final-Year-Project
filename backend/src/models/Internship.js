import mongoose from "mongoose";

// ============================================================================
// 1. EMPLOYER & COMPANY MODELS
// ============================================================================

export const EmployerSchema = new mongoose.Schema(
  {
    institutionId: {
      type: String,
      default: "techspire",
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Employer name is required"],
      trim: true,
      maxlength: 200,
      index: true,
    },
    code: {
      type: String,
      uppercase: true,
      trim: true,
      sparse: true,
    },
    industry: {
      type: String,
      trim: true,
      maxlength: 100,
      index: true,
    },
    size: {
      type: String,
      enum: ["STARTUP", "SME", "LARGE", "ENTERPRISE"],
      default: "SME",
    },
    website: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    about: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    logoUrl: {
      type: String,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100,
      index: true,
    },
    country: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Nepal",
    },
    contactPerson: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    contactPhone: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED", "REVOKED"],
      default: "PENDING",
      index: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    partnershipTier: {
      type: String,
      enum: ["STRATEGIC", "PREFERRED", "STANDARD", "TRIAL"],
      default: "STANDARD",
    },
    mouDetails: {
      isSigned: { type: Boolean, default: false },
      signedDate: { type: Date, default: null },
      expiryDate: { type: Date, default: null },
      documentFile: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", default: null },
      notes: { type: String, default: "" },
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 5.0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
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

EmployerSchema.index({ name: 1, isVerified: 1 });
EmployerSchema.index({ industry: 1, verificationStatus: 1 });
EmployerSchema.index({ isArchived: 1, isActive: 1 });

export const Employer =
  mongoose.models.Employer ||
  mongoose.model("Employer", EmployerSchema, "internshipcompanies");
export const InternshipCompany = Employer;

// ----------------------------------------------------------------------------
// 2. EMPLOYER USER & VERIFICATION AUDIT
// ----------------------------------------------------------------------------

export const EmployerUserSchema = new mongoose.Schema(
  {
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    employerRole: {
      type: String,
      enum: ["OWNER", "HR_RECRUITER", "SUPERVISOR", "MENTOR"],
      default: "HR_RECRUITER",
      index: true,
    },
    designation: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    phone: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INVITED", "SUSPENDED", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    permissions: [{ type: String, trim: true }],
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

EmployerUserSchema.index({ employer: 1, user: 1 }, { unique: true });

export const EmployerUser =
  mongoose.models.EmployerUser ||
  mongoose.model("EmployerUser", EmployerUserSchema);

export const EmployerVerificationSchema = new mongoose.Schema(
  {
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessRegistrationNumber: {
      type: String,
      trim: true,
      required: true,
    },
    taxIdentificationNumber: {
      type: String,
      trim: true,
    },
    registrationDocument: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
      fileName: String,
      url: String,
    },
    taxClearanceDocument: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
      fileName: String,
      url: String,
    },
    mouDocument: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
      fileName: String,
      url: String,
    },
    status: {
      type: String,
      enum: ["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED"],
      default: "PENDING",
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
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    auditTrail: [
      {
        action: String,
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

EmployerVerificationSchema.index({ employer: 1, status: 1 });

export const EmployerVerification =
  mongoose.models.EmployerVerification ||
  mongoose.model("EmployerVerification", EmployerVerificationSchema);

// ============================================================================
// 3. REAL INTERNSHIP OPPORTUNITIES & APPLICATIONS
// ============================================================================

export const InternshipOpportunitySchema = new mongoose.Schema(
  {
    institutionId: {
      type: String,
      default: "techspire",
      index: true,
    },
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Opportunity title is required"],
      trim: true,
      maxlength: 250,
      index: true,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
      index: true,
    },
    workMode: {
      type: String,
      enum: ["ON_SITE", "HYBRID", "REMOTE"],
      default: "HYBRID",
      index: true,
    },
    employmentType: {
      type: String,
      enum: ["FULL_TIME", "PART_TIME"],
      default: "FULL_TIME",
    },
    location: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    stipend: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: "NPR" },
      frequency: {
        type: String,
        enum: ["MONTHLY", "WEEKLY", "LUMP_SUM", "UNPAID"],
        default: "MONTHLY",
      },
      isNegotiable: { type: Boolean, default: false },
    },
    durationMonths: {
      type: Number,
      min: 1,
      max: 24,
      required: true,
    },
    availablePositions: {
      type: Number,
      min: 1,
      default: 1,
    },
    applicantsCount: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    responsibilities: [{ type: String, trim: true }],
    requirements: [{ type: String, trim: true }],
    skillsRequired: [{ type: String, trim: true, index: true }],
    targetPrograms: [{ type: mongoose.Schema.Types.ObjectId, ref: "Program" }],
    targetDepartments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Department" }],
    status: {
      type: String,
      enum: ["DRAFT", "PENDING_APPROVAL", "OPEN", "CLOSING_SOON", "CLOSED", "ARCHIVED"],
      default: "OPEN",
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    deadline: {
      type: Date,
      required: true,
      index: true,
    },
    postedDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

InternshipOpportunitySchema.index({ employer: 1, status: 1 });
InternshipOpportunitySchema.index({ status: 1, deadline: 1 });
InternshipOpportunitySchema.index({ workMode: 1, status: 1 });

export const InternshipOpportunity =
  mongoose.models.InternshipOpportunity ||
  mongoose.model("InternshipOpportunity", InternshipOpportunitySchema);

export const InternshipSupervisorSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 200,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    designation: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    isPrimary: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const InternshipSupervisor =
  mongoose.models.InternshipSupervisor ||
  mongoose.model("InternshipSupervisor", InternshipSupervisorSchema);

export const InternshipApplicationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    opportunity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipOpportunity",
      default: null,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    academicSupervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    coordinator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    industrySupervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipSupervisor",
      default: null,
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
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    coverLetter: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    resume: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
      fileName: String,
      url: String,
    },
    portfolioUrl: {
      type: String,
      trim: true,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    durationWeeks: {
      type: Number,
      min: 1,
      max: 52,
    },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "SUBMITTED",
        "UNDER_REVIEW",
        "SHORTLISTED",
        "INTERVIEW_SCHEDULED",
        "OFFER_EXTENDED",
        "OFFER_ACCEPTED",
        "OFFER_DECLINED",
        "REJECTED",
        "ACTIVE",
        "COMPLETED",
        "TERMINATED",
        "ARCHIVED",
      ],
      default: "SUBMITTED",
      index: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
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
    reviewNotes: {
      type: String,
      trim: true,
      maxlength: 1500,
      default: "",
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1500,
      default: "",
    },
    approvalLetter: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
      issuedAt: { type: Date },
    },
    attachments: [
      {
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", required: true },
        originalName: { type: String, required: true },
        mimeType: { type: String, required: true },
        sizeBytes: { type: Number, required: true },
        category: {
          type: String,
          enum: ["OFFER_LETTER", "NOC", "INSURANCE", "AGREEMENT", "OTHER"],
          default: "OTHER",
        },
      },
    ],
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate application from same student to same specific opportunity
InternshipApplicationSchema.index(
  { student: 1, opportunity: 1 },
  { unique: true, partialFilterExpression: { opportunity: { $type: "objectId" } } }
);
InternshipApplicationSchema.index({ company: 1, status: 1, submittedAt: -1 });
InternshipApplicationSchema.index({ student: 1, status: 1 });
InternshipApplicationSchema.index({ academicSupervisor: 1, status: 1 });
InternshipApplicationSchema.index({ academicYear: 1, semester: 1, status: 1 });

export const InternshipApplication =
  mongoose.models.InternshipApplication ||
  mongoose.model("InternshipApplication", InternshipApplicationSchema);

// ============================================================================
// 4. INTERVIEWS, OFFERS, PLACEMENTS & AGREEMENTS
// ============================================================================

export const InternshipInterviewSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    roundNumber: {
      type: Number,
      default: 1,
    },
    interviewType: {
      type: String,
      enum: ["TECHNICAL", "HR_SCREENING", "CULTURE_FIT", "FINAL_PANEL"],
      default: "TECHNICAL",
    },
    scheduledStartTime: {
      type: Date,
      required: true,
      index: true,
    },
    scheduledEndTime: {
      type: Date,
      required: true,
    },
    durationMinutes: {
      type: Number,
      default: 45,
    },
    mode: {
      type: String,
      enum: ["VIDEO_CALL", "IN_PERSON", "PHONE"],
      default: "VIDEO_CALL",
    },
    meetingLink: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    interviewers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        name: String,
        designation: String,
      },
    ],
    status: {
      type: String,
      enum: ["SCHEDULED", "RESCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"],
      default: "SCHEDULED",
      index: true,
    },
    feedback: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    score: {
      type: Number,
      min: 1,
      max: 10,
    },
    recommendation: {
      type: String,
      enum: ["STRONG_HIRE", "HIRE", "HOLD", "NO_HIRE"],
    },
  },
  { timestamps: true }
);

InternshipInterviewSchema.index({ application: 1, roundNumber: 1 });
InternshipInterviewSchema.index({ student: 1, scheduledStartTime: 1 });

export const InternshipInterview =
  mongoose.models.InternshipInterview ||
  mongoose.model("InternshipInterview", InternshipInterviewSchema);

export const InternshipOfferSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    opportunity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipOpportunity",
      default: null,
    },
    roleTitle: {
      type: String,
      required: true,
      trim: true,
    },
    stipendAmount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "NPR",
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    weeklyWorkHours: {
      type: Number,
      default: 40,
    },
    offerLetter: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
      fileName: String,
      url: String,
    },
    responseDeadline: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["EXTENDED", "ACCEPTED", "DECLINED", "EXPIRED", "REVOKED"],
      default: "EXTENDED",
      index: true,
    },
    decisionDate: {
      type: Date,
      default: null,
    },
    declineReason: {
      type: String,
      trim: true,
      default: "",
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

InternshipOfferSchema.index({ application: 1, status: 1 });
InternshipOfferSchema.index({ student: 1, status: 1 });

export const InternshipOffer =
  mongoose.models.InternshipOffer ||
  mongoose.model("InternshipOffer", InternshipOfferSchema);

export const InternshipPlacementSchema = new mongoose.Schema(
  {
    placementCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    opportunity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipOpportunity",
      default: null,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      required: true,
      unique: true,
      index: true,
    },
    offer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipOffer",
      default: null,
    },
    academicSupervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    industrySupervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipSupervisor",
      default: null,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "PENDING_ONBOARDING",
        "ACTIVE",
        "ON_LEAVE",
        "COMPLETED",
        "TERMINATED",
        "EXTENDED",
      ],
      default: "PENDING_ONBOARDING",
      index: true,
    },
    totalRequiredHours: {
      type: Number,
      default: 480,
    },
    completedHours: {
      type: Number,
      default: 0,
    },
    academicCredits: {
      type: Number,
      default: 6,
    },
    onboardingTasks: [
      {
        title: { type: String, required: true },
        description: String,
        isCompleted: { type: Boolean, default: false },
        completedAt: Date,
      },
    ],
    finalGrade: {
      type: String,
      default: null,
    },
    completionCertifiedAt: {
      type: Date,
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

InternshipPlacementSchema.index({ student: 1, status: 1 });
InternshipPlacementSchema.index({ employer: 1, status: 1 });
InternshipPlacementSchema.index({ academicSupervisor: 1, status: 1 });

export const InternshipPlacement =
  mongoose.models.InternshipPlacement ||
  mongoose.model("InternshipPlacement", InternshipPlacementSchema);

export const InternshipAgreementSchema = new mongoose.Schema(
  {
    placement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipPlacement",
      required: true,
      unique: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    agreementDocument: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
      fileName: String,
      url: String,
    },
    studentSignedAt: { type: Date, default: null },
    employerSignedAt: { type: Date, default: null },
    institutionSignedAt: { type: Date, default: null },
    signedByInstitutionUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "PENDING_STUDENT",
        "PENDING_EMPLOYER",
        "PENDING_INSTITUTION",
        "FULLY_EXECUTED",
        "EXPIRED",
      ],
      default: "DRAFT",
      index: true,
    },
  },
  { timestamps: true }
);

export const InternshipAgreement =
  mongoose.models.InternshipAgreement ||
  mongoose.model("InternshipAgreement", InternshipAgreementSchema);

// ============================================================================
// 5. TASKS, LOGBOOKS, ATTENDANCE & REPORTS
// ============================================================================

export const InternshipTaskSchema = new mongoose.Schema(
  {
    placement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipPlacement",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
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
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },
    status: {
      type: String,
      enum: ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"],
      default: "TODO",
      index: true,
    },
    dueDate: {
      type: Date,
      default: null,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    deliverables: [
      {
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
        fileName: String,
        url: String,
      },
    ],
    feedback: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

InternshipTaskSchema.index({ placement: 1, status: 1 });
InternshipTaskSchema.index({ student: 1, dueDate: 1 });

export const InternshipTask =
  mongoose.models.InternshipTask ||
  mongoose.model("InternshipTask", InternshipTaskSchema);

export const InternshipLogbookSchema = new mongoose.Schema(
  {
    placement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipPlacement",
      index: true,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    weekNumber: {
      type: Number,
      min: 1,
      max: 52,
      required: true,
    },
    weekStartDate: {
      type: Date,
      required: true,
    },
    weekEndDate: {
      type: Date,
      required: true,
    },
    activitiesSummary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    learningOutcomes: {
      type: String,
      trim: true,
      maxlength: 2500,
      default: "",
    },
    challengesFaced: {
      type: String,
      trim: true,
      maxlength: 2500,
      default: "",
    },
    hoursWorked: {
      type: Number,
      min: 0,
      max: 80,
      default: 0,
      required: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
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
    supervisorFeedback: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    academicSupervisorFeedback: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "APPROVED", "REVIEWED", "NEEDS_REVISION"],
      default: "SUBMITTED",
      index: true,
    },
    attachments: [
      {
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile", required: true },
        originalName: { type: String, required: true },
        mimeType: { type: String, required: true },
        sizeBytes: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true }
);

InternshipLogbookSchema.index(
  { placement: 1, weekNumber: 1 },
  { unique: true, partialFilterExpression: { placement: { $type: "objectId" } } }
);
InternshipLogbookSchema.index(
  { application: 1, weekNumber: 1 },
  { unique: true, partialFilterExpression: { application: { $type: "objectId" } } }
);
InternshipLogbookSchema.index({ student: 1, submittedAt: -1 });

export const InternshipLogbook =
  mongoose.models.InternshipLogbook ||
  mongoose.model("InternshipLogbook", InternshipLogbookSchema, "internshipprogressreports");
export const InternshipProgressReport = InternshipLogbook;

export const InternshipAttendanceSchema = new mongoose.Schema(
  {
    placement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipPlacement",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    checkInTime: {
      type: Date,
      default: null,
    },
    checkOutTime: {
      type: Date,
      default: null,
    },
    totalHours: {
      type: Number,
      min: 0,
      max: 24,
      default: 0,
    },
    status: {
      type: String,
      enum: ["PRESENT", "LATE", "HALF_DAY", "ABSENT", "ON_LEAVE", "HOLIDAY"],
      default: "PRESENT",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    approvedBySupervisor: {
      type: Boolean,
      default: false,
      index: true,
    },
    supervisorApprovedAt: {
      type: Date,
      default: null,
    },
    supervisorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

InternshipAttendanceSchema.index({ placement: 1, date: 1 }, { unique: true });
InternshipAttendanceSchema.index({ student: 1, date: -1 });

export const InternshipAttendance =
  mongoose.models.InternshipAttendance ||
  mongoose.model("InternshipAttendance", InternshipAttendanceSchema);

export const InternshipReportSchema = new mongoose.Schema(
  {
    placement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipPlacement",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    reportType: {
      type: String,
      enum: ["PROPOSAL", "INTERIM", "FINAL", "SPECIAL_CASE_STUDY"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    executiveSummary: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    reportFile: {
      fileId: { type: mongoose.Schema.Types.ObjectId, ref: "StoredFile" },
      fileName: String,
      url: String,
    },
    plagiarismScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REVISION_REQUESTED"],
      default: "SUBMITTED",
      index: true,
    },
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    evaluatedAt: {
      type: Date,
      default: null,
    },
    academicGrade: {
      type: String,
      default: null,
    },
    facultyRemarks: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

InternshipReportSchema.index({ placement: 1, reportType: 1 });
InternshipReportSchema.index({ student: 1, status: 1 });

export const InternshipReport =
  mongoose.models.InternshipReport ||
  mongoose.model("InternshipReport", InternshipReportSchema);

// ============================================================================
// 6. EVALUATIONS & CERTIFICATION CREDENTIALS
// ============================================================================

export const InternshipEvaluationSchema = new mongoose.Schema(
  {
    placement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipPlacement",
      index: true,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
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
    evaluatorType: {
      type: String,
      enum: ["INDUSTRY_SUPERVISOR", "ACADEMIC_SUPERVISOR"],
      required: true,
      index: true,
    },
    evaluationType: {
      type: String,
      enum: ["MID_TERM", "FINAL"],
      default: "MID_TERM",
      index: true,
    },
    technicalSkills: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    professionalism: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    communication: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    problemSolving: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    teamwork: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    initiative: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    overallRating: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    strengths: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    areasForImprovement: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    additionalComments: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    gradeAwarded: {
      type: String,
      default: null,
    },
    evaluatedAt: {
      type: Date,
      default: Date.now,
    },
    isFinal: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

InternshipEvaluationSchema.index({ placement: 1, evaluatorType: 1, evaluationType: 1 });
InternshipEvaluationSchema.index({ application: 1, evaluatorType: 1, isFinal: 1 });
InternshipEvaluationSchema.index({ student: 1, evaluationType: 1 });

export const InternshipEvaluation =
  mongoose.models.InternshipEvaluation ||
  mongoose.model("InternshipEvaluation", InternshipEvaluationSchema);

export const InternshipCredentialSchema = new mongoose.Schema(
  {
    placement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipPlacement",
      required: true,
      unique: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    credentialNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    digitalCredential: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DigitalCredential",
      default: null,
    },
    certificateTitle: {
      type: String,
      default: "Certificate of Industrial Internship Completion",
    },
    completedHours: {
      type: Number,
      required: true,
    },
    finalGrade: {
      type: String,
      required: true,
    },
    academicCredits: {
      type: Number,
      default: 6,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    verificationHash: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true }
);

export const InternshipCredential =
  mongoose.models.InternshipCredential ||
  mongoose.model("InternshipCredential", InternshipCredentialSchema);
