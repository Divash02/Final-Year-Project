import React, { Suspense, lazy, useEffect, useState, useCallback } from "react";
import { AuthUser } from "./types";
import { CollegeOSProvider, useCollegeOS } from "./context/CollegeOSContext";
import { ToastProvider, useToast } from "./components/ui/ToastContainer";
import { LoginView } from "./components/auth/LoginView";
import { ForcePasswordChangeModal } from "./components/auth/ForcePasswordChangeModal";
import { routeToView } from "./lib/appRoutes";
import { SplashScreen } from "./components/pages/SplashScreen";
import { WelcomePage } from "./components/pages/WelcomePage";
import { SessionGuard } from "./components/session/SessionGuard";

// Helper for code-splitting named exports cleanly
const lazyModule = <T,>(
  factory: () => Promise<T>,
  selector: (m: T) => React.ComponentType<any>,
) => lazy(() => factory().then((m) => ({ default: selector(m) })));

// Lazy-load post-login AppShell and heavy workspace views so initial page load
// for LoginView is instantaneous and does not compile/download megabytes of modules.
const AppShell = lazyModule(
  () => import("./components/layout/AppShell"),
  (m) => m.AppShell,
);
const DashboardWorkspaceView = lazyModule(
  () => import("./components/modules/DashboardWorkspaceView"),
  (m) => m.DashboardWorkspaceView,
);
const StudentDirectoryWorkspaceView = lazyModule(
  () => import("./components/modules/StudentDirectoryWorkspaceView"),
  (m) => m.StudentDirectoryWorkspaceView,
);
const AdmissionsWorkspaceView = lazyModule(
  () => import("./components/modules/AdmissionsWorkspaceView"),
  (m) => m.AdmissionsWorkspaceView,
);
const AttendanceWorkspaceView = lazyModule(
  () => import("./components/modules/AttendanceWorkspaceView"),
  (m) => m.AttendanceWorkspaceView,
);
const AttendanceRecordsWorkspaceView = lazyModule(
  () => import("./components/modules/AttendanceRecordsWorkspaceView"),
  (m) => m.AttendanceRecordsWorkspaceView,
);
const TimetableWorkspaceView = lazyModule(
  () => import("./components/modules/TimetableWorkspaceView"),
  (m) => m.TimetableWorkspaceView,
);
const FacultyMyTimetableView = lazyModule(
  () => import("./components/modules/FacultyMyTimetableView"),
  (m) => m.FacultyMyTimetableView,
);
const StudentTimetableView = lazyModule(
  () => import("./components/modules/StudentTimetableView"),
  (m) => m.StudentTimetableView,
);
const LearningWorkspaceView = lazyModule(
  () => import("./components/modules/LearningWorkspaceView"),
  (m) => m.LearningWorkspaceView,
);
const MyCoursesView = lazyModule(
  () => import("./components/modules/MyCoursesView"),
  (m) => m.MyCoursesView,
);
const ConnectWorkspaceView = lazyModule(
  () => import("./components/modules/connect/ConnectWorkspaceView"),
  (m) => m.ConnectWorkspaceView,
);
const OnlineClassJoinPage = lazyModule(
  () => import("./components/modules/connect/OnlineClassJoinPage"),
  (m) => m.OnlineClassJoinPage,
);
const OnlineClassPreJoinPage = lazyModule(
  () => import("./components/modules/connect/OnlineClassPreJoinPage"),
  (m) => m.OnlineClassPreJoinPage,
);
const OnlineClassRoomPage = lazyModule(
  () => import("./components/modules/connect/OnlineClassRoomPage"),
  (m) => m.OnlineClassRoomPage,
);
const OnlineClassWaitingRoomPage = lazyModule(
  () => import("./components/modules/connect/OnlineClassWaitingRoomPage"),
  (m) => m.OnlineClassWaitingRoomPage,
);
const OnlineClassClassroomPage = lazyModule(
  () => import("./components/modules/connect/OnlineClassClassroomPage"),
  (m) => m.default,
);
const LmsWorkspace = lazyModule(
  () => import("./components/modules/lms/LmsWorkspace"),
  (m) => m.LmsWorkspace,
);
const QuizManagementWorkspace = lazyModule(
  () => import("./components/modules/lms/QuizManagementWorkspace"),
  (m) => m.QuizManagementWorkspace,
);
const ExaminationWorkspaceView = lazyModule(
  () => import("./components/modules/ExaminationWorkspaceView"),
  (m) => m.ExaminationWorkspaceView,
);
const FinanceWorkspaceView = lazyModule(
  () => import("./components/modules/FinanceWorkspaceView"),
  (m) => m.FinanceWorkspaceView,
);
const WorkflowWorkspaceView = lazyModule(
  () => import("./components/modules/WorkflowWorkspaceView"),
  (m) => m.WorkflowWorkspaceView,
);
const CollegeMailView = lazyModule(
  () => import("./components/modules/CollegeMailView"),
  (m) => m.CollegeMailView,
);
const EmailSignatureSettingsView = lazyModule(
  () => import("./components/modules/EmailSignatureSettingsView"),
  (m) => m.EmailSignatureSettingsView,
);
const AcademicCalendarView = lazyModule(
  () => import("./components/modules/AcademicCalendarView"),
  (m) => m.AcademicCalendarView,
);
const AcademicCalendarDocumentsView = lazyModule(
  () => import("./components/modules/AcademicCalendarDocumentsView"),
  (m) => m.AcademicCalendarDocumentsView,
);

const SmartDocumentCentreView = lazyModule(
  () => import("./components/modules/SmartDocumentCentreView"),
  (m) => m.SmartDocumentCentreView,
);
const MessagesView = lazyModule(
  () => import("./components/modules/MessagesView"),
  (m) => m.MessagesView,
);
const NoticesView = lazyModule(
  () => import("./components/modules/NoticesView"),
  (m) => m.NoticesView,
);
const FacilitiesLibraryView = lazyModule(
  () => import("./components/modules/FacilitiesLibraryView"),
  (m) => m.FacilitiesLibraryView,
);
const AnalyticsWorkspaceView = lazyModule(
  () => import("./components/modules/AnalyticsWorkspaceView"),
  (m) => m.AnalyticsWorkspaceView,
);
const NextGenSuiteView = lazyModule(
  () => import("./components/modules/NextGenSuiteView"),
  (m) => m.NextGenSuiteView,
);
const UserManagementView = lazyModule(
  () => import("./components/modules/UserManagementView"),
  (m) => m.UserManagementView,
);
const AccountProfileView = lazyModule(
  () => import("./components/modules/AccountProfileView"),
  (m) => m.AccountProfileView,
);
const CodingLabWorkspace = lazyModule(
  () => import("./components/modules/coding/CodingLabWorkspace"),
  (m) => m.CodingLabWorkspace,
);
const FacultyAssessmentWorkspaceView = lazyModule(
  () => import("./components/modules/FacultyAssessmentWorkspaceView"),
  (m) => m.FacultyAssessmentWorkspaceView,
);
const StudentProgressView = lazyModule(
  () => import("./components/modules/StudentProgressView"),
  (m) => m.StudentProgressView,
);
const LessonPlanningView = lazyModule(
  () => import("./components/modules/LessonPlanningView"),
  (m) => m.LessonPlanningView,
);
const StudentAdvisingView = lazyModule(
  () => import("./components/modules/StudentAdvisingView"),
  (m) => m.StudentAdvisingView,
);
const LeaveSubstitutionView = lazyModule(
  () => import("./components/modules/LeaveSubstitutionView"),
  (m) => m.LeaveSubstitutionView,
);
const FacultyWorkloadView = lazyModule(
  () => import("./components/modules/FacultyWorkloadView"),
  (m) => m.FacultyWorkloadView,
);
const ResearchProjectsView = lazyModule(
  () => import("./components/modules/ResearchProjectsView"),
  (m) => m.ResearchProjectsView,
);
const FacultyAlertsView = lazyModule(
  () => import("./components/modules/FacultyAlertsView"),
  (m) => m.FacultyAlertsView,
);
const ResourceBookingView = lazyModule(
  () => import("./components/modules/ResourceBookingView"),
  (m) => m.ResourceBookingView,
);
const HRDashboardView = lazyModule(
  () => import("./components/modules/hr/HRDashboardView"),
  (m) => m.HRDashboardView,
);
const StaffPortalView = lazyModule(
  () => import("./components/modules/StaffPortalView"),
  (m) => m.StaffPortalView,
);
const LeaveApprovalWorkspace = lazyModule(
  () => import("./components/modules/hr/LeaveApprovalWorkspace"),
  (m) => m.LeaveApprovalWorkspace,
);
const CareerPlacementView = lazyModule(
  () => import("./components/modules/career/CareerPlacementView"),
  (m) => m.CareerPlacementView,
);
const HostelAccommodationView = lazyModule(
  () => import("./components/modules/hostel/HostelAccommodationView"),
  (m) => m.HostelAccommodationView,
);
const LibraryLearningResourcesView = lazyModule(
  () => import("./components/modules/library/LibraryLearningResourcesView"),
  (m) => m.LibraryLearningResourcesView,
);
const StudentClubsEventsView = lazyModule(
  () => import("./components/modules/clubs/StudentClubsEventsView"),
  (m) => m.StudentClubsEventsView,
);
const WorkflowAutomationView = lazyModule(
  () => import("./components/modules/workflow/WorkflowAutomationView"),
  (m) => m.WorkflowAutomationView,
);
const StudentLifecycleView = lazyModule(
  () => import("./components/modules/student-life/StudentLifecycleView"),
  (m) => m.StudentLifecycleView,
);
const CampusFacilitiesExtendedView = lazyModule(
  () => import("./components/modules/campus/CampusFacilitiesExtendedView"),
  (m) => m.CampusFacilitiesExtendedView,
);
const NotificationsPage = lazyModule(
  () => import("./components/modules/NotificationsPage"),
  (m) => m.NotificationsPage,
);
const EarlyWarningView = lazyModule(
  () => import("./components/modules/early-warning/EarlyWarningView"),
  (m) => m.EarlyWarningView,
);
const StudyPlannerView = lazyModule(
  () => import("./components/modules/study-planner/StudyPlannerView"),
  (m) => m.StudyPlannerView,
);
const StudentJourneyView = lazyModule(
  () => import("./components/modules/student-life/StudentJourneyView"),
  (m) => m.StudentJourneyView,
);
const InternshipManagementView = lazyModule(
  () => import("./components/modules/internship/InternshipManagementView"),
  (m) => m.InternshipManagementView,
);
const ResearchProjectsViewNew = lazyModule(
  () => import("./components/modules/research/ResearchProjectsView"),
  (m) => m.ResearchProjectsView,
);
const DigitalCredentialsView = lazyModule(
  () => import("./components/modules/credentials/DigitalCredentialsView"),
  (m) => m.DigitalCredentialsView,
);
const CampusSafetyView = lazyModule(
  () => import("./components/modules/safety/CampusSafetyView"),
  (m) => m.CampusSafetyView,
);
const ReportIncidentView = lazyModule(
  () => import("./components/modules/safety/ReportIncidentView"),
  (m) => m.ReportIncidentView,
);
const GraduationConvocationView = lazyModule(
  () => import("./components/modules/graduation/GraduationConvocationView"),
  (m) => m.GraduationConvocationView,
);
const ReceiptModal = lazyModule(
  () => import("./components/common/ReceiptModal"),
  (m) => m.ReceiptModal,
);
const PaymentGatewayModal = lazyModule(
  () => import("./components/common/PaymentGatewayModal"),
  (m) => m.PaymentGatewayModal,
);

const WorkspaceFallback: React.FC = () => (
  <div
    className="flex min-h-screen items-center justify-center"
    role="status"
    aria-label="Loading workspace module"
  >
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
    <p className="text-xs font-medium">Loading workspace module...</p>
  </div>
);

/**
 * Whether this session is a student account.
 */
function isStudentAccount(user: AuthUser | null): boolean {
  if (!user) return false;
  const roles = user.roles?.length ? user.roles : [user.role];
  return roles.length === 1 && roles[0] === "student";
}

/**
 * Session key used to track whether the splash screen has been shown this
 * browser session. We show it once per session so returning visitors skip it.
 */
const SPLASH_SESSION_KEY = "collegeos_splash_shown";

const AppContent: React.FC = () => {
  const {
    isAuthenticated,
    isHydrating,
    mustChangePassword,
    loginTransition,
    completeLoginTransition,
    activeView,
    currentUser,
    currentRole,
    activeReceipt,
    setActiveReceipt,
    activePaymentModal,
    setActivePaymentModal,
    codingLabRoute,
    login,
    intendedDestination,
    setIntendedDestination,
  } = useCollegeOS();
  // Welcome-experience state:
  //  "splash"   â€” cinematic intro playing
  //  "welcome"  â€” public landing page visible
  //  "login"    â€” visitor clicked "Enter CollegeOS", show LoginView
  const pathname = window.location.pathname;
  const isRootPath = pathname === "/";
  const splashAlreadyShown =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";

  const [publicStage, setPublicStage] = useState<"splash" | "welcome" | "login">(
    () => {
      if (pathname === "/login") return "login";
      if (isRootPath && !splashAlreadyShown) return "splash";
      if (isRootPath) return "welcome";
      return "login"; // non-root path â†’ go straight to login
    },
  );

  const handleSplashComplete = useCallback(() => {
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    } catch {
      // sessionStorage may be blocked in some contexts â€” harmless
    }
    setPublicStage("welcome");
  }, []);

  const handleEnterPortal = useCallback(() => {
    if (window.location.pathname !== "/login") {
      window.history.pushState({}, "", "/login");
    }
    setPublicStage("login");
  }, []);

  // Store the intended destination when unauthenticated
  useEffect(() => {
    if (!isAuthenticated && !loginTransition && !isHydrating) {
      const path = window.location.pathname;
      if (path !== "/" && path !== "/login" && path !== "/account/activate" && routeToView[path]) {
        setIntendedDestination(path);
      }
    }
  }, [isAuthenticated, loginTransition, isHydrating, setIntendedDestination]);

  // Show loading screen while authentication is being restored (hydration)
  if (isHydrating) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-label="Restoring session"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        <p className="sr-only">Restoring your sessionâ€¦</p>
      </div>
    );
  }

  // â”€â”€ Public welcome experience (unauthenticated visitors at "/") â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!isAuthenticated && !loginTransition) {
    // Splash screen
    if (publicStage === "splash") {
      return <SplashScreen onComplete={handleSplashComplete} />;
    }

    // Public landing page
    if (publicStage === "welcome") {
      return <WelcomePage onEnterPortal={handleEnterPortal} />;
    }

    // "login" stage â€” visitor clicked "Enter CollegeOS"
    return <LoginView onLoginSuccess={intendedDestination} />;
  }

  // â”€â”€ Login transition overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (loginTransition) {
    return (
      <LoginView
        transitioning={true}
        onTransitionComplete={completeLoginTransition}
      />
    );
  }

const permissionByView: Record<string, string> = {
      user_management: "accounts.manage",
      students: "students.directory.view",
      admissions: "admissions.application.view",
      finance: "finance.invoice.view",
      examination: "exams.view",
      assignments: "assignments.view",
      lms: "lms.view",
      learning: "courses.view",
      materials: "courses.view",
      timetable_attendance: "timetable.view",
      my_timetable: "timetable.view",
      attendance_sheet: "attendance.view",
      examinations_calendar: "timetable.view",
      calendar_documents: "calendar.view",
      communication: "mail.view",
      messages: "messages.view",
      notices: "notices.view",
      connect: "connect.view",
      documents: "documents.view",
      library: "library.view",
      facilities_library: "facilities.view",
      campus_facilities_ext: "facilities.view",
      campus_buildings: "facilities.view",
      campus_labs: "facilities.view",
      campus_reservations: "facilities.view",
      campus_maintenance: "facilities.view",
      campus_assets: "facilities.view",
      campus_transport: "facilities.view",
      analytics: "analytics.view",
      student_coding_lab: "coding.lab.view",
      teacher_coding_lab: "coding.lab.view",
      quizzes: "lms.quiz.manage",
      faculty_assessment: "grade.enter",
      student_progress: "attendance.view.course",
      lesson_planning: "lms.content.manage",
      student_advising: "student.view.assigned",
      leave_substitution: "attendance.session.create",
      faculty_workload: "lms.view",
      research_projects: "lms.view",
      faculty_alerts: "attendance.view.course",
      resource_booking: "facilities.view",
      smart_documents: "documents.view",
      early_warning: "earlyWarning.view",
      study_planner: "studyPlanner.view",
      student_journey: "studentJourney.view",
      internship: "internship.view",
      research: "research.view",
      credentials: "credentials.view",
      safety: "safety.view",
      report_incident: "safety.report",
      graduation: "graduation.view",
    };
  const requiredPermission = permissionByView[activeView];
  if (
    requiredPermission &&
    !currentUser?.permissions?.includes(requiredPermission)
  ) {
    return (
      <Suspense fallback={<WorkspaceFallback />}>
        <AppShell>
          <DashboardWorkspaceView />
        </AppShell>
      </Suspense>
    );
  }

  const renderActiveView = () => {
    switch (activeView) {
      case "dashboard":
        return <DashboardWorkspaceView />;

      /* ---- Admin / academic-office scheduling & attendance reporting ---- */
      case "timetable_attendance":
        if (isStudentAccount(currentUser)) {
          return <StudentTimetableView />;
        }
        if (currentRole === "faculty") {
          return <FacultyMyTimetableView />;
        }
        return <TimetableWorkspaceView />;

      case "attendance_sheet":
        if (currentRole === "student") {
          return <AttendanceWorkspaceView />;
        }
        if (currentRole === "faculty") {
          return <AttendanceWorkspaceView />;
        }
        return <AttendanceRecordsWorkspaceView />;

      case "my_timetable":
        if (currentRole === "student") {
          return <StudentTimetableView />;
        }
        return <FacultyMyTimetableView />;

      case "students":
        return <StudentDirectoryWorkspaceView />;

      case "user_management":
        return <UserManagementView />;

      case "admissions":
        return <AdmissionsWorkspaceView />;

       case "lms":
         return <LmsWorkspace />;

       case "quizzes":
         return <QuizManagementWorkspace />;

      case "faculty_assessment":
        return <FacultyAssessmentWorkspaceView />;

      case "student_progress":
        return <StudentProgressView />;

      case "lesson_planning":
        return <LessonPlanningView />;

      case "student_advising":
        return <StudentAdvisingView />;

      case "leave_substitution":
        return <LeaveSubstitutionView />;

      case "faculty_workload":
        return <FacultyWorkloadView />;

      case "research_projects":
        return <ResearchProjectsView />;

      case "resource_booking":
        return <ResourceBookingView />;

      case "learning":
        return isStudentAccount(currentUser) ? (
          <MyCoursesView />
        ) : (
          <LearningWorkspaceView />
        );

      case "materials":
      case "assignments":
        return <LmsWorkspace />;

      case "examination":
        return <ExaminationWorkspaceView />;

      case "finance":
        return <FinanceWorkspaceView />;

      case "requests":
      case "documents":
        return <WorkflowWorkspaceView />;

      case "workflow_automation":
        return <WorkflowAutomationView />;

      case "communication":
        return <CollegeMailView />;
      case "email_signature":
        return <EmailSignatureSettingsView />;

      case "examinations_calendar":
        return <AcademicCalendarView />;

      case "calendar_documents":
        return <AcademicCalendarDocumentsView />;

      case "messages":
        return <MessagesView />;

      case "notices":
        return <NoticesView />;

      case "notifications":
        return <NotificationsPage />;

      case "connect":
        return <ConnectWorkspaceView />;

      case "online_class_join":
        return <OnlineClassJoinPage />;
      case "online_class_pre_join":
        return <OnlineClassPreJoinPage />;
      case "online_class_room":
      case "online_class_classroom":
        return <OnlineClassClassroomPage />;
      case "online_class_waiting":
        return <OnlineClassWaitingRoomPage />;

      case "facilities_library":
      case "library":
        return <FacilitiesLibraryView />;

      case "intelligence":
        return <NextGenSuiteView />;

      case "analytics":
        return <AnalyticsWorkspaceView />;

      case "profile":
        return <AccountProfileView />;

      case "hr_dashboard":
        return <HRDashboardView />;

      case "staff_portal":
        return <StaffPortalView />;

      case "recruitment":
        return <HRDashboardView />;

      case "workforce_planning":
        return <HRDashboardView />;

      case "leave_approval":
        return <LeaveApprovalWorkspace />;

      case "career_placement":
        return <CareerPlacementView />;

      case "hostel_accommodation":
        return <HostelAccommodationView />;

      case "library_learning":
        return <LibraryLearningResourcesView />;

      case "student_clubs":
        return <StudentClubsEventsView />;

       case "smart_documents":
         return <SmartDocumentCentreView />;

      case "student_lifecycle":
        return <StudentLifecycleView />;

      case "early_warning":
        return <EarlyWarningView />;

      case "study_planner":
        return <StudyPlannerView />;

      case "student_journey":
        return <StudentJourneyView />;

      case "internship":
        return <InternshipManagementView />;

      case "research":
        return <ResearchProjectsViewNew />;

      case "credentials":
        return <DigitalCredentialsView />;

      case "safety":
        return <CampusSafetyView />;

      case "report_incident":
        return <ReportIncidentView />;

      case "graduation":
        return <GraduationConvocationView />;

      case "campus_facilities_ext":
      case "campus_buildings":
      case "campus_labs":
      case "campus_reservations":
      case "campus_maintenance":
      case "campus_assets":
      case "campus_transport":
        return <CampusFacilitiesExtendedView />;

      case "student_coding_lab":
        // The student lab is for student accounts only; any other
        // role lands on the dashboard even if it reaches the URL.
        if (currentRole === "student") {
          return (
            <CodingLabWorkspace
              isTeacher={false}
              initialProjectId={codingLabRoute.projectId}
              initialAssignmentId={codingLabRoute.assignmentId}
            />
          );
        }
        return <DashboardWorkspaceView />;

      case "teacher_coding_lab":
        // The teacher lab is for faculty accounts only.
        if (currentRole === "faculty") {
          return (
            <CodingLabWorkspace
              isTeacher
              initialProjectId={codingLabRoute.projectId}
              initialAssignmentId={codingLabRoute.assignmentId}
            />
          );
        }
        return <DashboardWorkspaceView />;

      default:
        return <DashboardWorkspaceView />;
    }
  };

  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <AppShell>
        {mustChangePassword && <ForcePasswordChangeModal />}

        {renderActiveView()}

        {activeReceipt && <ReceiptModal />}
        {activePaymentModal && <PaymentGatewayModal />}
        {isAuthenticated && !isHydrating && <SessionGuard />}
      </AppShell>
    </Suspense>
  );
};

function App() {
  return (
    <CollegeOSProvider>
      <ToastProvider position="top-right">
        <AppContent />
      </ToastProvider>
    </CollegeOSProvider>
  );
}

export default App;
