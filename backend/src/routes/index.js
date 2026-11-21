import { registerHealthRoutes } from "./health.js";
import { registerAuthRoutes } from "./auth.js";
import { registerAdministrationRoutes } from "./administration.js";
import { registerAcademicsRoutes } from "./academics.js";
import { registerAcademicCalendarRoutes } from "./calendar.js";
import { registerLearningMaterialRoutes } from "./materials.js";
import { registerAssignmentRoutes } from "./assignments.js";
import { registerLmsRoutes } from "./lms.js";
import { registerQuizRoutes } from "./quizzes.js";
import { registerTimetableRoutes } from "./timetable.js";
import { registerMyTimetableRoutes } from "./myTimetable.js";
import { registerFileRoutes } from "./files.js";
import { registerNoticesRoutes } from "./notices.js";
import { registerCommunicationRoutes } from "./communication.js";
import { registerWorkflowRoutes } from "./workflow.js";
import { registerReportingRoutes } from "./reporting.js";
import { registerAdvancedAnalyticsRoutes } from "./advancedAnalytics.js";
import { registerProfileRoutes } from "./profile.js";
import { registerDepartmentalRoutes } from "./departmental.js";
import { registerAttendanceRoutes } from "./attendance.js";
import { registerFinanceRoutes } from "./finance.js";
import { registerAdmissionsRoutes } from "./admissions.js";
import { registerExaminationRoutes } from "./examinations.js";
import { registerExamSeatingRoutes } from "./examSeating.js";
import { registerCodingRoutes } from "./coding.js";
import { registerAssessmentRoutes } from "./assessments.js";
import { registerAIRoutes } from "./ai.js";
import { registerHRRoutes } from "./hr.js";
import { registerLibraryRoutes } from "./library.js";
import { registerFolderRoutes } from "./folders.js";
import { registerDocumentRoutes } from "./documents.js";
import { registerFacilitiesRoutes } from "./facilities.js";
import { registerConnectRoutes } from "./connect.js";
import { registerFacultyProgressRoutes } from "./facultyProgress.js";
import { registerLessonPlanningRoutes } from "./lessonPlanning.js";
import { registerStudentAdvisingRoutes } from "./studentAdvising.js";
import { registerLeaveSubstitutionRoutes } from "./leaveSubstitution.js";
import { registerFacultyWorkloadRoutes } from "./facultyWorkload.js";
import { registerFacultyProjectsRoutes } from "./facultyProjects.js";
import { registerFacultyAlertsRoutes } from "./facultyAlerts.js";
import { registerEarlyWarningRoutes } from "./earlyWarning.js";
import { registerStudyPlannerRoutes } from "./studyPlanner.js";
import { registerStudentJourneyRoutes } from "./studentJourney.js";
import { registerInternshipRoutes } from "./internship.js";
import { registerMentorshipRoutes } from "./mentorship.js";
import { registerStudentVerificationRoutes } from "./studentVerification.js";
import { registerReadinessAssessmentRoutes } from "./readinessAssessment.js";
import { registerResearchRoutes } from "./research.js";
import { registerDigitalCredentialsRoutes } from "./digitalCredentials.js";
import { registerCampusSafetyRoutes } from "./campusSafety.js";
import { registerGraduationRoutes } from "./graduation.js";

/**
 * Single domain-route registry.
 *
 * `app.js` stays infrastructure-only: it mounts middleware and calls this
 * function once. Each domain owns its own route file, so adding a module is a
 * one-line change here instead of another edit to the application bootstrap.
 *
 * Ordering matters in two places and is preserved from the previous inline
 * registry:
 *   - the weekly planner / quiz runtime are registered before the reporting
 *     reads that summarise their records;
 *   - the literal seating/venue paths are registered before the examination
 *     module's `/api/exams/:id` so they are never captured as an id.
 */
export function registerRoutes(app) {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerAdministrationRoutes(app);
  registerAcademicsRoutes(app);
  registerAcademicCalendarRoutes(app);
  registerLearningMaterialRoutes(app);
  registerAssignmentRoutes(app);
  registerLmsRoutes(app);
  registerQuizRoutes(app);
  registerTimetableRoutes(app);
  registerMyTimetableRoutes(app);
  registerFileRoutes(app);
  registerNoticesRoutes(app);
  registerCommunicationRoutes(app);
  registerWorkflowRoutes(app);
  registerReportingRoutes(app);
  registerAdvancedAnalyticsRoutes(app);
  registerFinanceRoutes(app);
  registerAdmissionsRoutes(app);
  registerAssessmentRoutes(app);
  registerExamSeatingRoutes(app);
  registerExaminationRoutes(app);
  registerProfileRoutes(app);
  registerDepartmentalRoutes(app);
  registerAttendanceRoutes(app);
  registerCodingRoutes(app);
  registerAIRoutes(app);
  registerHRRoutes(app);
  registerLibraryRoutes(app);
  registerFolderRoutes(app);
  registerDocumentRoutes(app);
  registerFacilitiesRoutes(app);
  registerConnectRoutes(app);
  registerFacultyProgressRoutes(app);
  registerLessonPlanningRoutes(app);
  registerStudentAdvisingRoutes(app);
  registerLeaveSubstitutionRoutes(app);
  registerFacultyWorkloadRoutes(app);
  registerFacultyProjectsRoutes(app);
  registerFacultyAlertsRoutes(app);
  registerEarlyWarningRoutes(app);
  registerStudyPlannerRoutes(app);
  registerStudentJourneyRoutes(app);
  registerInternshipRoutes(app);
  registerMentorshipRoutes(app);
  registerStudentVerificationRoutes(app);
  registerReadinessAssessmentRoutes(app);
  registerResearchRoutes(app);
  registerDigitalCredentialsRoutes(app);
  registerCampusSafetyRoutes(app);
  registerGraduationRoutes(app);
}

export default registerRoutes;