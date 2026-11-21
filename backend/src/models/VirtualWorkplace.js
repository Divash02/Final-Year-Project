import mongoose from "mongoose";

// ============================================================================
// EXTENDED CAREER PATHS - 15+ IT Career Paths
// ============================================================================

export const CAREER_PATHS = [
  "frontend_developer",
  "backend_developer",
  "fullstack_developer",
  "uiux_designer",
  "database_engineer",
  "network_engineer",
  "qa_engineer",
  "devops_engineer",
  "cloud_engineer",
  "ai_ml_engineer",
  "data_engineer",
  "project_manager",
  "business_analyst",
  "product_manager",
  "technical_writer",
  "systems_analyst",
  "it_support_engineer",
  "security_engineer",
  "mobile_developer",
  "embedded_engineer",
];


// ============================================================================
// DOMAIN C: VIRTUAL WORKPLACE SIMULATIONS (EXTENDED)
// ============================================================================

export const VirtualCompanyTemplateSchema = new mongoose.Schema(
  {
    templateCode: {
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
    logo: {
      type: String,
      trim: true,
      default: "",
    },
    brandTagline: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    sector: {
      type: String,
      enum: [
        "CLOUD_SAAS",
        "FINTECH_ENTERPRISE",
        "HEALTH_TECH",
        "ECOMMERCE_SCALEUP",
        "CYBER_SECURITY",
        "AI_ML_PLATFORM",
        "IOT_INDUSTRIAL",
        "EDTECH",
        "GAMING",
        "BLOCKCHAIN_WEB3",
        "AUTOMOTIVE_TECH",
        "TELECOM",
      ],
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    headquarters: {
      type: String,
      trim: true,
      default: "Virtual Innovation District",
    },
    simulatedEmployeeCount: {
      type: Number,
      default: 450,
    },
    technologies: [{ type: String, trim: true }],
    difficulty: {
      type: String,
      enum: ["FOUNDATIONAL", "ACCELERATED", "PRODUCTION_GRADE"],
      default: "PRODUCTION_GRADE",
      index: true,
    },
    defaultDepartments: [
      {
        name: { type: String, required: true },
        description: String,
        openRoles: [
          {
            type: String,
            enum: CAREER_PATHS,
          },
        ],
      },
    ],
    defaultProjects: [{ type: String, trim: true }],
    companyRules: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
        category: {
          type: String,
          enum: ["COMMUNICATION", "CODE_QUALITY", "SECURITY", "WORKFLOW", "MEETINGS", "OTHER"],
          default: "OTHER",
        },
      },
    ],
    professionalExpectations: [
      {
        expectation: { type: String, required: true },
        category: {
          type: String,
          enum: ["TECHNICAL", "COMMUNICATION", "PROCESS", "COLLABORATION", "LEARNING"],
          default: "TECHNICAL",
        },
      },
    ],
    performanceReviewCriteria: [
      {
        criterion: { type: String, required: true },
        weight: { type: Number, min: 1, max: 100, default: 10 },
        description: String,
      },
    ],
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

export const VirtualCompanyTemplate =
  mongoose.models.VirtualCompanyTemplate ||
  mongoose.model("VirtualCompanyTemplate", VirtualCompanyTemplateSchema);

export const VirtualDepartmentSchema = new mongoose.Schema(
  {
    companyTemplate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualCompanyTemplate",
      default: null,
      index: true,
    },
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    openRoles: [
      {
        type: String,
        enum: CAREER_PATHS,
      },
    ],
    departmentHead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationMembership",
      default: null,
    },
    workflowConfig: {
      sprintLengthDays: { type: Number, default: 14 },
      standupTime: { type: String, default: "09:00" },
      retrospectiveEnabled: { type: Boolean, default: true },
      codeReviewRequired: { type: Boolean, default: true },
      ciCdEnabled: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export const VirtualDepartment =
  mongoose.models.VirtualDepartment ||
  mongoose.model("VirtualDepartment", VirtualDepartmentSchema);

export const VirtualSimulationSchema = new mongoose.Schema(
  {
    simulationCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualCompanyTemplate",
      required: true,
      index: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    institutionId: {
      type: String,
      default: "techspire",
      index: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    semester: {
      type: Number,
      required: true,
    },
    currentSprintNumber: {
      type: Number,
      default: 1,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "ENROLLING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"],
      default: "ENROLLING",
      index: true,
    },
    enrolledCount: {
      type: Number,
      default: 0,
    },
    coordinator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    settings: {
      allowSelfEnrollment: { type: Boolean, default: true },
      requireApplication: { type: Boolean, default: true },
      maxParticipants: { type: Number, default: 50 },
      enableAiWorkforce: { type: Boolean, default: true },
      enableCrossFunctionalProjects: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

VirtualSimulationSchema.index({ academicYear: 1, semester: 1, status: 1 });

export const VirtualSimulation =
  mongoose.models.VirtualSimulation ||
  mongoose.model("VirtualSimulation", VirtualSimulationSchema);

export const SimulationApplicationSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    targetCareerPath: {
      type: String,
      enum: CAREER_PATHS,
      required: true,
      index: true,
    },
    statementOfIntent: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    portfolioUrl: {
      type: String,
      trim: true,
      default: "",
    },
    preferredDepartments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VirtualDepartment",
      },
    ],
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "WAITLISTED"],
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
    reviewNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
  },
  { timestamps: true }
);

SimulationApplicationSchema.index({ simulation: 1, student: 1 }, { unique: true });

export const SimulationApplication =
  mongoose.models.SimulationApplication ||
  mongoose.model("SimulationApplication", SimulationApplicationSchema);

export const SimulationTeamSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualDepartment",
      default: null,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    squadLeadMembership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationMembership",
      default: null,
    },
    mentorName: {
      type: String,
      default: "Elena Rostova (Staff Lead)",
    },
    teamType: {
      type: String,
      enum: ["FUNCTIONAL", "CROSS_FUNCTIONAL", "PROJECT_BASED"],
      default: "FUNCTIONAL",
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationProject",
      default: null,
    },
  },
  { timestamps: true }
);

export const SimulationTeam =
  mongoose.models.SimulationTeam ||
  mongoose.model("SimulationTeam", SimulationTeamSchema);

export const SimulationMembershipSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    careerPath: {
      type: String,
      enum: CAREER_PATHS,
      required: true,
      index: true,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationTeam",
      default: null,
      index: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualDepartment",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "COMPLETED", "EXPELLED", "ON_LEAVE"],
      default: "ACTIVE",
      index: true,
    },
    jobTitle: {
      type: String,
      trim: true,
      default: "",
    },
    managerMembership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationMembership",
      default: null,
    },
    completedStoryPoints: {
      type: Number,
      default: 0,
    },
    completedTasks: {
      type: Number,
      default: 0,
    },
    codeReviewsGiven: {
      type: Number,
      default: 0,
    },
    codeReviewsReceived: {
      type: Number,
      default: 0,
    },
    incidentsResolved: {
      type: Number,
      default: 0,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

SimulationMembershipSchema.index({ simulation: 1, student: 1 }, { unique: true });

export const SimulationMembership =
  mongoose.models.SimulationMembership ||
  mongoose.model("SimulationMembership", SimulationMembershipSchema);

export const SimulationProjectSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationTeam",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    epic: {
      type: String,
      trim: true,
      default: "Core Platform",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    projectBrief: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["BACKLOG", "PLANNING", "IN_PROGRESS", "REVIEW", "RELEASED", "ARCHIVED"],
      default: "PLANNING",
      index: true,
    },
    requiredCareerPaths: [
      {
        type: String,
        enum: CAREER_PATHS,
      },
    ],
    startDate: {
      type: Date,
      default: null,
    },
    targetReleaseDate: {
      type: Date,
      default: null,
    },
    actualReleaseDate: {
      type: Date,
      default: null,
    },
    repositoryUrl: {
      type: String,
      trim: true,
      default: "",
    },
    documentationUrl: {
      type: String,
      trim: true,
      default: "",
    },
    demoUrl: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

export const SimulationProject =
  mongoose.models.SimulationProject ||
  mongoose.model("SimulationProject", SimulationProjectSchema);

export const SimulationTaskSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationProject",
      default: null,
      index: true,
    },
    ticketNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 4000,
    },
    careerPath: {
      type: String,
      enum: CAREER_PATHS,
      required: true,
      index: true,
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
    storyPoints: {
      type: Number,
      default: 3,
      min: 1,
      max: 13,
    },
    assigneeMembership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationMembership",
      default: null,
      index: true,
    },
    reviewerMembership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationMembership",
      default: null,
    },
    acceptanceCriteria: [{ type: String, trim: true }],
    labels: [{ type: String, trim: true }],
    sprintNumber: {
      type: Number,
      default: 1,
    },
    estimatedHours: {
      type: Number,
      default: 0,
    },
    actualHours: {
      type: Number,
      default: 0,
    },
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SimulationTask",
      },
    ],
    attachments: [
      {
        url: String,
        name: String,
        type: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

SimulationTaskSchema.index({ simulation: 1, status: 1 });
SimulationTaskSchema.index({ simulation: 1, careerPath: 1, status: 1 });
SimulationTaskSchema.index({ assigneeMembership: 1, status: 1 });

export const SimulationTask =
  mongoose.models.SimulationTask ||
  mongoose.model("SimulationTask", SimulationTaskSchema);

export const SimulationSubmissionSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationTask",
      required: true,
      index: true,
    },
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    submittedByMembership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationMembership",
      required: true,
      index: true,
    },
    pullRequestUrl: {
      type: String,
      trim: true,
    },
    figmaLink: {
      type: String,
      trim: true,
    },
    testSuiteSummary: {
      type: String,
      trim: true,
    },
    documentationLink: {
      type: String,
      trim: true,
    },
    networkDiagramUrl: {
      type: String,
      trim: true,
    },
    databaseSchemaUrl: {
      type: String,
      trim: true,
    },
    deploymentUrl: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

export const SimulationSubmission =
  mongoose.models.SimulationSubmission ||
  mongoose.model("SimulationSubmission", SimulationSubmissionSchema);

export const SimulationReviewSchema = new mongoose.Schema(
  {
    submission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationSubmission",
      required: true,
      index: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationTask",
      required: true,
      index: true,
    },
    reviewerType: {
      type: String,
      enum: ["AI_BOT", "PEER_STUDENT", "FACULTY_MENTOR", "VIRTUAL_MANAGER"],
      default: "AI_BOT",
    },
    reviewerName: {
      type: String,
      default: "NovaBot CI/CD",
    },
    reviewerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewerMembership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationMembership",
      default: null,
    },
    reviewStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    comments: [
      {
        file: String,
        line: Number,
        comment: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    summary: {
      type: String,
      trim: true,
      default: "",
    },
    strengths: [{ type: String, trim: true }],
    improvements: [{ type: String, trim: true }],
    reviewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const SimulationReview =
  mongoose.models.SimulationReview ||
  mongoose.model("SimulationReview", SimulationReviewSchema);

export const SimulationEventSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: [
        "INCIDENT_CRISIS",
        "SPRINT_PLANNING",
        "RELEASE_TRAIN",
        "ARCHITECTURE_RFC",
        "STANDUP",
        "RETROSPECTIVE",
        "DEMO",
        "POST_MORTEM",
        "TECH_TALK",
        "CLIENT_MEETING",
        "SECURITY_DRILL",
        "PERFORMANCE_REVIEW",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["SEV1_CRITICAL", "SEV2_HIGH", "SEV3_MEDIUM", "INFO"],
      default: "INFO",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    scenarioDescription: {
      type: String,
      required: true,
    },
    impact: {
      type: String,
      default: "",
    },
    recommendedActions: [{ type: String, trim: true }],
    careerPathRelevance: {
      type: String,
      enum: [...CAREER_PATHS, "ALL"],
      default: "ALL",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INVESTIGATING", "MITIGATED", "RESOLVED", "CLOSED"],
      default: "ACTIVE",
      index: true,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    assignedToMemberships: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SimulationMembership",
      },
    ],
    resolutionNotes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

export const SimulationEvent =
  mongoose.models.SimulationEvent ||
  mongoose.model("SimulationEvent", SimulationEventSchema);

export const SimulationMeetingSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationTeam",
      default: null,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationProject",
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    meetingType: {
      type: String,
      enum: [
        "STANDUP",
        "RETROSPECTIVE",
        "ARCHITECTURE_REVIEW",
        "DEMO",
        "POST_MORTEM",
        "SPRINT_PLANNING",
        "BACKLOG_REFINEMENT",
        "CLIENT_DEMO",
        "TECH_DESIGN_REVIEW",
        "INCIDENT_REVIEW",
        "ONE_ON_ONE",
        "TEAM_SYNC",
      ],
      default: "STANDUP",
    },
    scheduledTime: {
      type: Date,
      required: true,
      index: true,
    },
    durationMinutes: {
      type: Number,
      default: 30,
    },
    attendees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SimulationMembership",
      },
    ],
    optionalAttendees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SimulationMembership",
      },
    ],
    meetingLink: {
      type: String,
      trim: true,
    },
    agenda: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      default: "",
    },
    actionItems: [
      {
        description: { type: String, required: true, trim: true },
        assignee: { type: mongoose.Schema.Types.ObjectId, ref: "SimulationMembership" },
        dueDate: { type: Date },
        status: { type: String, enum: ["OPEN", "IN_PROGRESS", "DONE"], default: "OPEN" },
      },
    ],
    recordingUrl: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "SCHEDULED",
    },
  },
  { timestamps: true }
);

export const SimulationMeeting =
  mongoose.models.SimulationMeeting ||
  mongoose.model("SimulationMeeting", SimulationMeetingSchema);

export const SimulationMessageSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    channelName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    channelType: {
      type: String,
      enum: ["PUBLIC", "PRIVATE", "DIRECT", "ANNOUNCEMENT", "THREAD"],
      default: "PUBLIC",
    },
    senderMembership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationMembership",
      default: null,
    },
    isAIBot: {
      type: Boolean,
      default: false,
    },
    aiBotType: {
      type: String,
      enum: ["VIRTUAL_MANAGER", "TECHNICAL_LEAD", "SENIOR_DEVELOPER", "JUNIOR_DEVELOPER", "DESIGNER", "QA_ENGINEER", "DATABASE_ENGINEER", "DEVOPS_ENGINEER", "PROJECT_MANAGER", "BUSINESS_ANALYST", "PRODUCT_OWNER", "CLIENT", "TECHNICAL_REVIEWER", "MENTOR"],
      default: null,
    },
    senderName: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 4000,
    },
    attachments: [
      {
        url: String,
        name: String,
        type: String,
      },
    ],
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SimulationMembership",
      },
    ],
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationMessage",
      default: null,
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

SimulationMessageSchema.index({ simulation: 1, channelName: 1, sentAt: 1 });

export const SimulationMessage =
  mongoose.models.SimulationMessage ||
  mongoose.model("SimulationMessage", SimulationMessageSchema);

export const SimulationAssessmentSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    careerPath: {
      type: String,
      enum: CAREER_PATHS,
      required: true,
    },
    technicalScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    processAgileScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    collaborationScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    communicationScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    problemSolvingScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    overallScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    benchmarkGrade: {
      type: String,
      default: null,
    },
    verifiedCompetencies: [{ type: String, trim: true }],
    strengths: [{ type: String, trim: true }],
    areasForImprovement: [{ type: String, trim: true }],
    assessorType: {
      type: String,
      enum: ["AI_BOT", "FACULTY_MENTOR", "VIRTUAL_MANAGER", "PEER_REVIEW"],
      default: "AI_BOT",
    },
    assessorName: {
      type: String,
      default: "NovaBot Assessment Engine",
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

SimulationAssessmentSchema.index({ simulation: 1, student: 1 }, { unique: true });

export const SimulationAssessment =
  mongoose.models.SimulationAssessment ||
  mongoose.model("SimulationAssessment", SimulationAssessmentSchema);

// ============================================================================
// VIRTUAL COMPANY ENGINE - Realistic Company Profiles
// ============================================================================

export const VirtualCompanySchema = new mongoose.Schema(
  {
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualCompanyTemplate",
      required: true,
      index: true,
    },
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    logo: {
      type: String,
      trim: true,
      default: "",
    },
    brandTagline: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    industry: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    companyOverview: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    businessModel: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    headquarters: {
      type: String,
      trim: true,
      default: "Virtual Innovation District",
    },
    simulatedEmployeeCount: {
      type: Number,
      default: 450,
    },
    technologies: [{ type: String, trim: true }],
    departments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VirtualDepartment",
      },
    ],
    virtualManagers: [
      {
        name: { type: String, required: true },
        role: { type: String, enum: CAREER_PATHS, required: true },
        department: { type: mongoose.Schema.Types.ObjectId, ref: "VirtualDepartment" },
        personality: { type: String, trim: true },
        expertise: [{ type: String, trim: true }],
        avatar: { type: String, trim: true },
      },
    ],
    virtualColleagues: [
      {
        name: { type: String, required: true },
        role: { type: String, enum: CAREER_PATHS, required: true },
        department: { type: mongoose.Schema.Types.ObjectId, ref: "VirtualDepartment" },
        personality: { type: String, trim: true },
        expertise: [{ type: String, trim: true }],
        avatar: { type: String, trim: true },
        isAIAgent: { type: Boolean, default: true },
      },
    ],
    teams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SimulationTeam",
      },
    ],
    projects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SimulationProject",
      },
    ],
    announcements: [
      {
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true, trim: true },
        author: { type: String, required: true },
        priority: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "URGENT"], default: "MEDIUM" },
        publishedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date },
      },
    ],
    communicationChannels: [
      {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        type: { type: String, enum: ["PUBLIC", "PRIVATE", "DEPARTMENT", "PROJECT", "TEAM"], default: "PUBLIC" },
        allowedRoles: [{ type: String, enum: CAREER_PATHS }],
      },
    ],
    companyRules: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
        category: {
          type: String,
          enum: ["COMMUNICATION", "CODE_QUALITY", "SECURITY", "WORKFLOW", "MEETINGS", "OTHER"],
          default: "OTHER",
        },
      },
    ],
    professionalExpectations: [
      {
        expectation: { type: String, required: true },
        category: {
          type: String,
          enum: ["TECHNICAL", "COMMUNICATION", "PROCESS", "COLLABORATION", "LEARNING"],
          default: "TECHNICAL",
        },
      },
    ],
    performanceReviewCriteria: [
      {
        criterion: { type: String, required: true },
        weight: { type: Number, min: 1, max: 100, default: 10 },
        description: String,
      },
    ],
    lifecycleStatus: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "OPEN", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"],
      default: "PUBLISHED",
      index: true,
    },
  },
  { timestamps: true }
);

export const VirtualCompany =
  mongoose.models.VirtualCompany ||
  mongoose.model("VirtualCompany", VirtualCompanySchema);

// ============================================================================
// AI VIRTUAL WORKFORCE
// ============================================================================

export const VirtualAgentSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualCompany",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: [
        "VIRTUAL_MANAGER",
        "TECHNICAL_LEAD",
        "SENIOR_DEVELOPER",
        "JUNIOR_DEVELOPER",
        "DESIGNER",
        "QA_ENGINEER",
        "DATABASE_ENGINEER",
        "DEVOPS_ENGINEER",
        "PROJECT_MANAGER",
        "BUSINESS_ANALYST",
        "PRODUCT_OWNER",
        "CLIENT",
        "TECHNICAL_REVIEWER",
        "MENTOR",
      ],
      required: true,
      index: true,
    },
    careerPath: {
      type: String,
      enum: CAREER_PATHS,
      required: true,
      index: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualDepartment",
      default: null,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationTeam",
      default: null,
    },
    personality: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    expertise: [{ type: String, trim: true }],
    avatar: {
      type: String,
      trim: true,
    },
    systemPrompt: {
      type: String,
      trim: true,
      maxlength: 10000,
    },
    permissions: {
      canAssignTasks: { type: Boolean, default: false },
      canReviewWork: { type: Boolean, default: false },
      canProvideFeedback: { type: Boolean, default: true },
      canSimulateClient: { type: Boolean, default: false },
      canConductReviews: { type: Boolean, default: false },
      canApproveWork: { type: Boolean, default: false },
      canCreateEvents: { type: Boolean, default: false },
      accessibleChannels: [{ type: String, trim: true }],
    },
    configuration: {
      responseStyle: { type: String, enum: ["FORMAL", "CASUAL", "TECHNICAL", "MENTORING"], default: "TECHNICAL" },
      responseLength: { type: String, enum: ["BRIEF", "DETAILED", "COMPREHENSIVE"], default: "DETAILED" },
      availabilityHours: { type: String, default: "09:00-17:00" },
      timezone: { type: String, default: "UTC" },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export const VirtualAgent =
  mongoose.models.VirtualAgent ||
  mongoose.model("VirtualAgent", VirtualAgentSchema);

export const SimulationScenarioSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    scenarioType: {
      type: String,
      enum: [
        "ONBOARDING",
        "PROJECT_KICKOFF",
        "FEATURE_DEVELOPMENT",
        "BUG_INVESTIGATION",
        "INCIDENT_RESPONSE",
        "CODE_REVIEW",
        "ARCHITECTURE_DESIGN",
        "CLIENT_MEETING",
        "PERFORMANCE_REVIEW",
        "SPRINT_PLANNING",
        "RETROSPECTIVE",
        "TECHNICAL_INTERVIEW",
        "SECURITY_AUDIT",
        "DEPLOYMENT",
        "CROSS_FUNCTIONAL_COLLABORATION",
      ],
      required: true,
    },
    triggerConditions: {
      type: Map,
      of: String,
      default: {},
    },
    involvedAgents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VirtualAgent",
      },
    ],
    steps: [
      {
        stepNumber: { type: Number, required: true },
        agentRole: { type: String, enum: [...CAREER_PATHS, "VIRTUAL_MANAGER", "TECHNICAL_LEAD", "SENIOR_DEVELOPER", "JUNIOR_DEVELOPER", "DESIGNER", "QA_ENGINEER", "DATABASE_ENGINEER", "DEVOPS_ENGINEER", "PROJECT_MANAGER", "BUSINESS_ANALYST", "PRODUCT_OWNER", "CLIENT", "TECHNICAL_REVIEWER", "MENTOR"], required: true },
        action: { type: String, required: true },
        expectedStudentAction: { type: String, trim: true },
        successCriteria: { type: String, trim: true },
        timeoutMinutes: { type: Number, default: 30 },
        nextStepOnSuccess: { type: Number },
        nextStepOnFailure: { type: Number },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export const SimulationScenario =
  mongoose.models.SimulationScenario ||
  mongoose.model("SimulationScenario", SimulationScenarioSchema);

// ============================================================================
// SPECIALIST WORKSPACE CONFIGURATIONS
// ============================================================================

export const SpecialistWorkspaceConfigSchema = new mongoose.Schema(
  {
    careerPath: {
      type: String,
      enum: CAREER_PATHS,
      required: true,
      unique: true,
      index: true,
    },
    workspaceName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    supportedTools: [
      {
        toolName: { type: String, required: true },
        toolType: {
          type: String,
          enum: [
            "CODE_EDITOR",
            "DESIGN_CANVAS",
            "NETWORK_SIMULATOR",
            "DATABASE_EXPLORER",
            "TEST_RUNNER",
            "CI_CD_PIPELINE",
            "PROJECT_BOARD",
            "REQUIREMENTS_TOOL",
            "DATA_ANALYSIS",
            "TERMINAL",
            "API_TESTER",
            "DOCUMENTATION",
            "VERSION_CONTROL",
            "DEBUGGER",
            "MONITORING",
          ],
        },
        configuration: { type: Map, of: String, default: {} },
        isRequired: { type: Boolean, default: false },
      },
    ],
    defaultLayout: {
      type: String,
      enum: ["IDE_FOCUSED", "DESIGN_FOCUSED", "TERMINAL_FOCUSED", "DASHBOARD_FOCUSED", "HYBRID"],
      default: "HYBRID",
    },
    sampleProjects: [
      {
        name: { type: String, required: true },
        description: { type: String, trim: true },
        starterTemplate: { type: String, trim: true },
        difficulty: { type: String, enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"], default: "INTERMEDIATE" },
      },
    ],
    skillCategories: [
      {
        category: { type: String, required: true },
        skills: [{ type: String, trim: true }],
      },
    ],
    assessmentRubric: [
      {
        criterion: { type: String, required: true },
        weight: { type: Number, min: 1, max: 100, default: 10 },
        levels: [
          {
            level: { type: String, enum: ["BEGINNER", "DEVELOPING", "COMPETENT", "ADVANCED", "EXPERT"], required: true },
            description: { type: String, required: true },
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

export const SpecialistWorkspaceConfig =
  mongoose.models.SpecialistWorkspaceConfig ||
  mongoose.model("SpecialistWorkspaceConfig", SpecialistWorkspaceConfigSchema);

// ============================================================================
// CROSS-FUNCTIONAL PROJECT SUPPORT
// ============================================================================

export const CrossFunctionalProjectSchema = new mongoose.Schema(
  {
    simulation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VirtualSimulation",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    projectBrief: {
      type: String,
      trim: true,
      maxlength: 10000,
    },
    requiredRoles: [
      {
        careerPath: { type: String, enum: CAREER_PATHS, required: true },
        count: { type: Number, default: 1, min: 1 },
        isRequired: { type: Boolean, default: true },
        responsibilities: [{ type: String, trim: true }],
      },
    ],
    teams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SimulationTeam",
      },
    ],
    status: {
      type: String,
      enum: ["FORMING", "ACTIVE", "IN_REVIEW", "COMPLETED", "ARCHIVED"],
      default: "FORMING",
      index: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    targetCompletionDate: {
      type: Date,
      default: null,
    },
    actualCompletionDate: {
      type: Date,
      default: null,
    },
    deliverables: [
      {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        responsibleRoles: [{ type: String, enum: CAREER_PATHS }],
        acceptanceCriteria: [{ type: String, trim: true }],
        status: { type: String, enum: ["PENDING", "IN_PROGRESS", "IN_REVIEW", "APPROVED"], default: "PENDING" },
        submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "SimulationMembership" },
        submittedAt: { type: Date },
        reviewUrl: { type: String, trim: true },
      },
    ],
    milestones: [
      {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        targetDate: { type: Date, required: true },
        completedDate: { type: Date },
        status: { type: String, enum: ["UPCOMING", "IN_PROGRESS", "COMPLETED", "DELAYED"], default: "UPCOMING" },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export const CrossFunctionalProject =
  mongoose.models.CrossFunctionalProject ||
  mongoose.model("CrossFunctionalProject", CrossFunctionalProjectSchema);

export const ProjectTeamMembershipSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CrossFunctionalProject",
      required: true,
      index: true,
    },
    membership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SimulationMembership",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: CAREER_PATHS,
      required: true,
    },
    responsibilities: [{ type: String, trim: true }],
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
      default: null,
    },
    contributionScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    individualDeliverables: [
      {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        status: { type: String, enum: ["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "APPROVED"], default: "ASSIGNED" },
        evidenceUrl: { type: String, trim: true },
        submittedAt: { type: Date },
        reviewedAt: { type: Date },
        score: { type: Number, min: 0, max: 100 },
      },
    ],
  },
  { timestamps: true }
);

ProjectTeamMembershipSchema.index({ project: 1, membership: 1 }, { unique: true });

export const ProjectTeamMembership =
  mongoose.models.ProjectTeamMembership ||
  mongoose.model("ProjectTeamMembership", ProjectTeamMembershipSchema);