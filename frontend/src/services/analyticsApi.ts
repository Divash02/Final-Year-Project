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

// Website Usage & Behavior Analytics Types
export interface WebsiteUsageOverviewResponse {
  totalVisits: number;
  uniqueUsers: number;
  activeUsersNow: number;
  totalSessions: number;
  avgSessionDuration: number;
  avgActiveSessionDuration: number;
  totalTimeSpent: number;
  avgPagesPerSession: number;
  returningUsers: number;
  newUsers: number;
  peakConcurrentUsers: number;
  sessionTimeline: Array<{ period: string; sessions: number }>;
  topModules: Array<{ module: string; visits: number; uniqueUsers: number; avgTimePerVisit: number }>;
}

export interface UserActivityTableResponse {
  users: Array<{
    userId: string;
    userName: string;
    email: string;
    role: string;
    department: string | null;
    lastLogin: string | null;
    lastActive: string | null;
    totalSessions: number;
    totalTimeSpent: number;
    avgSessionDuration: number;
    mostVisitedModule: string;
    totalPagesVisited: number;
    accountStatus: string;
    isActiveNow: boolean;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IndividualUserActivityResponse {
  user: {
    userId: string;
    userName: string;
    email: string;
    role: string;
    accountStatus: string;
    lastLogin: string | null;
  };
  overview: {
    totalVisits: number;
    totalTimeSpent: number;
    avgSessionDuration: number;
    totalPagesVisited: number;
  };
  activityHistory: Array<{
    timestamp: string;
    action: string;
    module: string;
    route: string | null;
    isIdle: boolean;
  }>;
  moduleUsage: Array<{
    module: string;
    visits: number;
    uniqueUsers: number;
    totalTime: number;
  }>;
  sessions: Array<{
    sessionId: string;
    loginAt: string;
    logoutAt: string | null;
    lastActiveAt: string;
    activeDuration: number;
    idleDuration: number;
    totalDuration: number;
    sessionStatus: string;
    pagesVisited: number;
    modulesAccessed: string[];
  }>;
}

export interface ModuleUsageAnalyticsResponse {
  modules: Array<{
    module: string;
    visits: number;
    uniqueUsers: number;
    totalTime: number;
    avgTimePerVisit: number;
  }>;
  byRole: Array<{
    module: string;
    role: string;
    visits: number;
    uniqueUsers: number;
  }>;
  byDepartment: Array<{
    module: string;
    department: string;
    visits: number;
    uniqueUsers: number;
  }>;
  byTime: Array<{
    module: string;
    dayOfWeek: number;
    hour: number;
    visits: number;
  }>;
}

export interface UserBehaviorPatternsResponse {
  frequentlyVisitedModules: Array<{ route: string; visits: number }>;
  commonNavigationPaths: Array<{ from: string; to: string; count: number }>;
  commonStartPages: Array<{ route: string; count: number }>;
  commonExitPages: Array<{ route: string; count: number }>;
  avgSessionDurationByRole: Array<{ role: string; avgDuration: number }>;
  peakUsageDays: Array<{ date: string; visits: number }>;
  peakUsageHours: Array<{ hour: number; visits: number }>;
  returningUserPatterns: {
    avgVisitsPerUser: number;
    avgDaysPerUser: number;
    returningUsers: number;
    totalUsers: number;
  };
}

// System Performance Analytics Types
export interface SystemPerformanceOverviewResponse {
  current: {
    cpuUsage: number | null;
    hostCpuUsage: number | null;
    memoryUsage: number | null;
    hostMemoryUsage: number | null;
    memoryUsed: number | null;
    memoryTotal: number | null;
    apiResponseTime: number | null;
    apiResponseTimeP50: number | null;
    apiResponseTimeP95: number | null;
    apiResponseTimeP99: number | null;
    databaseResponseTime: number | null;
    concurrentUsers: number;
    activeSessions: number;
    requestsPerMinute: number;
    errorRate: number;
    serverUptime: number | null;
    systemHealthStatus: string;
    activeConnections: number | null;
    connectionPoolUtilization: number | null;
  };
  summary: {
    avgCpu: number;
    maxCpu: number;
    minCpu: number;
    avgMemory: number;
    maxMemory: number;
    avgApiResponse: number;
    maxApiResponse: number;
    avgDbResponse: number;
    avgErrorRate: number;
    avgConcurrentUsers: number;
    maxConcurrentUsers: number;
    avgRequestsPerMinute: number;
    totalSlowRequests: number;
    totalSlowQueries: number;
    totalFailedQueries: number;
  };
  activeAlertsCount: number;
}

export interface CpuPerformanceHistoryResponse {
  processCpu: Array<{ timestamp: string; avg: number; max: number }>;
  hostCpu: Array<{ timestamp: string; avg: number; max: number }>;
}

export interface MemoryPerformanceHistoryResponse {
  processMemory: Array<{ timestamp: string; avgUsage: number; maxUsage: number; avgUsed: number; avgTotal: number }>;
  hostMemory: Array<{ timestamp: string; avgUsage: number; maxUsage: number; avgUsed: number; avgTotal: number }>;
}

export interface ApiPerformanceHistoryResponse {
  timeline: Array<{
    timestamp: string;
    avgResponse: number;
    maxResponse: number;
    p50: number;
    p95: number;
    p99: number;
    errorRate: number;
    requestsPerMinute: number;
    slowRequests: number;
  }>;
  endpointPerformance: Array<unknown>;
}

export interface DatabasePerformanceHistoryResponse {
  timeline: Array<{
    timestamp: string;
    avgResponse: number;
    maxResponse: number;
    avgConnections: number;
    maxConnections: number;
    avgPoolUtilization: number;
    slowQueries: number;
    failedQueries: number;
    totalOperations: number;
  }>;
}

export interface PeakUsageAnalyticsResponse {
  hourlyUsage: Array<{ hour: number; avgConcurrent: number; maxConcurrent: number; avgRequests: number }>;
  dailyUsage: Array<{ date: string; avgConcurrent: number; maxConcurrent: number; totalRequests: number }>;
  weeklyUsage: Array<{ week: number; avgConcurrent: number; maxConcurrent: number; totalRequests: number }>;
  monthlyUsage: Array<{ month: string; avgConcurrent: number; maxConcurrent: number; totalRequests: number }>;
  concurrentTimeline: Array<{ timestamp: string; concurrent: number; requests: number }>;
  weekdayHourHeatmap: Array<{ dayOfWeek: number; hour: number; avgConcurrent: number; maxConcurrent: number }>;
  peakStats: {
    peakHour: number;
    peakHourConcurrent: number;
    peakDate: string;
    peakDateConcurrent: number;
    currentConcurrent: number;
    avgConcurrent: number;
  };
}

export interface PerformanceAlertResponse {
  alerts: Array<{
    id: string;
    metricType: string;
    severity: string;
    title: string;
    message: string;
    threshold: number;
    currentValue: number;
    unit: string;
    firstDetectedAt: string;
    lastDetectedAt: string;
    acknowledgedAt: string | null;
    acknowledgedBy: unknown;
    resolvedAt: string | null;
    resolvedBy: unknown;
    status: string;
    affectedService: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HistoricalComparisonResponse {
  period: string;
  currentPeriod: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  metrics: {
    cpu: { current: number; previous: number; change: number };
    memory: { current: number; previous: number; change: number };
    apiResponseTime: { current: number; previous: number; change: number };
    errorRate: { current: number; previous: number; change: number };
    concurrentUsers: { current: number; previous: number; change: number };
    peakConcurrentUsers: { current: number; previous: number; change: number };
    totalRequests: { current: number; previous: number; change: number };
    totalSessions: { current: number; previous: number; change: number };
    avgSessionDuration: { current: number; previous: number; change: number };
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

// Website Usage Analytics API
export async function fetchWebsiteUsageOverview(filters: {
  startDate?: string;
  endDate?: string;
  department?: string;
  role?: string;
  academicYear?: string;
}): Promise<WebsiteUsageOverviewResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);
  if (filters.department && filters.department !== "ALL") query.set("department", filters.department);
  if (filters.role && filters.role !== "ALL") query.set("role", filters.role);
  if (filters.academicYear && filters.academicYear !== "ALL") query.set("academicYear", filters.academicYear);

  const qs = query.toString();
  return apiRequest<WebsiteUsageOverviewResponse>(`/analytics/website/overview${qs ? `?${qs}` : ""}`);
}

export async function fetchUserActivityTable(filters: {
  startDate?: string;
  endDate?: string;
  department?: string;
  role?: string;
  academicYear?: string;
  userId?: string;
  page?: number;
  limit?: number;
  activeOnly?: boolean;
}): Promise<UserActivityTableResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);
  if (filters.department && filters.department !== "ALL") query.set("department", filters.department);
  if (filters.role && filters.role !== "ALL") query.set("role", filters.role);
  if (filters.academicYear && filters.academicYear !== "ALL") query.set("academicYear", filters.academicYear);
  if (filters.userId) query.set("userId", filters.userId);
  if (filters.page) query.set("page", String(filters.page));
  if (filters.limit) query.set("limit", String(filters.limit));
  if (filters.activeOnly) query.set("activeOnly", "true");

  const qs = query.toString();
  return apiRequest<UserActivityTableResponse>(`/analytics/website/users${qs ? `?${qs}` : ""}`);
}

export async function fetchIndividualUserActivity(userId: string, filters: {
  startDate?: string;
  endDate?: string;
}): Promise<IndividualUserActivityResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);

  const qs = query.toString();
  return apiRequest<IndividualUserActivityResponse>(`/analytics/website/users/${userId}${qs ? `?${qs}` : ""}`);
}

export async function fetchModuleUsageAnalytics(filters: {
  startDate?: string;
  endDate?: string;
  department?: string;
  role?: string;
  academicYear?: string;
}): Promise<ModuleUsageAnalyticsResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);
  if (filters.department && filters.department !== "ALL") query.set("department", filters.department);
  if (filters.role && filters.role !== "ALL") query.set("role", filters.role);
  if (filters.academicYear && filters.academicYear !== "ALL") query.set("academicYear", filters.academicYear);

  const qs = query.toString();
  return apiRequest<ModuleUsageAnalyticsResponse>(`/analytics/website/modules${qs ? `?${qs}` : ""}`);
}

export async function fetchUserBehaviorPatterns(filters: {
  startDate?: string;
  endDate?: string;
  department?: string;
  role?: string;
}): Promise<UserBehaviorPatternsResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);
  if (filters.department && filters.department !== "ALL") query.set("department", filters.department);
  if (filters.role && filters.role !== "ALL") query.set("role", filters.role);

  const qs = query.toString();
  return apiRequest<UserBehaviorPatternsResponse>(`/analytics/website/behavior${qs ? `?${qs}` : ""}`);
}

// System Performance Analytics API
export async function fetchSystemPerformanceOverview(filters: {
  startDate?: string;
  endDate?: string;
  interval?: string;
}): Promise<SystemPerformanceOverviewResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);
  if (filters.interval) query.set("interval", filters.interval);

  const qs = query.toString();
  return apiRequest<SystemPerformanceOverviewResponse>(`/analytics/system/overview${qs ? `?${qs}` : ""}`);
}

export async function fetchCpuPerformanceHistory(filters: {
  startDate?: string;
  endDate?: string;
  interval?: string;
}): Promise<CpuPerformanceHistoryResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);
  if (filters.interval) query.set("interval", filters.interval);

  const qs = query.toString();
  return apiRequest<CpuPerformanceHistoryResponse>(`/analytics/system/cpu${qs ? `?${qs}` : ""}`);
}

export async function fetchMemoryPerformanceHistory(filters: {
  startDate?: string;
  endDate?: string;
  interval?: string;
}): Promise<MemoryPerformanceHistoryResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);
  if (filters.interval) query.set("interval", filters.interval);

  const qs = query.toString();
  return apiRequest<MemoryPerformanceHistoryResponse>(`/analytics/system/memory${qs ? `?${qs}` : ""}`);
}

export async function fetchApiPerformanceHistory(filters: {
  startDate?: string;
  endDate?: string;
  interval?: string;
}): Promise<ApiPerformanceHistoryResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);
  if (filters.interval) query.set("interval", filters.interval);

  const qs = query.toString();
  return apiRequest<ApiPerformanceHistoryResponse>(`/analytics/system/api${qs ? `?${qs}` : ""}`);
}

export async function fetchDatabasePerformanceHistory(filters: {
  startDate?: string;
  endDate?: string;
  interval?: string;
}): Promise<DatabasePerformanceHistoryResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);
  if (filters.interval) query.set("interval", filters.interval);

  const qs = query.toString();
  return apiRequest<DatabasePerformanceHistoryResponse>(`/analytics/system/database${qs ? `?${qs}` : ""}`);
}

export async function fetchPeakUsageAnalytics(filters: {
  startDate?: string;
  endDate?: string;
}): Promise<PeakUsageAnalyticsResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);

  const qs = query.toString();
  return apiRequest<PeakUsageAnalyticsResponse>(`/analytics/system/peak-usage${qs ? `?${qs}` : ""}`);
}

export async function fetchPerformanceAlerts(filters: {
  status?: string;
  severity?: string;
  metricType?: string;
  page?: number;
  limit?: number;
}): Promise<PerformanceAlertResponse> {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.severity) query.set("severity", filters.severity);
  if (filters.metricType) query.set("metricType", filters.metricType);
  if (filters.page) query.set("page", String(filters.page));
  if (filters.limit) query.set("limit", String(filters.limit));

  const qs = query.toString();
  return apiRequest<PerformanceAlertResponse>(`/analytics/system/alerts${qs ? `?${qs}` : ""}`);
}

export async function acknowledgePerformanceAlert(alertId: string): Promise<unknown> {
  return apiRequest<unknown>(`/analytics/system/alerts/${alertId}/acknowledge`, {
    method: "POST",
  });
}

export async function resolvePerformanceAlert(alertId: string): Promise<unknown> {
  return apiRequest<unknown>(`/analytics/system/alerts/${alertId}/resolve`, {
    method: "POST",
  });
}

export async function fetchHistoricalComparison(filters: {
  period?: string;
  endDate?: string;
}): Promise<HistoricalComparisonResponse> {
  const query = new URLSearchParams();
  if (filters.period) query.set("period", filters.period);
  if (filters.endDate) query.set("endDate", filters.endDate);

  const qs = query.toString();
  return apiRequest<HistoricalComparisonResponse>(`/analytics/system/comparison${qs ? `?${qs}` : ""}`);
}

export async function sendHeartbeat(currentRoute?: string): Promise<{ status: string; sessionStatus: string }> {
  return apiRequest<{ status: string; sessionStatus: string }>("/analytics/heartbeat", {
    method: "POST",
    body: JSON.stringify({ currentRoute }),
  });
}

export async function trackEvent(event: {
  eventType: string;
  module?: string;
  route?: string;
  previousRoute?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ status: string }> {
  return apiRequest<{ status: string }>("/analytics/track", {
    method: "POST",
    body: JSON.stringify(event),
  });
}
