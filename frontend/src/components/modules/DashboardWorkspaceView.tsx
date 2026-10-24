import React, { useEffect, useState } from "react";
import { apiRequest } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../../components/ui/ToastContainer";
import { formatNPR } from "../../lib/nepaliCalendar";
import { EmptyState } from "../ui/EmptyState";
import { ROLE_LABELS } from "../common/Navbar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine,
  faFileInvoiceDollar,
  faGraduationCap,
  faUsers,
  faCalendarDays,
  faClock,
  faTriangleExclamation,
  faArrowRight,
  faBookOpen,
  faUserShield,
} from "@fortawesome/free-solid-svg-icons";
import { ExamCountdown } from "../../types";

interface DashboardSummary {
  totalUsers?: number;
  totalStudents?: number;
  totalCourses?: number;
  totalAssignments?: number;
  totalAttendanceSessions?: number;
  totalExaminations?: number;
  publishedExaminations?: number;
  totalAdmissionApplications?: number;
  pendingAdmissionApplications?: number;
  totalInvoices?: number;
  totalInvoiced?: number;
  totalCollected?: number;
  outstandingBalance?: number;
  openCases?: number;
  upcomingExamsCount?: number;
  upcomingExams?: UpcomingExamCardData[];
}

interface UpcomingExamCardData {
  id: string;
  title: string;
  courseCode: string;
  courseName: string;
  program?: string;
  semester?: number;
  examDate: string;
  nepaliDate: string;
  startTime: string;
  endTime: string;
  room: string;
  status?: string;
  candidateCount?: number;
  facultyRole?: string;
  countdown?: ExamCountdown;
}

export const DashboardWorkspaceView: React.FC = () => {
  const { currentRole, currentUser, language, setActiveView, currentCampus } = useCollegeOS();
  const { toast } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [upcomingExams, setUpcomingExams] = useState<UpcomingExamCardData[]>([]);
  const [scope, setScope] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

const isStudent = currentRole === "student";
  const isFaculty = currentRole === "faculty";
  const isExamOfficer = currentRole === "exam_officer";
  const permissions = new Set(currentUser?.permissions || []);

  // Greeting is derived from the authenticated session, never hardcoded.
  const roleLabel = ROLE_LABELS[currentRole] || currentRole;
  const firstName =
    currentUser?.name?.trim().split(/\s+/)[0] || currentUser?.email || "";
  const assignedRoles = (currentUser?.roles || [currentRole])
    .map((role) => ROLE_LABELS[role] || role.replace(/_/g, " "))
    .join(" / ");

  useEffect(() => {
    let active = true;

    const fetchSummary = apiRequest<{ summary: DashboardSummary; scope: string }>("/dashboard/summary");
    const fetchExams = isStudent
      ? apiRequest<{ exams: UpcomingExamCardData[] }>("/student/exams/upcoming").catch(() => ({ exams: [] }))
      : isFaculty
      ? apiRequest<{ exams: UpcomingExamCardData[] }>("/faculty/exams/upcoming").catch(() => ({ exams: [] }))
      : Promise.resolve({ exams: [] });

    Promise.all([fetchSummary, fetchExams])
      .then(([summaryResult, examResult]) => {
        if (!active) return;
        setSummary(summaryResult.summary);
        setScope(summaryResult.scope);

        if (examResult?.exams && examResult.exams.length > 0) {
          setUpcomingExams(examResult.exams);
        } else if (summaryResult.summary?.upcomingExams) {
          setUpcomingExams(summaryResult.summary.upcomingExams);
        }
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load dashboard data."
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isStudent, isFaculty]);

  const metrics = isStudent
    ? [
        ["My Assignments", summary?.totalAssignments],
        ["Attendance Sessions", summary?.totalAttendanceSessions],
        ["Upcoming Examinations", upcomingExams.length],
        [
          "Outstanding Balance",
          summary?.outstandingBalance === undefined
            ? undefined
            : formatNPR(summary.outstandingBalance, language),
        ],
      ]
    : isFaculty
    ? [
        ["My Assignments", summary?.totalAssignments],
        ["My Sessions", summary?.totalAttendanceSessions],
        ["Course Exams & Duties", upcomingExams.length],
      ]
    : isExamOfficer
    ? [
        ["Total Examinations", summary?.totalExaminations],
        ["Published Examinations", summary?.publishedExaminations],
      ]
    : [
        ["Students", summary?.totalStudents],
        ["Courses", summary?.totalCourses],
        ["Assignments", summary?.totalAssignments],
        ["Examinations", summary?.totalExaminations],
        [
          "Outstanding Balance",
          summary?.outstandingBalance === undefined
            ? undefined
            : formatNPR(summary.outstandingBalance, language),
        ],
      ];

  const renderBadge = (countdown?: ExamCountdown) => {
    if (!countdown) return null;
    const bgMap: Record<string, string> = {
      urgent: "bg-red-50 text-red-700 border-red-200 font-bold animate-pulse",
      important: "bg-amber-50 text-amber-700 border-amber-200 font-semibold",
      warning: "bg-orange-50 text-orange-700 border-orange-200 font-semibold",
      reminder: "bg-blue-50 text-blue-700 border-blue-200 font-medium",
      upcoming: "bg-emerald-50 text-emerald-700 border-emerald-200",
      neutral: "bg-slate-50 text-slate-700 border-slate-200",
      danger: "bg-red-100 text-red-800 border-red-300 font-bold",
    };
    const style = bgMap[countdown.badgeClass] || bgMap.neutral;

    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${style}`}>
        {countdown.badgeClass === "urgent" || countdown.badgeClass === "warning" ? (
          <FontAwesomeIcon icon={faTriangleExclamation} />
        ) : (
          <FontAwesomeIcon icon={faClock} />
        )}
        <span>{countdown.label}</span>
      </span>
    );
  };

  return (
    <section className="cos-page">
      <header className="cos-page-header">
        <div className="min-w-0">
          <p className="cos-eyebrow">
            Workspace
          </p>
          <h1 className="cos-page-title">
            Welcome, {firstName || "there"}
          </h1>
          <div className="cos-page-subtitle flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-primary)]/25 bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-primary-strong)]">
              <FontAwesomeIcon icon={faUserShield} aria-hidden="true" />
              {roleLabel}
            </span>
            {assignedRoles !== roleLabel && (
              <span className="text-xs text-slate-500">
                Also assigned: {assignedRoles}
              </span>
            )}
            <span>
              {scope === "institution"
                ? "Institution-wide records from the database"
                : scope
                ? "Records in your authorized scope"
                : "Database-backed CollegeOS summary"}
            </span>
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading dashboard records...</p>
      ) : !summary ? (
        <EmptyState
          icon={faChartLine}
          title="Dashboard data unavailable"
          description="The dashboard could not load records from the backend."
        />
      ) : (
        <div className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4 rounded-xl overflow-hidden shadow-xs">
          {metrics.map(([label, value], index) => (
            <div key={String(label)} className="bg-white p-5">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>{label}</span>
                <FontAwesomeIcon
                  icon={
                    index === 0
                      ? faUsers
                      : index === 1
                      ? faGraduationCap
                      : index === 2
                      ? faCalendarDays
                      : faFileInvoiceDollar
                  }
                />
              </div>
              <p className="mt-3 font-mono text-2xl font-semibold">
                {value === undefined ? "—" : value}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {value === undefined
                  ? "Not available in this scope"
                  : Number(value) === 0
                  ? "No records scheduled yet"
                  : "From live database"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STUDENT & FACULTY UPCOMING EXAMINATION WIDGET (Sections 18 - 20) */}
      {/* ------------------------------------------------------------- */}
      {(isStudent || isFaculty) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FontAwesomeIcon icon={faCalendarDays} className="text-[var(--color-primary)]" />
                {isStudent ? "Your Upcoming Examinations" : "Your Examination Duties & Course Exams"}
              </h2>
              <p className="text-xs text-slate-500">
                {isStudent
                  ? "Exams for which you are an officially registered, eligible candidate:"
                  : "Examinations for courses you teach or where you are an assigned invigilator:"}
              </p>
            </div>
            {upcomingExams.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveView("examination")}
                className="cursor-pointer text-xs font-semibold text-[var(--color-primary)] hover:underline flex items-center gap-1"
              >
                <span>View All Exams</span>
                <FontAwesomeIcon icon={faArrowRight} />
              </button>
            )}
          </div>

          {upcomingExams.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-xs">
              <FontAwesomeIcon icon={faCalendarDays} className="text-3xl text-slate-300" />
              <h3 className="mt-2 text-sm font-semibold text-slate-800">No Upcoming Examinations</h3>
              <p className="mt-1 text-xs text-slate-500">
                You have no pending examinations scheduled at this time.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingExams.map((exam) => (
                <div
                  key={exam.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-[var(--color-primary)] transition flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      {renderBadge(exam.countdown)}
                      {exam.facultyRole && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-700">
                          {exam.facultyRole}
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
                        {exam.courseCode}
                      </div>
                      <h3 className="text-base font-bold text-slate-900 leading-tight">
                        {exam.courseName}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{exam.title}</p>
                    </div>

                    <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-700">
                      <div className="font-semibold text-slate-900">
                        {exam.examDate} · {exam.nepaliDate}
                      </div>
                      <div>
                        {exam.startTime} – {exam.endTime}
                      </div>
                      <div className="truncate font-medium text-slate-800">
                        Venue: {exam.room}
                      </div>
                      {exam.candidateCount !== undefined && exam.candidateCount > 0 && (
                        <div className="text-slate-500">
                          Candidates: <span className="font-semibold text-slate-800">{exam.candidateCount}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setActiveView("examination")}
                      className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:opacity-95"
                    >
                      <span>{exam.facultyRole === "Invigilator" ? "View Duty Details" : "View Examination"}</span>
                      <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Navigation Footer */}
      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        {permissions.has("students.directory.view") && (
          <button
            type="button"
            onClick={() => setActiveView("students")}
            className="cursor-pointer rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Student Directory
          </button>
        )}
        {permissions.has("finance.invoice.view") && (
          <button
            type="button"
            onClick={() => setActiveView("finance")}
            className="cursor-pointer rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Finance &amp; Invoices
          </button>
        )}
        {permissions.has("admissions.application.view") && (
          <button
            type="button"
            onClick={() => setActiveView("admissions")}
            className="cursor-pointer rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Admissions
          </button>
        )}
        {(permissions.has("exam.view") || permissions.has("exams.view")) && (
          <button
            type="button"
            onClick={() => setActiveView("examination")}
            className="cursor-pointer rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/30 font-semibold px-3 py-2 text-sm hover:bg-[var(--color-primary)]/20"
          >
            Official Examinations
          </button>
        )}
        {permissions.has("assignments.view") && (
          <button
            type="button"
            onClick={() => setActiveView("assignments")}
            className="cursor-pointer rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Assignments
          </button>
        )}
      </div>
    </section>
  );
};



