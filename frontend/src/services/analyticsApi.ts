import { apiRequest } from "./apiClient";
import type { AuditLogItem } from "../components/analytics/AuditDetailDrawer";
import type { InstitutionalInsight } from "../components/analytics/InsightCard";

export interface AnalyticsDetailedResponse {
  kpis: {
    totalUsers: number;
    activeUsers: number;
    totalStudents: number;
    activeStudents: number;
    totalCourses: number;
    activeCourses: number;
    totalAssignments: number;
    openAssignments: number;
    totalAttendanceSessions: number;
    overallAttendanceRate: number | null;
    totalExaminations: number;
    publishedExaminations: number;
    overallPassRate: number | null;
    totalAdmissionApplications: number;
    pendingAdmissionApplications: number;
    totalCases: number;
    openCases: number;
    totalInvoiced: number;
    totalCollected: number;
    outstandingBalance: number;
    collectionRate: number;
  };
  academic: {
    totalCourses: number;
    activeCourses: number;
    archivedCourses: number;
    coursesByDepartment: Array<{ name: string; count: number }>;
    courseStatusDistribution: Array<{ status: string; count: number }>;
  };
  attendance: {
    totalRecords: number;
    totalSessions: number;
    distribution: Record<string, number>;
    overallRate: number | null;
    trends: Array<{
      date: string;
      total: number;
      present: number;
      absent: number;
      rate: number;
    }>;
  };
  assignments: {
    totalAssignments: number;
    openAssignments: number;
    totalSubmissions: number;
    gradedSubmissions: number;
    gradingProgressRate: number;
    distribution: Record<string, number>;
  };
  examination: {
    totalExaminations: number;
    publishedExaminations: number;
    statusBreakdown: Record<string, number>;
    passRate: number | null;
    gradeDistribution: Array<{ grade: string; count: number }>;
  };
  admissions: {
    totalApplications: number;
    pendingApplications: number;
    funnel: Record<string, number>;
    byProgram: Array<{ program: string; count: number }>;
    avgProcessingDays: string | null;
  };
  finance: {
    totalInvoiced: number;
    totalCollected: number;
    outstandingBalance: number;
    collectionRate: number;
    paymentMethods: Array<{ method: string; total: number; count: number }>;
    monthlyCollections: Array<{ month: string; amount: number; count: number }>;
    invoicesByStatus: Array<{ status: string; count: number; amount: number }>;
  };
  cases: {
    totalCases: number;
    openCases: number;
    closedCases: number;
    byDepartment: Array<{ department: string; count: number }>;
    statusDistribution: Array<{ status: string; count: number }>;
  };
  users: {
    totalUsers: number;
    activeUsers: number;
    distribution: Array<{ role: string; label: string; count: number }>;
  };
  insights: InstitutionalInsight[];
  metadata: {
    calculatedAt: string;
    filtersApplied: Record<string, unknown>;
  };
}

export interface AuditAnalyticsResponse {
  kpis: {
    totalEvents: number;
    successCount: number;
    failedCount: number;
    securityAlertsCount: number;
    adminActionsCount: number;
  };
  byModule: Array<{ module: string; count: number }>;
  byAction: Array<{ action: string; count: number }>;
  successVsFail: Array<{ label: string; count: number }>;
  trend: Array<{ date: string; count: number }>;
  logs: AuditLogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchDetailedAnalytics(filters: {
  department?: string;
  program?: string;
  semester?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AnalyticsDetailedResponse> {
  const query = new URLSearchParams();
  if (filters.department && filters.department !== "ALL") query.set("department", filters.department);
  if (filters.program && filters.program !== "ALL") query.set("program", filters.program);
  if (filters.semester && filters.semester !== "ALL") query.set("semester", filters.semester);
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);

  const qs = query.toString();
  return apiRequest<AnalyticsDetailedResponse>(`/analytics/detailed${qs ? `?${qs}` : ""}`);
}

export async function fetchAuditAnalytics(params: {
  page?: number;
  limit?: number;
  search?: string;
  module?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AuditAnalyticsResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.module && params.module !== "ALL") query.set("module", params.module);
  if (params.action && params.action !== "ALL") query.set("action", params.action);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);

  const qs = query.toString();
  return apiRequest<AuditAnalyticsResponse>(`/audit/analytics${qs ? `?${qs}` : ""}`);
}
