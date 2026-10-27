import { apiRequest } from "./apiClient";

export interface AIAnomalyAlert {
  _id: string;
  event: string;
  module: string;
  affectedRecord: {
    collectionName: string;
    recordId: string;
    identifier?: string;
    label: string;
  };
  reason: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  evidence: Array<{ key: string; label: string; value: any; threshold?: any }>;
  detectionType: "RULE_BASED" | "STATISTICAL" | "AI_ASSISTED";
  recommendedInvestigation: string;
  status: "OPEN" | "INVESTIGATING" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  resolutionNotes?: string;
  createdAt: string;
}

export interface AIActivityLogItem {
  _id: string;
  actor: {
    userId: string;
    fullName: string;
    role: string;
    email: string;
  };
  module: string;
  requestCategory: string;
  queryPrompt?: string;
  recommendation: string;
  humanConfirmation?: {
    required: boolean;
    status: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
    actionKey?: string;
    confirmedBy?: string;
    confirmedAt?: string;
    resolutionNotes?: string;
  };
  proposedAction?: {
    actionKey: string;
    label: string;
    payload?: any;
    riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  };
  executionLatencyMs: number;
  timestamp: string;
}

export interface EarlyWarningItem {
  studentId: string;
  fullName: string;
  program: string;
  semester: number;
  priority: "HIGH" | "MODERATE" | "LOW";
  attendancePercentage: number;
  assignmentCompletionPercentage: number;
  gpa: number;
  feeBalanceDue: number;
  contributingFactors: string[];
  recommendedInterventions: string[];
}

export interface ExamAnalyticsData {
  aggregateCandidates: number;
  totalExamsAudited: number;
  overallPassRate: number;
  gradeDistribution: {
    A: number;
    B: number;
    C: number;
    D: number;
    F: number;
  };
  averageMark: number;
  medianMark: number;
  missingMarksCount: number;
  missingMarksSummary: Array<{
    examTitle: string;
    program: string;
    semester: number;
    missingCount: number;
  }>;
}

export interface FinanceAnalyticsData {
  totalBilledNpr: number;
  totalPaidNpr: number;
  totalOutstandingNpr: number;
  overdueInvoicesCount: number;
  paymentMethodBreakdown: Record<string, { count: number; totalAmount: number }>;
  flaggedDuplicateReferencesCount: number;
}

export interface SecurityEventItem {
  _id: string;
  event: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  userEmail?: string;
  sourceIp: string;
  details: string;
  status: "DETECTED" | "INVESTIGATING" | "CONTAINED" | "RESOLVED";
  createdAt: string;
}

export interface SystemHealthData {
  timestamp: string;
  database: {
    status: string;
    latencyMs: number;
    collectionsCount: number;
  };
  apiHealth: {
    requestsTrackedLastWindow: number;
    totalErrorsLastWindow: number;
    errorRatePercentage: number;
    p95LatencyMs: number;
  };
  server: {
    nodeVersion: string;
    uptimeSeconds: number;
    memoryHeapUsedMb: number;
  };
}

export interface ITServiceData {
  totalAssetsCount: number;
  assetsByCategory: Record<string, number>;
  totalSoftwareLicenses: number;
  openTicketsCount: number;
  recentAssets: Array<{
    _id: string;
    assetTag: string;
    name: string;
    category: string;
    status: string;
    location: string;
    assignedToUser?: { fullName: string };
  }>;
  recentLicenses: Array<{
    _id: string;
    softwareName: string;
    seatsAllocated: number;
    totalSeats: number;
    complianceStatus: string;
  }>;
  recentTickets: Array<{
    _id: string;
    ticketNumber: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    aiAnalysis?: {
      suggestedTroubleshooting: string[];
    };
  }>;
}

export const aiApi = {
  // 1. Overview & Anomaly Engine
  async fetchAnomalies(params?: { module?: string; severity?: string; status?: string }) {
    const q = new URLSearchParams(params as any).toString();
    return apiRequest<{ count: number; alerts: AIAnomalyAlert[] }>(`/ai/anomalies${q ? `?${q}` : ""}`);
  },

  async triggerAnomalyScan() {
    return apiRequest<{ success: boolean; newAlertsCreated: number; alerts: AIAnomalyAlert[] }>("/ai/anomalies/scan", {
      method: "POST",
    });
  },

  async updateAnomalyStatus(alertId: string, status: string, resolutionNotes?: string) {
    return apiRequest<AIAnomalyAlert>(`/ai/anomalies/${alertId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, resolutionNotes }),
    });
  },

  // 2. Natural Language Operations Agent
  async queryOperationsAgent(query: string) {
    return apiRequest<{
      query: string;
      moduleRecognized: string;
      answer: string;
      evidence: any;
      proposedAction?: any;
      humanConfirmationRequired: boolean;
      logId?: string;
    }>("/ai/operations/query", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  },

  // 3. Academic Intelligence
  async fetchEarlyWarnings(department?: string) {
    const q = department ? `?department=${encodeURIComponent(department)}` : "";
    return apiRequest<{ auditedCount: number; highPriorityCount: number; warningList: EarlyWarningItem[] }>(
      `/ai/academic/early-warnings${q}`
    );
  },

  async facultyCopilotAssist(courseId: string, action: string, contextPayload?: any) {
    return apiRequest<{ generatedQuestions?: any[]; feedbackDraft?: string }>(
      "/ai/academic/faculty-copilot",
      {
        method: "POST",
        body: JSON.stringify({ courseId, action, contextPayload }),
      }
    );
  },

  async studentCopilotAssist(prompt?: string) {
    return apiRequest<{ summary: string; studentContext: any }>("/ai/academic/student-copilot", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
  },

  // 4. Examination Intelligence
  async fetchExamAnalytics() {
    return apiRequest<ExamAnalyticsData>("/ai/examination/analytics");
  },

  // 5. Finance Intelligence
  async fetchFinanceAnalytics() {
    return apiRequest<FinanceAnalyticsData>("/ai/finance/analytics");
  },

  // 6. Admissions Intelligence
  async fetchAdmissionsAudit() {
    return apiRequest<{ applicationsCount: number; duplicateFlagsCount: number; applications: any[] }>(
      "/ai/admissions/audit"
    );
  },

  // 7. Case & SLA Intelligence
  async fetchCasesIntelligence() {
    return apiRequest<{
      totalCasesAudited: number;
      approachingSlaCount: number;
      breachedCount: number;
      departmentWorkload: Record<string, number>;
      urgentCases: any[];
    }>("/ai/cases/intelligence");
  },

  // 8. Cybersecurity Operations Center
  async fetchSecurityDashboard() {
    return apiRequest<{
      metrics: { totalEvents24h: number; criticalIncidentsCount: number; failedLogins24h: number };
      eventTimeline: SecurityEventItem[];
      activeThreats: any[];
    }>("/ai/security/dashboard");
  },

  async simulateSecurityIncident(scenario = "CREDENTIAL_STUFFING") {
    return apiRequest<{ success: boolean; scenario: string; alertId: string }>("/ai/security/simulate", {
      method: "POST",
      body: JSON.stringify({ scenario }),
    });
  },

  async investigateSecurityAlert(alertId: string, action: string, investigationNotes?: string) {
    return apiRequest<SecurityEventItem>("/ai/security/investigate", {
      method: "POST",
      body: JSON.stringify({ alertId, action, investigationNotes }),
    });
  },

  // 9. System Health & Reliability
  async fetchSystemHealth() {
    return apiRequest<SystemHealthData>("/ai/system/health");
  },

  async simulateSystemErrorSpike() {
    return apiRequest<{ success: boolean; message: string }>("/ai/system/simulate-incident", {
      method: "POST",
    });
  },

  // 10. AI Activity Log & Human Confirmation
  async fetchActivityLogs(filters?: { role?: string; module?: string; pendingOnly?: boolean }) {
    const q = new URLSearchParams(filters as any).toString();
    return apiRequest<{ count: number; logs: AIActivityLogItem[] }>(`/ai/activity-logs${q ? `?${q}` : ""}`);
  },

  async confirmStagedAction(logId: string, approved: boolean, notes?: string) {
    return apiRequest<{ success: boolean; message: string; log: AIActivityLogItem }>("/ai/actions/confirm", {
      method: "POST",
      body: JSON.stringify({ logId, approved, notes }),
    });
  },

  // 11. Policy Knowledge Assistant (RAG)
  async queryKnowledgeAssistant(query: string) {
    return apiRequest<{
      query: string;
      answer: string;
      citations: Array<{
        documentId: string;
        documentTitle: string;
        sectionTitle: string;
        passage: string;
      }>;
      found: boolean;
    }>("/ai/knowledge/query", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  },

  // 12. Document Intelligence (Transcript)
  async extractTranscript(rawText: string, fileName?: string) {
    return apiRequest<{
      extractedData: {
        fileName: string;
        studentId: string;
        program: string;
        semester: number;
        gpa: number;
        courses: Array<{
          courseCode: string;
          courseName: string;
          credits: number;
          grade: string;
          gradePoint: number;
          sourceLine: string;
        }>;
      };
      proposedAction: any;
    }>("/ai/documents/extract-transcript", {
      method: "POST",
      body: JSON.stringify({ rawText, fileName }),
    });
  },

  // 13. AI Report Generator
  async generateReport(reportPrompt: string) {
    return apiRequest<{
      prompt: string;
      calculatedFacts: Record<string, any>;
      interpretationNotes: string;
      csvExportString: string;
    }>("/ai/reports/generate", {
      method: "POST",
      body: JSON.stringify({ reportPrompt }),
    });
  },

  // 14. What-If Scenario Simulator
  async simulateScenario(scenarioType: string, parameters: Record<string, any>) {
    return apiRequest<{
      scenarioType: string;
      simulationResult: {
        isSimulation: boolean;
        disclaimer: string;
        baselineThreshold: number;
        proposedThreshold: number;
        projectedImpact: {
          flaggedStudentsCount: number;
          impactSummary: string;
        };
      };
    }>("/ai/simulator/simulate", {
      method: "POST",
      body: JSON.stringify({ scenarioType, parameters }),
    });
  },

  // 15. Process Mining
  async fetchProcessMining() {
    return apiRequest<{
      processStages: Array<{
        stageName: string;
        averageHours: number;
        sampleCasesTracked: number;
        isBottleneck: boolean;
        bottleneckReason?: string;
      }>;
      totalCycleTimeHours: number;
      primaryBottleneckStage: string;
      recommendations: string[];
    }>("/ai/process-mining");
  },

  // 16. Multi-Agent Orchestrator
  async auditGraduationReadiness(studentId: string) {
    return apiRequest<{
      studentId: string;
      studentName: string;
      program: string;
      checklist: Array<{
        area: string;
        status: string;
        details: string;
        actionRequired?: string;
      }>;
      allClear: boolean;
      contributingAgents: string[];
    }>("/ai/orchestration/graduation-readiness", {
      method: "POST",
      body: JSON.stringify({ studentId }),
    });
  },

  // 17. IT Service Management (Replaces IoT)
  async fetchITSummary() {
    return apiRequest<ITServiceData>("/ai/it-service/summary");
  },

  async createITTicket(payload: { title: string; description: string; priority?: string; assetTag?: string }) {
    return apiRequest<any>("/ai/it-service/tickets", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // 18. Digital Credentials
  async issueCredential(studentId: string, credentialType = "STUDENT_ID_CARD") {
    return apiRequest<any>("/ai/credentials/issue", {
      method: "POST",
      body: JSON.stringify({ studentId, credentialType }),
    });
  },

  async verifyCredential(credentialNumber: string) {
    return apiRequest<any>(`/ai/credentials/verify/${credentialNumber}`);
  },

  // 19. Smart QR Attendance
  async createQRSession(payload: { courseId: string; sectionCode?: string; durationMinutes?: number; topic?: string }) {
    return apiRequest<any>("/ai/attendance/qr-session", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async checkInViaQR(sessionCode: string, sessionNonce?: string) {
    return apiRequest<any>("/ai/attendance/qr-checkin", {
      method: "POST",
      body: JSON.stringify({ sessionCode, sessionNonce }),
    });
  },
};
