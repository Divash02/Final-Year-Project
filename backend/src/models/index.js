export { User } from "./User.js";
export { Student } from "./Student.js";
export { Staff } from "./Staff.js";
export { Employee } from "./Employee.js";
export { LeaveRequest } from "./LeaveRequest.js";
export {
  LibraryBook,
  LibraryBookCopy,
  LibraryLoan,
  LibraryReservation,
  LibraryFine,
  LibraryFinePayment,
  LibraryPolicy,
} from "./Library.js";
export { Department } from "./Department.js";
export { Program } from "./Program.js";
export { Section } from "./Section.js";
export { Course } from "./Course.js";
export { Enrollment } from "./Enrollment.js";
export { CourseTeachingAssignment } from "./CourseTeachingAssignment.js";
export { FacultySubjectAssignment } from "./FacultySubjectAssignment.js";
export {
  Attendance,
  ATTENDANCE_STATUSES,
  ATTENDING_STATUSES,
} from "./Attendance.js";
export {
  AttendanceSession,
  CLASS_TYPES,
} from "./AttendanceSession.js";
export { Assignment, ASSIGNMENT_TYPES } from "./Assignment.js";
export { Submission, SUBMISSION_STATUSES } from "./Submission.js";
export {
  LearningMaterial,
  MATERIAL_STATUSES,
  MATERIAL_TYPES,
} from "./LearningMaterial.js";
export { CourseWeek, WEEK_STATUSES } from "./CourseWeek.js";
export { LearningObjective } from "./LearningObjective.js";
export {
  Quiz,
  QUIZ_STATUSES,
  RESULT_RELEASE_POLICIES,
  MULTI_SELECT_GRADING,
} from "./Quiz.js";
export {
  QuizQuestion,
  QUESTION_TYPES,
  QUESTION_DIFFICULTIES,
  AUTO_GRADED_TYPES,
  MANUAL_GRADED_TYPES,
} from "./QuizQuestion.js";
export { QuizAttempt, ATTEMPT_STATUSES } from "./QuizAttempt.js";
export { CourseAnnouncement } from "./CourseAnnouncement.js";
export { CourseTemplate } from "./CourseTemplate.js";
export {
  TeachingProgress,
  TEACHING_UNIT_LABELS,
} from "./TeachingProgress.js";
export { Grade } from "./Grade.js";
export { Timetable } from "./Timetable.js";
export { Exam } from "./Exam.js";
export { ExamResult, EXAM_RESULT_WORKFLOW_STATUSES } from "./ExamResult.js";
export { ExamSeatingPlan } from "./ExamSeatingPlan.js";
export { Invoice } from "./Invoice.js";
export { Payment } from "./Payment.js";
export { WorkflowCase } from "./WorkflowCase.js";
export { WorkflowDefinition } from "./WorkflowDefinition.js";
export { WorkflowInstance } from "./WorkflowInstance.js";
export { Folder } from "./Folder.js";
export { Document } from "./Document.js";
export { Notice } from "./Notice.js";
export { Message } from "./Message.js";
export { Mail } from "./Mail.js";
export { Notification } from "./Notification.js";
export { AuditLog } from "./AuditLog.js";
export { InstitutionSetting } from "./InstitutionSetting.js";
export { Session } from "./Session.js";
export { PasswordResetToken } from "./PasswordResetToken.js";
export { Room } from "./Room.js";
export {
  Building,
  FacilityLab,
  FacilityReservation,
  FacilityMaintenanceRequest,
  FacilityAsset,
  TransportVehicle,
  TransportRoute,
} from "./Facilities.js";
export {
  AcademicCalendarEvent,
  ACADEMIC_EVENT_TYPES,
} from "./AcademicCalendarEvent.js";
export {
  AcademicCalendarDocument,
  ACADEMIC_DOCUMENT_CATEGORIES,
  ACADEMIC_DOCUMENT_LIFECYCLE,
} from "./AcademicCalendarDocument.js";
export {
  AdmissionApplication,
  ADMISSION_APPLICATION_STATUSES,
} from "./AdmissionApplication.js";
export { StoredFile } from "./StoredFile.js";
export { CodingProject, CODING_PROJECT_TYPES } from "./CodingProject.js";
export { CodingShare, CODING_SHARE_TYPES } from "./CodingShare.js";
export {
  CodingAssignment,
  CODING_ASSIGNMENT_STATUSES,
} from "./CodingAssignment.js";
export {
  CodingSubmission,
  CODING_SUBMISSION_STATUSES,
} from "./CodingSubmission.js";
export { CodingDraft } from "./CodingDraft.js";
export {
  CodingExecution,
  CODING_EXECUTION_STATUSES,
} from "./CodingExecution.js";
export {
  normalizeAudienceInput,
  describeAudience,
  isEmptySpecificTarget,
  AUDIENCE_TARGET_TYPES,
} from "./Audience.js";

export {
  ClassSummary,
  CLASS_SUMMARY_STATUSES,
} from "./ClassSummary.js";

export {
  DiscussionThread,
  DiscussionReply,
} from "./Discussion.js";

export {
  ProjectProposal,
  PROJECT_PROPOSAL_STATUSES,
} from "./ProjectProposal.js";
export { AdvisingSession } from "./AdvisingSession.js";
export { ClassSubstitution } from "./ClassSubstitution.js";
export { FacultyWorkload } from "./FacultyWorkload.js";

export {
  AcademicDecision,
  AcademicDecisionVersion,
  ACADEMIC_DECISION_CATEGORIES,
  ACADEMIC_DECISION_LIFECYCLE,
} from "./AcademicDecision.js";

export {
  Group,
  GROUP_STATUSES,
} from "./Group.js";

export {
  GroupMembershipRequest,
  GROUP_MEMBERSHIP_TYPES,
  GROUP_MEMBERSHIP_STATUSES,
} from "./GroupMembershipRequest.js";

export {
  ActionItem,
  ACTION_ITEM_TYPES,
  ACTION_ITEM_STATUSES,
} from "./ActionItem.js";

export {
  AcknowledgementRecord,
} from "./AcknowledgementRecord.js";

export { CourseAssessmentComponent } from "./CourseAssessmentComponent.js";
export {
  StudentAssessmentMark,
  ASSESSMENT_WORKFLOW_STATUSES,
} from "./StudentAssessmentMark.js";

// AI Intelligence, Cybersecurity & Advanced IT Ecosystem
export { AIActivityLog } from "./AIActivityLog.js";
export { AIJob, AI_JOB_STATUSES } from "./AIJob.js";
export { AnomalyAlert } from "./AnomalyAlert.js";
export { ITAsset, ASSET_CATEGORIES, ASSET_STATUSES } from "./ITAsset.js";
export { SoftwareLicense } from "./SoftwareLicense.js";
export { ITTicket, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "./ITTicket.js";
export { SecurityEvent, SECURITY_EVENT_TYPES } from "./SecurityEvent.js";
export { DigitalCredential, CREDENTIAL_TYPES, CREDENTIAL_STATUSES } from "./DigitalCredential.js";
export { AttendanceQRSession } from "./AttendanceQRSession.js";
export { LoginAttempt } from "./LoginAttempt.js";
export { ClassroomBoard } from "./ClassroomBoard.js";
export { UserActivityEvent } from "./UserActivityEvent.js";
export { UserSession } from "./UserSession.js";
export { SystemMetric } from "./SystemMetric.js";
export { PerformanceAlert } from "./PerformanceAlert.js";
export {
  VirtualSession,
  VIRTUAL_SESSION_TYPES,
  VIRTUAL_SESSION_STATUSES,
} from "./VirtualSession.js";

export { AcademicRiskIndicator } from "./AcademicRiskIndicator.js";
export { AcademicIntervention } from "./AcademicIntervention.js";

// Internships & Industry Experience: Real Internships Domain
export {
  Employer,
  InternshipCompany,
  EmployerUser,
  EmployerVerification,
  InternshipOpportunity,
  InternshipSupervisor,
  InternshipApplication,
  InternshipInterview,
  InternshipOffer,
  InternshipPlacement,
  InternshipAgreement,
  InternshipTask,
  InternshipLogbook,
  InternshipProgressReport,
  InternshipAttendance,
  InternshipReport,
  InternshipEvaluation,
  InternshipCredential,
} from "./Internship.js";

// Internships & Industry Experience: Industry Projects Domain
export {
  IndustryProject,
  IndustryProjectMembership,
  IndustryProjectTask,
  IndustryProjectSubmission,
  IndustryProjectEvaluation,
} from "./IndustryProject.js";

// Internships & Industry Experience: Virtual Workplace Simulations Domain
export {
  VirtualCompanyTemplate,
  VirtualDepartment,
  VirtualSimulation,
  SimulationApplication,
  SimulationMembership,
  SimulationTeam,
  SimulationProject,
  SimulationTask,
  SimulationSubmission,
  SimulationReview,
  SimulationEvent,
  SimulationMeeting,
  SimulationMessage,
  SimulationAssessment,
  VirtualCompany,
  VirtualAgent,
  SimulationScenario,
  SpecialistWorkspaceConfig,
  CrossFunctionalProject,
  ProjectTeamMembership,
  CAREER_PATHS,
} from "./VirtualWorkplace.js";

// Career Explorer Domain
export {
  CareerCategory,
  CareerRole,
  StudentCareerInterest,
  CareerExplorationActivity,
} from "./Career.js";

// Internships & Industry Experience: Competencies & Portfolio
export {
  Competency,
  CompetencyEvidence,
  ProfessionalPortfolio,
} from "./Competency.js";

// Faculty Mentoring Domain
export {
  MentorshipAssignment,
  MentoringSession,
  FacultyObservation,
} from "./Mentorship.js";

// Career Readiness Assessment Domain
export {
  ReadinessRecommendation,
  CareerReadinessAssessment,
  ReadinessDecision,
} from "./ReadinessAssessment.js";

// Student Identity Verification Domain
export {
  StudentIdentityVerification,
  VerificationHistory,
} from "./StudentVerification.js";

export { ResearchMilestone, ResearchMeeting, ResearchProject } from "./ResearchProject.js";
export { CampusIncident } from "./CampusIncident.js";
export { IncidentUpdate } from "./IncidentUpdate.js";
export { IncidentMessage } from "./IncidentMessage.js";
export { GraduationClearance, GraduationApplication } from "./GraduationApplication.js";
export { StudyActivity, StudyPlan } from "./StudyPlan.js";
