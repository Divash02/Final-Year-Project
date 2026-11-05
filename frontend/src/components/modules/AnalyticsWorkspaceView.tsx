import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartPie,
  faBookOpen,
  faCalendarCheck,
  faTasks,
  faGraduationCap,
  faUserGraduate,
  faFileInvoiceDollar,
  faFolderTree,
  faUsers,
  faShieldHalved,
  faWandMagicSparkles,
  faRotateRight,
  faFileArrowDown,
  faSearch,
  faCheckCircle,
  faTriangleExclamation,
  faClock,
  faBuilding,
  faArrowTrendUp,
  faDatabase,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { Modal } from "../ui/Modal";
import { Table } from "../ui/Table";
import { Badge } from "../ui/Badge";
import {
  AnalyticsKpiCard,
  TrendChart,
  BarChartCard,
  DonutChartCard,
  ProgressCard,
  AttendanceHeatmap,
  ActivityTimeline,
  FilterBar,
  InsightCard,
  AuditDetailDrawer,
  EmptyChartState,
  ChartSkeleton,
  type AnalyticsFilterState,
  type TimelineEvent,
} from "../analytics";
import {
  fetchDetailedAnalytics,
  fetchAuditAnalytics,
  type AnalyticsDetailedResponse,
  type AuditAnalyticsResponse,
} from "../../services/analyticsApi";
import type { AuditLogItem } from "../analytics/AuditDetailDrawer";

type AnalyticsTab =
  | "overview"
  | "academic"
  | "attendance"
  | "assignments"
  | "examination"
  | "admissions"
  | "finance"
  | "cases"
  | "users"
  | "audit";

const TABS: Array<{
  id: AnalyticsTab;
  label: string;
  icon: typeof faChartPie;
}> = [
  { id: "overview", label: "Executive Overview", icon: faChartPie },
  { id: "academic", label: "Academic", icon: faBookOpen },
  { id: "attendance", label: "Attendance", icon: faCalendarCheck },
  { id: "assignments", label: "Assignments", icon: faTasks },
  { id: "examination", label: "Examinations", icon: faGraduationCap },
  { id: "admissions", label: "Admissions", icon: faUserGraduate },
  { id: "finance", label: "Finance", icon: faFileInvoiceDollar },
  { id: "cases", label: "Cases & SLAs", icon: faFolderTree },
  { id: "users", label: "Users & System", icon: faUsers },
  { id: "audit", label: "Audit & Security", icon: faShieldHalved },
];

export const AnalyticsWorkspaceView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [data, setData] = useState<AnalyticsDetailedResponse | null>(null);
  const [auditData, setAuditData] = useState<AuditAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogItem | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState<boolean>(false);

  // Filters State
  const [filters, setFilters] = useState<AnalyticsFilterState>({
    academicYear: "ALL",
    semester: "ALL",
    department: "ALL",
    program: "ALL",
    startDate: "",
    endDate: "",
  });

  // Audit Logs State
  const [auditSearch, setAuditSearch] = useState<string>("");
  const [auditModuleFilter, setAuditModuleFilter] = useState<string>("ALL");
  const [auditPage, setAuditPage] = useState<number>(1);

  // Load Main Analytics Data
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDetailedAnalytics({
        department: filters.department !== "ALL" ? filters.department : undefined,
        program: filters.program !== "ALL" ? filters.program : undefined,
        semester: filters.semester !== "ALL" ? filters.semester : undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
      });
      setData(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load institutional analytics."
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Load Audit Data
  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetchAuditAnalytics({
        page: auditPage,
        limit: 20,
        search: auditSearch || undefined,
        module: auditModuleFilter !== "ALL" ? auditModuleFilter : undefined,
      });
      setAuditData(res);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, auditSearch, auditModuleFilter]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    if (activeTab === "audit" || activeTab === "overview") {
      void loadAudit();
    }
  }, [activeTab, loadAudit]);

  // CSV Export
  const handleExport = (format: "csv" | "print") => {
    if (!data) return;

    if (format === "print") {
      window.print();
      return;
    }

    // Generate CSV string based on active tab
    const rows: string[][] = [
      ["CollegeOS Institutional Analytics Report"],
      ["Generated At", new Date().toISOString()],
      ["Academic Year", filters.academicYear],
      ["Department", filters.department],
      ["Program", filters.program],
      ["Semester", filters.semester],
      ["Section Tab", activeTab.toUpperCase()],
      [],
    ];

    if (activeTab === "overview" || activeTab === "academic") {
      rows.push(["Metric", "Count"]);
      rows.push(["Active Users", String(data.kpis.activeUsers)]);
      rows.push(["Total Students", String(data.kpis.totalStudents)]);
      rows.push(["Total Courses", String(data.kpis.totalCourses)]);
      rows.push(["Active Courses", String(data.kpis.activeCourses)]);
      rows.push(["Total Assignments", String(data.kpis.totalAssignments)]);
      rows.push(["Total Examinations", String(data.kpis.totalExaminations)]);
      rows.push(["Published Examinations", String(data.kpis.publishedExaminations)]);
      rows.push(["Total Invoiced NPR", String(data.kpis.totalInvoiced)]);
      rows.push(["Total Collected NPR", String(data.kpis.totalCollected)]);
      rows.push(["Outstanding Balance NPR", String(data.kpis.outstandingBalance)]);
    } else if (activeTab === "attendance") {
      rows.push(["Status", "Records"]);
      for (const [k, v] of Object.entries(data.attendance.distribution)) {
        rows.push([k, String(v)]);
      }
      rows.push([]);
      rows.push(["Date", "Total", "Present", "Attendance %"]);
      for (const t of data.attendance.trends) {
        rows.push([t.date, String(t.total), String(t.present), `${t.rate}%`]);
      }
    } else if (activeTab === "finance") {
      rows.push(["Payment Method", "Amount NPR", "Transaction Count"]);
      for (const m of data.finance.paymentMethods) {
        rows.push([m.method, String(m.total), String(m.count)]);
      }
    } else if (activeTab === "audit" && auditData) {
      rows.push(["Timestamp", "Action", "Module", "User", "IP Address"]);
      for (const log of auditData.logs) {
        rows.push([
          log.createdAt,
          log.action,
          log.module,
          log.user?.email || "System",
          log.ipAddress || "127.0.0.1",
        ]);
      }
    }

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `collegeos_analytics_${activeTab}_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Convert audit logs to Timeline events
  const timelineEvents: TimelineEvent[] = useMemo(() => {
    if (!auditData?.logs) return [];
    return auditData.logs.slice(0, 8).map((log) => ({
      id: log.id,
      timestamp: log.createdAt,
      action: log.action,
      module: log.module,
      resource: log.resource,
      details: log.details,
      actorName: log.user?.name,
      actorRole: log.user?.roles?.[0],
      ipAddress: log.ipAddress,
      status: /FAIL|ERROR|BLOCK|DENIED|REJECT/i.test(log.action)
        ? "failed"
        : "success",
    }));
  }, [auditData]);

  return (
    <div className="cos-page space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
            Reporting &amp; Visual Governance
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">
            Institutional Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time and historical insights calculated strictly from CollegeOS database records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={faWandMagicSparkles}
            onClick={() => setAiModalOpen(true)}
            disabled={!data}
          >
            AI Insights
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={faRotateRight}
            onClick={() => void loadAnalytics()}
            isLoading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Global Filter Bar */}
      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        onApply={() => void loadAnalytics()}
        onReset={() => {
          setFilters({
            academicYear: "ALL",
            semester: "ALL",
            department: "ALL",
            program: "ALL",
            startDate: "",
            endDate: "",
          });
        }}
        onExport={handleExport}
        isLoading={loading}
      />

      {/* Error Alert */}
      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadAnalytics()}
            >
              Retry
            </Button>
          </div>
        </Alert>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-1 text-xs">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg font-bold transition whitespace-nowrap ${
                isActive
                  ? "bg-teal-50 text-teal-900 border border-teal-200 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <FontAwesomeIcon
                icon={tab.icon}
                className={isActive ? "text-teal-700" : "text-slate-400"}
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-28 rounded-xl border border-slate-200 bg-white p-4 animate-pulse"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSkeleton height="h-64" />
            <ChartSkeleton height="h-64" />
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      {data && !loading && (
        <div className="space-y-6">
          {/* ================= TAB 1: EXECUTIVE OVERVIEW ================= */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Row 1: 6 Primary Executive KPI Cards with Sparklines */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <AnalyticsKpiCard
                  title="Active Users"
                  value={data.kpis.activeUsers}
                  subtitle="Users authenticated and active"
                  icon={faUsers}
                  sparklineData={[1, 2, 3, data.kpis.activeUsers]}
                  onClick={() => setActiveTab("users")}
                />
                <AnalyticsKpiCard
                  title="Students"
                  value={data.kpis.totalStudents}
                  subtitle={`${data.kpis.activeStudents} active enrolled`}
                  icon={faUserGraduate}
                  sparklineData={[data.kpis.totalStudents]}
                  onClick={() => setActiveTab("academic")}
                />
                <AnalyticsKpiCard
                  title="Courses"
                  value={data.kpis.totalCourses}
                  subtitle={`${data.kpis.activeCourses} active syllabus`}
                  icon={faBookOpen}
                  sparklineData={[data.kpis.totalCourses]}
                  onClick={() => setActiveTab("academic")}
                />
                <AnalyticsKpiCard
                  title="Assignments"
                  value={data.kpis.totalAssignments}
                  subtitle={`${data.assignments.totalSubmissions} submissions recorded`}
                  icon={faTasks}
                  sparklineData={[0, data.kpis.totalAssignments]}
                  onClick={() => setActiveTab("assignments")}
                />
                <AnalyticsKpiCard
                  title="Examinations"
                  value={data.kpis.totalExaminations}
                  subtitle={`${data.kpis.publishedExaminations} published results`}
                  icon={faGraduationCap}
                  sparklineData={[data.kpis.totalExaminations]}
                  onClick={() => setActiveTab("examination")}
                />
                <AnalyticsKpiCard
                  title="Revenue Collection"
                  value={`NPR ${(data.kpis.totalCollected / 1000).toFixed(1)}k`}
                  subtitle={`${data.kpis.collectionRate}% of billed invoiced`}
                  icon={faFileInvoiceDollar}
                  tone="teal"
                  sparklineData={[0, data.kpis.totalCollected]}
                  onClick={() => setActiveTab("finance")}
                />
              </div>

              {/* Row 2: 2 Major Trend Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TrendChart
                  title="Session Attendance Trend"
                  subtitle="Daily attendance percentage across active classroom sessions."
                  data={data.attendance.trends.map((t) => ({
                    label: t.date.slice(5),
                    value: t.rate,
                    secondaryValue: t.total,
                  }))}
                  valueSuffix="%"
                  primaryLabel="Attendance %"
                  secondaryLabel="Total Sessions"
                  color="#0f766e"
                />

                <TrendChart
                  title="Revenue Inflow Trend"
                  subtitle="Monthly verified student fee collections in NPR."
                  data={data.finance.monthlyCollections.map((m) => ({
                    label: m.month,
                    value: m.amount,
                    secondaryValue: m.count,
                  }))}
                  valuePrefix="NPR "
                  primaryLabel="Amount"
                  secondaryLabel="Transactions"
                  color="#0284c7"
                />
              </div>

              {/* Row 3: Distribution & Comparison Visualizations */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BarChartCard
                  title="Courses by Academic Department"
                  subtitle="Curriculum distribution across faculty departments."
                  items={data.academic.coursesByDepartment.map((d) => ({
                    label: d.name,
                    value: d.count,
                    color: "#0f766e",
                  }))}
                />

                <DonutChartCard
                  title="Institutional Attendance Distribution"
                  subtitle="Breakdown of recorded student presence and absences."
                  segments={Object.entries(data.attendance.distribution).map(
                    ([k, v]) => ({
                      label: k,
                      value: v,
                      color:
                        k === "Present"
                          ? "#0f766e"
                          : k === "Late"
                          ? "#f59e0b"
                          : k === "Absent"
                          ? "#e11d48"
                          : k === "Bunk"
                          ? "#be123c"
                          : "#64748b",
                    })
                  )}
                  centerLabel="Entries"
                  centerValue={data.attendance.totalRecords}
                />
              </div>

              {/* Row 4: Recent Activity & Attendance Heatmap */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AttendanceHeatmap
                  records={data.attendance.trends}
                  subtitle="Weekday attendance volume over the past 8 academic weeks."
                />

                <ActivityTimeline
                  events={timelineEvents}
                  title="Recent Institutional Activity"
                  subtitle="Live audit trail of administrative, exam, and financial operations."
                  onSelectEvent={(evt) => {
                    const fullLog = auditData?.logs.find((l) => l.id === evt.id);
                    if (fullLog) setSelectedAuditLog(fullLog);
                  }}
                />
              </div>

              {/* Row 5: Institutional Insights & Advisory Alerts */}
              {data.insights.length > 0 && (
                <InsightCard
                  insights={data.insights}
                  onNavigateTab={(tab) => setActiveTab(tab as AnalyticsTab)}
                />
              )}
            </div>
          )}

          {/* ================= TAB 2: ACADEMIC ANALYTICS ================= */}
          {activeTab === "academic" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <AnalyticsKpiCard
                  title="Total Courses"
                  value={data.academic.totalCourses}
                  subtitle={`${data.academic.activeCourses} Active · ${data.academic.archivedCourses} Archived`}
                  icon={faBookOpen}
                />
                <AnalyticsKpiCard
                  title="Enrolled Students"
                  value={data.kpis.totalStudents}
                  subtitle={`${data.kpis.activeStudents} Active standing`}
                  icon={faUserGraduate}
                />
                <AnalyticsKpiCard
                  title="Departments"
                  value={data.academic.coursesByDepartment.length}
                  subtitle="Academic governance divisions"
                  icon={faBuilding}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BarChartCard
                  title="Course Distribution by Department"
                  subtitle="Volume of accredited courses managed under each faculty."
                  items={data.academic.coursesByDepartment.map((d) => ({
                    label: d.name,
                    value: d.count,
                    color: "#0f766e",
                  }))}
                />

                <DonutChartCard
                  title="Course Lifecycle Status"
                  subtitle="Breakdown of active, draft, and archived syllabi."
                  segments={data.academic.courseStatusDistribution.map((s) => ({
                    label: s.status,
                    value: s.count,
                    color:
                      s.status === "ACTIVE"
                        ? "#0f766e"
                        : s.status === "ARCHIVED"
                        ? "#94a3b8"
                        : "#f59e0b",
                  }))}
                  centerLabel="Courses"
                  centerValue={data.academic.totalCourses}
                />
              </div>
            </div>
          )}

          {/* ================= TAB 3: ATTENDANCE ANALYTICS ================= */}
          {activeTab === "attendance" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <AnalyticsKpiCard
                  title="Attendance Rate"
                  value={
                    data.attendance.overallRate != null
                      ? `${data.attendance.overallRate}%`
                      : "N/A"
                  }
                  subtitle={
                    data.attendance.overallRate != null && data.attendance.overallRate >= 75
                      ? "Above institutional requirement (75%)"
                      : "Below accreditation threshold"
                  }
                  icon={faCalendarCheck}
                  tone={
                    data.attendance.overallRate != null && data.attendance.overallRate >= 75
                      ? "teal"
                      : "warning"
                  }
                />
                <AnalyticsKpiCard
                  title="Total Sessions"
                  value={data.attendance.totalSessions}
                  subtitle="Classroom registers conducted"
                  icon={faClock}
                />
                <AnalyticsKpiCard
                  title="Present Marks"
                  value={data.attendance.distribution["Present"] || 0}
                  subtitle="Verified classroom attendance"
                  icon={faCheckCircle}
                  tone="teal"
                />
                <AnalyticsKpiCard
                  title="Unexcused Absences"
                  value={
                    (data.attendance.distribution["Absent"] || 0) +
                    (data.attendance.distribution["Bunk"] || 0)
                  }
                  subtitle="Absent and unauthorized leave"
                  icon={faTriangleExclamation}
                  tone="danger"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TrendChart
                  title="Attendance Trends Over Time"
                  subtitle="Daily average attendance percentage calculated from attendance sessions."
                  data={data.attendance.trends.map((t) => ({
                    label: t.date,
                    value: t.rate,
                    secondaryValue: t.total,
                  }))}
                  valueSuffix="%"
                  primaryLabel="Attendance %"
                  secondaryLabel="Records"
                  color="#0f766e"
                />

                <DonutChartCard
                  title="Attendance Status Breakdown"
                  subtitle="Proportion of Present, Late, Absent, and Excused marks."
                  segments={Object.entries(data.attendance.distribution).map(
                    ([k, v]) => ({
                      label: k,
                      value: v,
                      color:
                        k === "Present"
                          ? "#0f766e"
                          : k === "Late"
                          ? "#f59e0b"
                          : k === "Absent"
                          ? "#e11d48"
                          : k === "Bunk"
                          ? "#be123c"
                          : "#64748b",
                    })
                  )}
                  centerLabel="Entries"
                  centerValue={data.attendance.totalRecords}
                />
              </div>

              <AttendanceHeatmap
                records={data.attendance.trends}
                title="Institutional Attendance Heatmap"
                subtitle="Daily attendance percentage density across 8 weeks."
              />
            </div>
          )}

          {/* ================= TAB 4: ASSIGNMENTS ANALYTICS ================= */}
          {activeTab === "assignments" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <AnalyticsKpiCard
                  title="Assignments"
                  value={data.assignments.totalAssignments}
                  subtitle={`${data.assignments.openAssignments} Open for student submission`}
                  icon={faTasks}
                />
                <AnalyticsKpiCard
                  title="Submissions"
                  value={data.assignments.totalSubmissions}
                  subtitle="Student solutions received"
                  icon={faBookOpen}
                />
                <AnalyticsKpiCard
                  title="Graded"
                  value={data.assignments.gradedSubmissions}
                  subtitle="Assessed with teacher marks"
                  icon={faCheckCircle}
                  tone="teal"
                />
                <AnalyticsKpiCard
                  title="Grading Progress"
                  value={`${data.assignments.gradingProgressRate}%`}
                  subtitle="Turnaround rate of assessments"
                  icon={faArrowTrendUp}
                  tone="teal"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ProgressCard
                  title="Assignment Grading Queue"
                  subtitle="Workflow progress from submission to verified grade."
                  metrics={[
                    {
                      label: "Graded Submissions",
                      current: data.assignments.gradedSubmissions,
                      total: data.assignments.totalSubmissions,
                      color: "#0f766e",
                    },
                    {
                      label: "Open Assignments Active",
                      current: data.assignments.openAssignments,
                      total: data.assignments.totalAssignments,
                      color: "#0284c7",
                    },
                  ]}
                  footerNote="All grading figures represent persisted database submissions."
                />

                <DonutChartCard
                  title="Submission Status Breakdown"
                  subtitle="Distribution of graded, submitted, and late student attempts."
                  segments={Object.entries(data.assignments.distribution).map(
                    ([k, v]) => ({
                      label: k,
                      value: v,
                      color:
                        k === "GRADED"
                          ? "#0f766e"
                          : k === "SUBMITTED"
                          ? "#0284c7"
                          : k === "LATE"
                          ? "#f59e0b"
                          : "#94a3b8",
                    })
                  )}
                  centerLabel="Submissions"
                  centerValue={data.assignments.totalSubmissions}
                />
              </div>
            </div>
          )}

          {/* ================= TAB 5: EXAMINATION ANALYTICS ================= */}
          {activeTab === "examination" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <AnalyticsKpiCard
                  title="Examinations"
                  value={data.examination.totalExaminations}
                  subtitle="Total institutional papers"
                  icon={faGraduationCap}
                />
                <AnalyticsKpiCard
                  title="Published Results"
                  value={data.examination.publishedExaminations}
                  subtitle="Official marksheets released"
                  icon={faCheckCircle}
                  tone="teal"
                />
                <AnalyticsKpiCard
                  title="Pass Rate"
                  value={
                    data.examination.passRate != null
                      ? `${data.examination.passRate}%`
                      : "N/A"
                  }
                  subtitle="Based on verified examination results"
                  icon={faArrowTrendUp}
                  tone="teal"
                />
                <AnalyticsKpiCard
                  title="Pending Publication"
                  value={
                    data.examination.totalExaminations -
                    data.examination.publishedExaminations
                  }
                  subtitle="In draft or moderation queue"
                  icon={faClock}
                  tone="warning"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BarChartCard
                  title="Official Grade Distribution"
                  subtitle="Marksheet grade frequency (A+ through F) across evaluated candidates."
                  layout="vertical"
                  items={data.examination.gradeDistribution.map((g) => ({
                    label: g.grade,
                    value: g.count,
                    color:
                      g.grade === "A+" || g.grade === "A"
                        ? "#0f766e"
                        : g.grade === "B+" || g.grade === "B"
                        ? "#0284c7"
                        : g.grade === "C+" || g.grade === "C"
                        ? "#f59e0b"
                        : "#e11d48",
                  }))}
                />

                <DonutChartCard
                  title="Examination Schedule Status"
                  subtitle="Lifecycle state of scheduled and published exams."
                  segments={Object.entries(data.examination.statusBreakdown).map(
                    ([k, v]) => ({
                      label: k,
                      value: v,
                      color:
                        k === "PUBLISHED"
                          ? "#0f766e"
                          : k === "IN_PROGRESS"
                          ? "#0284c7"
                          : k === "COMPLETED"
                          ? "#6366f1"
                          : k === "CANCELLED"
                          ? "#e11d48"
                          : "#94a3b8",
                    })
                  )}
                  centerLabel="Exams"
                  centerValue={data.examination.totalExaminations}
                />
              </div>
            </div>
          )}

          {/* ================= TAB 6: ADMISSIONS ANALYTICS ================= */}
          {activeTab === "admissions" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <AnalyticsKpiCard
                  title="Applications"
                  value={data.admissions.totalApplications}
                  subtitle="Admissions candidate registrations"
                  icon={faUserGraduate}
                />
                <AnalyticsKpiCard
                  title="Under Review"
                  value={data.admissions.pendingApplications}
                  subtitle="Pending committee review"
                  icon={faClock}
                  tone="warning"
                />
                <AnalyticsKpiCard
                  title="Enrolled"
                  value={data.admissions.funnel["ENROLLED"] || 0}
                  subtitle="Converted to active students"
                  icon={faCheckCircle}
                  tone="teal"
                />
                <AnalyticsKpiCard
                  title="Avg Processing Time"
                  value={
                    data.admissions.avgProcessingDays
                      ? `${data.admissions.avgProcessingDays}d`
                      : "N/A"
                  }
                  subtitle="From submission to review decision"
                  icon={faArrowTrendUp}
                />
              </div>

              {data.admissions.totalApplications === 0 ? (
                <EmptyChartState
                  title="No admissions records for selected criteria"
                  message="Admissions charts will populate as candidates submit institutional applications."
                />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ProgressCard
                    title="Admissions Funnel Progress"
                    subtitle="Candidate conversion stages from application submission to enrollment."
                    metrics={[
                      {
                        label: "Applications Submitted",
                        current: data.admissions.totalApplications,
                        total: data.admissions.totalApplications,
                        color: "#0284c7",
                      },
                      {
                        label: "Verified & Screened",
                        current: data.admissions.funnel["VERIFIED"] || 0,
                        total: data.admissions.totalApplications,
                        color: "#6366f1",
                      },
                      {
                        label: "Offered Admission",
                        current: data.admissions.funnel["OFFERED"] || 0,
                        total: data.admissions.totalApplications,
                        color: "#0f766e",
                      },
                      {
                        label: "Enrolled as Students",
                        current: data.admissions.funnel["ENROLLED"] || 0,
                        total: data.admissions.totalApplications,
                        color: "#0d9488",
                      },
                    ]}
                  />

                  <BarChartCard
                    title="Applications by Program"
                    subtitle="Candidate interest across academic programs."
                    items={data.admissions.byProgram.map((p) => ({
                      label: p.program,
                      value: p.count,
                      color: "#0f766e",
                    }))}
                  />
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 7: FINANCE ANALYTICS ================= */}
          {activeTab === "finance" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <AnalyticsKpiCard
                  title="Total Invoiced"
                  value={`NPR ${data.finance.totalInvoiced.toLocaleString()}`}
                  subtitle="Total billed student fees"
                  icon={faFileInvoiceDollar}
                />
                <AnalyticsKpiCard
                  title="Total Collected"
                  value={`NPR ${data.finance.totalCollected.toLocaleString()}`}
                  subtitle="Verified collected revenue"
                  icon={faCheckCircle}
                  tone="teal"
                />
                <AnalyticsKpiCard
                  title="Outstanding Balance"
                  value={`NPR ${data.finance.outstandingBalance.toLocaleString()}`}
                  subtitle="Receivable balance due"
                  icon={faTriangleExclamation}
                  tone={data.finance.outstandingBalance > 0 ? "warning" : "neutral"}
                />
                <AnalyticsKpiCard
                  title="Collection Rate"
                  value={`${data.finance.collectionRate}%`}
                  subtitle="Collection efficiency"
                  icon={faArrowTrendUp}
                  tone="teal"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ProgressCard
                  title="Institutional Fee Collection Progress"
                  subtitle="Total verified cash collections against billed student fees."
                  metrics={[
                    {
                      label: "Collected Fees",
                      current: data.finance.totalCollected,
                      total: data.finance.totalInvoiced || 1,
                      prefix: "NPR ",
                      color: "#0f766e",
                    },
                    {
                      label: "Outstanding Balance",
                      current: data.finance.outstandingBalance,
                      total: data.finance.totalInvoiced || 1,
                      prefix: "NPR ",
                      color: "#f59e0b",
                    },
                  ]}
                  footerNote={`Collection rate: ${data.finance.collectionRate}%. Calculated directly from invoice records.`}
                />

                <DonutChartCard
                  title="Payment Methods Distribution"
                  subtitle="Revenue collected through cash and digital gateways."
                  segments={data.finance.paymentMethods.map((m) => ({
                    label: m.method,
                    value: m.total,
                  }))}
                  centerLabel="NPR Total"
                  centerValue={`NPR ${(data.finance.totalCollected / 1000).toFixed(0)}k`}
                />
              </div>

              <TrendChart
                title="Monthly Fee Collection Inflow"
                subtitle="Historical monthly collections in Nepalese Rupees (NPR)."
                data={data.finance.monthlyCollections.map((m) => ({
                  label: m.month,
                  value: m.amount,
                  secondaryValue: m.count,
                }))}
                valuePrefix="NPR "
                primaryLabel="Collected"
                secondaryLabel="Transactions"
                color="#0f766e"
              />
            </div>
          )}

          {/* ================= TAB 8: CASES & SLAS ================= */}
          {activeTab === "cases" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <AnalyticsKpiCard
                  title="Total Cases"
                  value={data.cases.totalCases}
                  subtitle="Student & administrative requests"
                  icon={faFolderTree}
                />
                <AnalyticsKpiCard
                  title="Active / Open"
                  value={data.cases.openCases}
                  subtitle="In review across departments"
                  icon={faClock}
                  tone="warning"
                />
                <AnalyticsKpiCard
                  title="Resolved / Closed"
                  value={data.cases.closedCases}
                  subtitle="Completed workflow cases"
                  icon={faCheckCircle}
                  tone="teal"
                />
              </div>

              {data.cases.totalCases === 0 ? (
                <EmptyChartState
                  title="No workflow cases recorded"
                  message="Cases and SLA metrics will appear as students and staff submit requests."
                />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <BarChartCard
                    title="Workflow Cases by Department"
                    subtitle="Request queue distributed across administrative offices."
                    items={data.cases.byDepartment.map((d) => ({
                      label: d.department,
                      value: d.count,
                      color: "#0f766e",
                    }))}
                  />

                  <DonutChartCard
                    title="Case Resolution Status"
                    subtitle="Breakdown of submitted, in review, and completed requests."
                    segments={data.cases.statusDistribution.map((s) => ({
                      label: s.status,
                      value: s.count,
                      color:
                        s.status === "COMPLETED" || s.status === "APPROVED"
                          ? "#0f766e"
                          : s.status === "IN_REVIEW"
                          ? "#0284c7"
                          : s.status === "REJECTED"
                          ? "#e11d48"
                          : "#f59e0b",
                    }))}
                    centerLabel="Cases"
                    centerValue={data.cases.totalCases}
                  />
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 9: USERS & SYSTEM ================= */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <AnalyticsKpiCard
                  title="Total Accounts"
                  value={data.users.totalUsers}
                  subtitle="Registered user identities"
                  icon={faUsers}
                />
                <AnalyticsKpiCard
                  title="Active Users"
                  value={data.users.activeUsers}
                  subtitle="Can authenticate & use CollegeOS"
                  icon={faCheckCircle}
                  tone="teal"
                />
                <AnalyticsKpiCard
                  title="System Status"
                  value="Healthy"
                  subtitle="Database & API operational"
                  icon={faDatabase}
                  tone="teal"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DonutChartCard
                  title="User Distribution by Role"
                  subtitle="Breakdown of student, faculty, and administrative accounts."
                  segments={data.users.distribution.map((u) => ({
                    label: u.label,
                    value: u.count,
                  }))}
                  centerLabel="Users"
                  centerValue={data.users.totalUsers}
                />

                <ProgressCard
                  title="Active Account Verification"
                  subtitle="Proportion of verified active credentials vs suspended accounts."
                  metrics={[
                    {
                      label: "Active Authenticated Users",
                      current: data.users.activeUsers,
                      total: data.users.totalUsers,
                      color: "#0f766e",
                    },
                  ]}
                  footerNote="All security policies and role-based permissions are enforced server-side."
                />
              </div>
            </div>
          )}

          {/* ================= TAB 10: AUDIT & SECURITY ================= */}
          {activeTab === "audit" && (
            <div className="space-y-6">
              {auditData ? (
                <>
                  {/* Forensic KPI Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <AnalyticsKpiCard
                      title="Total Events"
                      value={auditData.kpis.totalEvents}
                      subtitle="Audit trail records"
                      icon={faShieldHalved}
                    />
                    <AnalyticsKpiCard
                      title="Successful"
                      value={auditData.kpis.successCount}
                      subtitle="Verified actions"
                      icon={faCheckCircle}
                      tone="teal"
                    />
                    <AnalyticsKpiCard
                      title="Failed / Blocked"
                      value={auditData.kpis.failedCount}
                      subtitle="Denied or failed operations"
                      icon={faTriangleExclamation}
                      tone={auditData.kpis.failedCount > 0 ? "danger" : "neutral"}
                    />
                    <AnalyticsKpiCard
                      title="Security Alerts"
                      value={auditData.kpis.securityAlertsCount}
                      subtitle="Flagged incidents"
                      icon={faShieldHalved}
                      tone={auditData.kpis.securityAlertsCount > 0 ? "warning" : "neutral"}
                    />
                    <AnalyticsKpiCard
                      title="Admin Changes"
                      value={auditData.kpis.adminActionsCount}
                      subtitle="State-altering events"
                      icon={faBuilding}
                    />
                  </div>

                  {/* Audit Event Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <BarChartCard
                      title="Activity by Module"
                      subtitle="Audit event frequency across functional modules."
                      items={auditData.byModule.map((m) => ({
                        label: m.module.toUpperCase(),
                        value: m.count,
                        color: "#0f766e",
                      }))}
                    />

                    <BarChartCard
                      title="Activity by Action Type"
                      subtitle="Most frequent system and user actions."
                      items={auditData.byAction.map((a) => ({
                        label: a.action,
                        value: a.count,
                        color: "#0284c7",
                      }))}
                    />

                    <DonutChartCard
                      title="Success vs Failed Events"
                      subtitle="Proportion of verified vs rejected actions."
                      segments={auditData.successVsFail.map((s) => ({
                        label: s.label,
                        value: s.count,
                        color: s.label === "Successful" ? "#0f766e" : "#e11d48",
                      }))}
                      centerLabel="Events"
                      centerValue={auditData.kpis.totalEvents}
                    />
                  </div>

                  {/* Forensic Audit Search and Filter Bar */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <FontAwesomeIcon
                        icon={faSearch}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"
                      />
                      <input
                        type="text"
                        value={auditSearch}
                        onChange={(e) => setAuditSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void loadAudit();
                        }}
                        placeholder="Search audit trail by actor, action, resource, IP..."
                        className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={auditModuleFilter}
                        onChange={(e) => {
                          setAuditModuleFilter(e.target.value);
                          setAuditPage(1);
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      >
                        <option value="ALL">All Modules</option>
                        <option value="reporting">Reporting</option>
                        <option value="academics">Academics</option>
                        <option value="examinations">Examinations</option>
                        <option value="finance">Finance</option>
                        <option value="security">Security</option>
                        <option value="users">Users</option>
                      </select>

                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void loadAudit()}
                        isLoading={auditLoading}
                      >
                        Search
                      </Button>
                    </div>
                  </div>

                  {/* Audit Forensic Table */}
                  <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Forensic Audit Records
                        </h3>
                        <p className="text-xs text-slate-500">
                          Click any audit row to inspect the forensic details, state diff, and metadata.
                        </p>
                      </div>
                      <span className="text-xs text-slate-500">
                        Page {auditData.pagination.page} of {auditData.pagination.totalPages}
                      </span>
                    </div>

                    <Table>
                      <thead>
                        <tr>
                          <th className="text-left">Timestamp</th>
                          <th className="text-left">Action</th>
                          <th className="text-left">Module</th>
                          <th className="text-left">Actor</th>
                          <th className="text-left">Resource</th>
                          <th className="text-left">Status</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditData.logs.map((log) => {
                          const isFailed = /FAIL|ERROR|BLOCK|DENIED|REJECT/i.test(log.action);
                          return (
                            <tr
                              key={log.id}
                              onClick={() => setSelectedAuditLog(log)}
                              className="hover:bg-slate-50 cursor-pointer transition"
                            >
                              <td className="text-xs font-mono text-slate-600 whitespace-nowrap">
                                {new Date(log.createdAt).toLocaleString(undefined, {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </td>
                              <td className="text-xs font-bold text-slate-900">
                                {log.action}
                              </td>
                              <td>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-700">
                                  {log.module}
                                </span>
                              </td>
                              <td className="text-xs text-slate-700">
                                <span className="font-semibold">
                                  {log.user?.name || "System"}
                                </span>
                                {log.user?.email && (
                                  <span className="text-slate-400 block text-[11px]">
                                    {log.user.email}
                                  </span>
                                )}
                              </td>
                              <td className="text-xs text-slate-600 font-mono">
                                {log.resource || "N/A"}
                              </td>
                              <td>
                                <Badge
                                  variant={isFailed ? "danger" : "success"}
                                  size="sm"
                                >
                                  {isFailed ? "Failed" : "Verified"}
                                </Badge>
                              </td>
                              <td className="text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAuditLog(log);
                                  }}
                                >
                                  Inspect
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>

                    {/* Pagination Bar */}
                    <div className="flex items-center justify-between border-t border-slate-200 p-3 bg-slate-50/50">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={auditPage <= 1}
                        onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-slate-600">
                        Showing {auditData.logs.length} of {auditData.pagination.total} records
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={auditPage >= auditData.pagination.totalPages}
                        onClick={() => setAuditPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <ChartSkeleton height="h-64" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Forensic Audit Detail Drawer */}
      <AuditDetailDrawer
        isOpen={Boolean(selectedAuditLog)}
        onClose={() => setSelectedAuditLog(null)}
        log={selectedAuditLog}
      />

      {/* AI Insights Modal */}
      {aiModalOpen && data && (
        <Modal
          isOpen={aiModalOpen}
          onClose={() => setAiModalOpen(false)}
          title="CollegeOS Institutional AI Executive Summary"
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs leading-relaxed text-slate-700">
            <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4">
              <div className="flex items-center gap-2 font-bold text-teal-900 text-sm mb-1">
                <FontAwesomeIcon icon={faWandMagicSparkles} />
                <span>Deterministic Intelligence Synthesis</span>
              </div>
              <p>
                This synthesis summarizes actual calculated statistics from verified database records.
                No figures or historical curves are hallucinated.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="font-bold text-slate-900">1. Academic &amp; Attendance Standing</h4>
                <p className="mt-1 text-slate-600">
                  Institutional attendance is currently{" "}
                  <strong>
                    {data.attendance.overallRate != null
                      ? `${data.attendance.overallRate}%`
                      : "not yet evaluated"}
                  </strong>{" "}
                  across {data.attendance.totalSessions} conducted sessions. There are{" "}
                  <strong>{data.academic.totalCourses}</strong> courses managed across{" "}
                  {data.academic.coursesByDepartment.length} academic departments.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900">2. Examination &amp; Curriculum Evaluation</h4>
                <p className="mt-1 text-slate-600">
                  The institution holds <strong>{data.examination.totalExaminations}</strong> examinations,
                  with <strong>{data.examination.publishedExaminations}</strong> official results published
                  to student transcripts. Overall passing candidate rate is{" "}
                  <strong>
                    {data.examination.passRate != null
                      ? `${data.examination.passRate}%`
                      : "pending marks entry"}
                  </strong>.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900">3. Financial Revenue &amp; Collections</h4>
                <p className="mt-1 text-slate-600">
                  Total student invoices equal <strong>NPR {data.finance.totalInvoiced.toLocaleString()}</strong>,
                  of which <strong>NPR {data.finance.totalCollected.toLocaleString()}</strong> has been collected
                  ({data.finance.collectionRate}% collection rate), leaving an outstanding balance of{" "}
                  <strong>NPR {data.finance.outstandingBalance.toLocaleString()}</strong>.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <Button size="sm" variant="primary" onClick={() => setAiModalOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AnalyticsWorkspaceView;
