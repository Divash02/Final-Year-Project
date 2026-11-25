export type PortalRole =
  | "student"
  | "employer_owner"
  | "employer_recruiter"
  | "employer_supervisor"
  | "internship_coordinator"
  | "faculty_supervisor"
  | "hod"
  | "program_coordinator"
  | "college_admin"
  | "principal_management"
  | "super_admin";

export type ExperienceArea = "real_internships" | "virtual_workplace" | "industry_projects" | "career_explorer";

export type CareerPath = 
  | "frontend_developer"
  | "backend_developer"
  | "fullstack_developer"
  | "uiux_designer"
  | "database_engineer"
  | "network_engineer"
  | "qa_engineer"
  | "devops_engineer"
  | "cloud_engineer"
  | "ai_ml_engineer"
  | "data_engineer"
  | "project_manager"
  | "business_analyst"
  | "product_manager"
  | "technical_writer"
  | "systems_analyst"
  | "it_support_engineer"
  | "security_engineer"
  | "mobile_developer"
  | "embedded_engineer";

export type OpportunityStatus = "DRAFT" | "OPEN" | "CLOSING_SOON" | "CLOSED" | "PENDING_APPROVAL";

export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "SHORTLISTED"
  | "INTERVIEW_SCHEDULED"
  | "OFFER_EXTENDED"
  | "OFFER_ACCEPTED"
  | "OFFER_DECLINED"
  | "REJECTED"
  | "ACTIVE_PLACEMENT"
  | "COMPLETED"
  | "TERMINATED";

export type TaskStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface Company {
  id: string;
  name: string;
  logoUrl?: string;
  industry: string;
  size: "STARTUP" | "SME" | "LARGE" | "ENTERPRISE";
  website: string;
  location: string;
  isVerified: boolean;
  verificationStatus: "VERIFIED" | "PENDING" | "REJECTED";
  about: string;
  contactPerson: string;
  contactEmail: string;
  rating: number;
  activeOpportunitiesCount: number;
}

export interface InternshipOpportunity {
  id: string;
  companyId: string;
  companyName: string;
  companyLogo?: string;
  title: string;
  department: string;
  workMode: "REMOTE" | "HYBRID" | "ON_SITE";
  employmentType: "FULL_TIME" | "PART_TIME";
  location: string;
  stipendRange: string;
  durationMonths: number;
  availablePositions: number;
  applicantsCount: number;
  status: OpportunityStatus;
  deadline: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  skillsRequired: string[];
  postedDate: string;
  mentorName?: string;
  isVerifiedEmployer: boolean;
}

export interface ApplicationRecord {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  companyName: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentProgram: string;
  studentSemester: number;
  studentGpa: number;
  appliedDate: string;
  status: ApplicationStatus;
  coverLetter: string;
  resumeUrl: string;
  portfolioUrl?: string;
  interviewDate?: string;
  interviewMeetingLink?: string;
  interviewNotes?: string;
  offerLetterUrl?: string;
  offerDeadline?: string;
  stipendOffered?: string;
  rejectionReason?: string;
  supervisorName?: string;
}

export interface PlacementDetail {
  id: string;
  studentId: string;
  studentName: string;
  companyId: string;
  companyName: string;
  opportunityTitle: string;
  role: string;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "COMPLETED" | "ON_HOLD";
  industrySupervisor: {
    name: string;
    email: string;
    phone: string;
    designation: string;
  };
  facultySupervisor: {
    name: string;
    email: string;
    department: string;
  };
  totalRequiredHours: number;
  completedHours: number;
  credits: number;
  progressPercentage: number;
  onboardingStatus: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
  lastCheckinDate: string;
}

export interface LogbookEntry {
  id: string;
  placementId: string;
  studentName: string;
  weekNumber: number;
  dateRange: string;
  hoursWorked: number;
  tasksCompleted: string;
  keyLearnings: string;
  challengesFaced: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REVISION_REQUESTED";
  supervisorFeedback?: string;
  facultyFeedback?: string;
  submittedAt: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
  totalHours: number;
  status: "PRESENT" | "LATE" | "HALF_DAY" | "ABSENT" | "APPROVED";
  notes?: string;
  approvedBySupervisor: boolean;
}

export interface MeetingItem {
  id: string;
  title: string;
  type: "SUPERVISOR_1ON1" | "FACULTY_CHECKIN" | "TEAM_STANDUP" | "MIDTERM_EVALUATION";
  scheduledTime: string;
  durationMinutes: number;
  attendees: string[];
  meetingLink?: string;
  notes?: string;
  status: "UPCOMING" | "COMPLETED" | "CANCELLED";
}

export interface DocumentItem {
  id: string;
  title: string;
  category: "OFFER_LETTER" | "NOC" | "LEARNING_AGREEMENT" | "INSURANCE" | "COMPLETION_CERTIFICATE" | "REPORT";
  fileName: string;
  fileSize: string;
  uploadDate: string;
  uploadedBy: string;
  verified: boolean;
  downloadUrl: string;
}

export interface EvaluationRubric {
  id: string;
  studentName: string;
  evaluatorRole: "INDUSTRY_SUPERVISOR" | "FACULTY_SUPERVISOR";
  evaluatorName: string;
  evaluationType: "MID_TERM" | "FINAL";
  technicalCompetency: number; // 1-5
  communicationSkills: number;
  problemSolving: number;
  punctualityReliability: number;
  initiativeTeamwork: number;
  overallRating: number;
  writtenFeedback: string;
  submittedDate: string;
  gradeAwarded?: string;
}

export interface IndustryProject {
  id: string;
  title: string;
  sponsorCompany: string;
  industry: string;
  durationWeeks: number;
  teamSize: number;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  stipendOrPrize?: string;
  description: string;
  clientBrief: string;
  objectives: string[];
  deliverables: string[];
  status: "ACCEPTING_APPLICATIONS" | "IN_PROGRESS" | "REVIEW" | "COMPLETED";
  mentorName: string;
  mentorDesignation: string;
  requiredSkills: string[];
  applicationDeadline: string;
  enrolledStudentsCount: number;
}

// -------------------------------------------------------------
// VIRTUAL WORKPLACE SIMULATION TYPES
// -------------------------------------------------------------

export interface VirtualTeamMember {
  id: string;
  name: string;
  role: string;
  careerPath: CareerPath;
  avatar: string;
  status: "ONLINE" | "IN_MEETING" | "AWAY" | "OFFLINE";
  isAIPeer?: boolean;
  timeZone: string;
}

export interface VirtualTicket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  careerPath: CareerPath;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeName: string;
  storyPoints: number;
  epic: string;
  labels: string[];
  acceptanceCriteria: string[];
  submittedWork?: {
    pullRequestUrl?: string;
    figmaLink?: string;
    testSuiteSummary?: string;
    documentationLink?: string;
    notes?: string;
    submittedAt: string;
  };
  reviewNotes?: string;
  reviewerName?: string;
  reviewStatus?: "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
}

export interface VirtualIncident {
  id: string;
  title: string;
  severity: "SEV1_CRITICAL" | "SEV2_HIGH" | "SEV3_MEDIUM";
  status: "ACTIVE" | "INVESTIGATING" | "MITIGATED" | "RESOLVED";
  detectedAt: string;
  impact: string;
  scenarioDescription: string;
  recommendedActions: string[];
  careerPathRelevance: CareerPath;
}

export interface CompetencyScore {
  skill: string;
  level: number; // 1-100
  category: "TECHNICAL" | "DOMAIN" | "COLLABORATION" | "PROCESS";
  endorsementCount: number;
  verifiedInSimulation: boolean;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  ipAddress: string;
}

// -------------------------------------------------------------
// CAREER EXPLORER TYPES
// -------------------------------------------------------------

export interface CareerCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CareerRoleTechnicalSkill {
  skill: string;
  proficiency: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  isCore: boolean;
}

export interface CareerRoleProfessionalTool {
  name: string;
  category: "IDE_EDITOR" | "VERSION_CONTROL" | "CI_CD" | "TESTING" | "DESIGN" | "DATABASE" | "CLOUD" | "MONITORING" | "COLLABORATION" | "DOCUMENTATION" | "PROJECT_MANAGEMENT" | "OTHER";
  proficiency: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}

export interface CareerRoleExampleProject {
  title: string;
  description: string;
  technologies: string[];
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
}

export interface CareerRoleAssessmentCriterion {
  criterion: string;
  weight: number;
  description: string;
}

export interface CareerRolePortfolioEvidenceRequirement {
  evidenceType: "CODE_REPOSITORY" | "PULL_REQUEST" | "WORKING_APPLICATION" | "API_DOCUMENTATION" | "DESIGN_FILE" | "WIREFRAME" | "PROTOTYPE" | "NETWORK_DIAGRAM" | "TROUBLESHOOTING_REPORT" | "DATABASE_SCHEMA" | "SQL_QUERIES" | "TEST_PLAN" | "BUG_REPORT" | "CLOUD_ARCHITECTURE" | "PROJECT_DOCUMENT" | "MEETING_CONTRIBUTION" | "PRESENTATION" | "REVIEW" | "ASSESSMENT" | "OTHER";
  description: string;
  isRequired: boolean;
  minCount: number;
}

export interface CareerRoleProgression {
  level: "ENTRY" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "PRINCIPAL" | "DIRECTOR";
  title: string;
  typicalExperienceYears: number;
  keyResponsibilities: string[];
}

export interface CareerRole {
  id: string;
  code: string;
  name: string;
  category: CareerCategory;
  description: string;
  industry: string;
  responsibilities: string[];
  requiredTechnicalSkills: CareerRoleTechnicalSkill[];
  requiredSoftSkills: string[];
  professionalTools: CareerRoleProfessionalTool[];
  exampleProjects: CareerRoleExampleProject[];
  competencies: string[];
  assessmentCriteria: CareerRoleAssessmentCriterion[];
  portfolioEvidenceRequirements: CareerRolePortfolioEvidenceRequirement[];
  relatedJobTitles: string[];
  careerProgression: CareerRoleProgression[];
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentCareerInterest {
  id: string;
  student: string;
  careerRole: CareerRole;
  interestLevel: "EXPLORING" | "INTERESTED" | "COMMITTED" | "PRACTICING";
  startedAt: string;
  lastExploredAt: string;
  notes: string;
}

export interface CareerExplorationActivity {
  id: string;
  student: string;
  careerRole: { id: string; name: string; code: string };
  activityType: "VIEWED_ROLE" | "VIEWED_RESPONSIBILITIES" | "VIEWED_SKILLS" | "VIEWED_TOOLS" | "VIEWED_PROJECTS" | "VIEWED_PROGRESSION" | "COMPARED_CAREERS" | "SAVED_CAREER" | "STARTED_SIMULATION" | "COMPLETED_TASK" | "SUBMITTED_WORK" | "RECEIVED_FEEDBACK";
  metadata: Record<string, string>;
  createdAt: string;
}

export interface CareerExplorerDashboard {
  categories: CareerCategory[];
  featuredRoles: CareerRole[];
  totalRoles: number;
  myInterests: StudentCareerInterest[];
  recentActivity: CareerExplorationActivity[];
}

// -------------------------------------------------------------
// VIRTUAL COMPANY ENGINE TYPES
// -------------------------------------------------------------

export interface VirtualCompany {
  id: string;
  name: string;
  logo: string;
  brandTagline: string;
  industry: string;
  companyOverview: string;
  businessModel: string;
  headquarters: string;
  simulatedEmployeeCount: number;
  technologies: string[];
  departments: VirtualDepartment[];
  virtualManagers: VirtualColleague[];
  virtualColleagues: VirtualColleague[];
  teams: SimulationTeam[];
  projects: SimulationProject[];
  announcements: CompanyAnnouncement[];
  communicationChannels: CommunicationChannel[];
  companyRules: CompanyRule[];
  professionalExpectations: ProfessionalExpectation[];
  performanceReviewCriteria: PerformanceReviewCriterion[];
  lifecycleStatus: "DRAFT" | "PUBLISHED" | "OPEN" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
  template: { id: string; name: string; sector: string; templateCode: string };
  simulation: { id: string; simulationCode: string; companyName: string; status: string };
  createdAt: string;
  updatedAt: string;
}

export interface SimulationTask {
  id: string;
  title: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignee: string;
  dueDate: string;
  attachments?: string[];
  comments?: string[];
}

export interface SimulationSubmission {
  id: string;
  taskId: string;
  studentId: string;
  content: string;
  submittedAt: string;
  status: "PENDING" | "REVIEWED" | "APPROVED" | "REJECTED";
}

export interface SimulationReview {
  id: string;
  submissionId: string;
  reviewerId: string;
  feedback: string;
  rating: number;
  reviewedAt: string;
}

export interface SimulationEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  type: "MEETING" | "DEADLINE" | "REVIEW" | "MILESTONE";
}

export interface SimulationMeeting {
  id: string;
  title: string;
  agenda: string;
  scheduledAt: string;
  attendees: string[];
  notes?: string;
  actionItems?: string[];
}

export interface SimulationMessage {
  id: string;
  sender: string;
  content: string;
  channel: string;
  timestamp: string;
  mentions?: string[];
}

export interface SimulationMembership {
  id: string;
  studentId: string;
  simulationId: string;
  role: string;
  status: "ACTIVE" | "COMPLETED" | "WITHDRAWN";
  enrolledAt: string;
}

export interface SimulationAssessment {
  id: string;
  studentId: string;
  competencyArea: string;
  score: number;
  feedback: string;
  assessedAt: string;
}

export interface SimulationProject {
  id: string;
  name: string;
  description: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
  epic?: string;
  team?: string;
  targetReleaseDate?: string | null;
  requiredCareerPaths?: string[];
  milestones: { title: string; dueDate: string; completed: boolean }[];
  assignedTeamIds: string[];
  startDate: string;
  endDate?: string | null;
}

export interface CompetencyEvidence {
  id: string;
  studentId: string;
  competencyArea: string;
  evidenceType: string;
  evidenceUrl?: string;
  description: string;
  verified: boolean;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

export interface ProfessionalPortfolio {
  id: string;
  studentId: string;
  slug: string;
  title: string;
  summary: string;
  skills: string[];
  projects: { title: string; description: string; url?: string }[];
  competencies: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VirtualColleague {
  id: string;
  name: string;
  role: string;
  department: string;
  avatarUrl?: string;
  communicationStyle?: string;
  responsibilities?: string[];
  isAI: boolean;
}

export interface SimulationTeam {
  id: string;
  name: string;
  department: string;
  members: string[];
  lead: string | null;
  projectIds: string[];
}

export interface SimulationProject {
  id: string;
  name: string;
  description: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
  milestones: { title: string; dueDate: string; completed: boolean }[];
  assignedTeamIds: string[];
  startDate: string;
  endDate?: string | null;
}

export interface VirtualDepartment {
  id: string;
  name: string;
  description: string;
  openRoles: CareerPath[];
  departmentHead: string | null;
  workflowConfig: {
    sprintLengthDays: number;
    standupTime: string;
    retrospectiveEnabled: boolean;
    codeReviewRequired: boolean;
    ciCdEnabled: boolean;
  };
}

export interface CompanyAnnouncement {
  title: string;
  content: string;
  author: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  publishedAt: string;
  expiresAt: string | null;
}

export interface CommunicationChannel {
  name: string;
  description: string;
  type: "PUBLIC" | "PRIVATE" | "DEPARTMENT" | "PROJECT" | "TEAM";
  allowedRoles: CareerPath[];
}

export interface CompanyRule {
  title: string;
  description: string;
  category: "COMMUNICATION" | "CODE_QUALITY" | "SECURITY" | "WORKFLOW" | "MEETINGS" | "OTHER";
}

export interface ProfessionalExpectation {
  expectation: string;
  category: "TECHNICAL" | "COMMUNICATION" | "PROCESS" | "COLLABORATION" | "LEARNING";
}

export interface PerformanceReviewCriterion {
  criterion: string;
  weight: number;
  description: string;
}

// -------------------------------------------------------------
// AI VIRTUAL WORKFORCE TYPES
// -------------------------------------------------------------

export interface VirtualAgent {
  id: string;
  simulation: string;
  company: string | null;
  name: string;
  role: "VIRTUAL_MANAGER" | "TECHNICAL_LEAD" | "SENIOR_DEVELOPER" | "JUNIOR_DEVELOPER" | "DESIGNER" | "QA_ENGINEER" | "DATABASE_ENGINEER" | "DEVOPS_ENGINEER" | "PROJECT_MANAGER" | "BUSINESS_ANALYST" | "PRODUCT_OWNER" | "CLIENT" | "TECHNICAL_REVIEWER" | "MENTOR";
  careerPath: CareerPath;
  department: string | null;
  team: string | null;
  personality: string;
  expertise: string[];
  avatar: string;
  systemPrompt: string;
  permissions: {
    canAssignTasks: boolean;
    canReviewWork: boolean;
    canProvideFeedback: boolean;
    canSimulateClient: boolean;
    canConductReviews: boolean;
    canApproveWork: boolean;
    canCreateEvents: boolean;
    accessibleChannels: string[];
  };
  configuration: {
    responseStyle: "FORMAL" | "CASUAL" | "TECHNICAL" | "MENTORING";
    responseLength: "BRIEF" | "DETAILED" | "COMPREHENSIVE";
    availabilityHours: string;
    timezone: string;
  };
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationScenario {
  id: string;
  simulation: string;
  name: string;
  description: string;
  scenarioType: "ONBOARDING" | "PROJECT_KICKOFF" | "FEATURE_DEVELOPMENT" | "BUG_INVESTIGATION" | "INCIDENT_RESPONSE" | "CODE_REVIEW" | "ARCHITECTURE_DESIGN" | "CLIENT_MEETING" | "PERFORMANCE_REVIEW" | "SPRINT_PLANNING" | "RETROSPECTIVE" | "TECHNICAL_INTERVIEW" | "SECURITY_AUDIT" | "DEPLOYMENT" | "CROSS_FUNCTIONAL_COLLABORATION";
  triggerConditions: Record<string, string>;
  involvedAgents: VirtualAgent[];
  steps: ScenarioStep[];
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioStep {
  stepNumber: number;
  agentRole: string;
  action: string;
  expectedStudentAction: string;
  successCriteria: string;
  timeoutMinutes: number;
  nextStepOnSuccess: number | null;
  nextStepOnFailure: number | null;
}

// -------------------------------------------------------------
// SPECIALIST WORKSPACE TYPES
// -------------------------------------------------------------

export interface SpecialistWorkspaceConfig {
  id: string;
  careerPath: CareerPath;
  workspaceName: string;
  description: string;
  supportedTools: SpecialistTool[];
  defaultLayout: "IDE_FOCUSED" | "DESIGN_FOCUSED" | "TERMINAL_FOCUSED" | "DASHBOARD_FOCUSED" | "HYBRID";
  sampleProjects: SampleProject[];
  skillCategories: SkillCategory[];
  assessmentRubric: AssessmentRubric[];
  createdAt: string;
  updatedAt: string;
}

export interface SpecialistTool {
  toolName: string;
  toolType: "CODE_EDITOR" | "DESIGN_CANVAS" | "NETWORK_SIMULATOR" | "DATABASE_EXPLORER" | "TEST_RUNNER" | "CI_CD_PIPELINE" | "PROJECT_BOARD" | "REQUIREMENTS_TOOL" | "DATA_ANALYSIS" | "TERMINAL" | "API_TESTER" | "DOCUMENTATION" | "VERSION_CONTROL" | "DEBUGGER" | "MONITORING";
  configuration: Record<string, string>;
  isRequired: boolean;
}

export interface SampleProject {
  name: string;
  description: string;
  starterTemplate: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
}

export interface SkillCategory {
  category: string;
  skills: string[];
}

export interface AssessmentRubric {
  criterion: string;
  weight: number;
  levels: {
    level: "BEGINNER" | "DEVELOPING" | "COMPETENT" | "ADVANCED" | "EXPERT";
    description: string;
  }[];
}
