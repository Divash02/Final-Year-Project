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
  //  "splash"   — cinematic intro playing
  //  "welcome"  — public landing page visible
  //  "login"    — visitor clicked "Enter CollegeOS", show LoginView
  const isRootPath = window.location.pathname === "/";
  const splashAlreadyShown =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";

  const [publicStage, setPublicStage] = useState<"splash" | "welcome" | "login">(
    () => {
      if (isRootPath && !splashAlreadyShown) return "splash";
      if (isRootPath) return "welcome";
      return "login"; // non-root path → go straight to login
    },
  );

  const handleSplashComplete = useCallback(() => {
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    } catch {
      // sessionStorage may be blocked in some contexts — harmless
    }
    setPublicStage("welcome");
  }, []);

  const handleEnterPortal = useCallback(() => {
    setPublicStage("login");
  }, []);

  // Store the intended destination when unauthenticated
  useEffect(() => {
    if (!isAuthenticated && !loginTransition && !isHydrating) {
      const path = window.location.pathname;
      if (path !== "/" && path !== "/account/activate" && routeToView[path]) {
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
        <p className="sr-only">Restoring your session…</p>
      </div>
    );
  }

  // ── Public welcome experience (unauthenticated visitors at "/") ──────────
  if (!isAuthenticated && !loginTransition) {
    // Splash screen
    if (publicStage === "splash") {
      return <SplashScreen onComplete={handleSplashComplete} />;
    }

    // Public landing page
    if (publicStage === "welcome") {
      return <WelcomePage onEnterPortal={handleEnterPortal} />;
    }

    // "login" stage — visitor clicked "Enter CollegeOS"
    return <LoginView onLoginSuccess={intendedDestination} />;
  }

  // ── Login transition overlay ──────────────────────────────────────────────
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
      smart_documents: "documents.view",
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
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </CollegeOSProvider>
  );
}

export default App;
