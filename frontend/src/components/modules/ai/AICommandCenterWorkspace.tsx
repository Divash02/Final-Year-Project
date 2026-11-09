import React, { useEffect, useRef, useState } from "react";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { useToast } from "../../ui/ToastContainer";
import { Card } from "../../ui/Card";
import { Badge, BadgeVariant } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Spinner } from "../../ui/Spinner";
import { EmptyState } from "../../ui/EmptyState";
import { Modal } from "../../ui/Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRobot,
  faGraduationCap,
  faFileLines,
  faFileInvoiceDollar,
  faUserPlus,
  faInbox,
  faListCheck,
  faBookBookmark,
  faFilePdf,
  faSliders,
  faDiagramProject,
  faLaptopFile,
  faIdCard,
  faArrowsRotate,
  faPaperPlane,
  faCheck,
  faXmark,
  faWandMagicSparkles,
  faCircleCheck,
  faCircleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  BrainCircuit,
  ShieldCheck,
  Activity,
  Database,
  AlertTriangle,
  Lock,
  FileText,
  Users,
  ServerCog,
  BookOpen,
  BarChart3,
  Network,
  KeyRound,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Send,
  Inbox,
  ListChecks,
  Laptop,
} from "lucide-react";
import {
  aiApi,
  AIAnomalyAlert,
  AIActivityLogItem,
  EarlyWarningItem,
  ExamAnalyticsData,
  FinanceAnalyticsData,
  SecurityEventItem,
  SystemHealthData,
  ITServiceData,
} from "../../../services/aiApi";
import { formatNPR } from "../../../lib/nepaliCalendar";

export type AITab =
  | "overview"
  | "operations"
  | "academic"
  | "examination"
  | "finance"
  | "admissions"
  | "cases"
  | "security"
  | "system_health"
  | "alerts"
  | "activity_log"
  | "knowledge"
  | "documents"
  | "simulator"
  | "process_mining"
  | "it_services"
  | "credentials_attendance";

export const AICommandCenterWorkspace: React.FC = () => {
  const { currentRole } = useCollegeOS();
  const { toast } = useToast();

  const notify = (message: string, detail?: string, variant: "success" | "info" | "warning" | "error" = "info") => {
    toast({ message, detail, variant });
  };

  const [activeTab, setActiveTab] = useState<AITab>("overview");
  const [loading, setLoading] = useState(false);

  // Overview / Anomalies State
  const [anomalies, setAnomalies] = useState<AIAnomalyAlert[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<AIActivityLogItem[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealthData | null>(null);

  // Operations Agent State
  const [agentQuery, setAgentQuery] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentChatHistory, setAgentChatHistory] = useState<
    Array<{
      query: string;
      answer: string;
      evidence?: any;
      proposedAction?: any;
      humanConfirmationRequired?: boolean;
      logId?: string;
    }>
  >([]);

  // Confirmation Modal
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedLogForConfirm, setSelectedLogForConfirm] = useState<AIActivityLogItem | null>(null);
  const [confirmationNotes, setConfirmationNotes] = useState("");

  // Academic / Early Warning State
  const [earlyWarnings, setEarlyWarnings] = useState<EarlyWarningItem[]>([]);
  const [quizTopic, setQuizTopic] = useState("Database Management Systems");
  const [quizDifficulty, setQuizDifficulty] = useState("MEDIUM");
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);
  const [studentCopilotSummary, setStudentCopilotSummary] = useState<any>(null);
  const studentCopilotRequestKey = useRef(crypto.randomUUID());
  const studentCopilotRequested = useRef(false);

  // Examination Analytics State
  const [examAnalytics, setExamAnalytics] = useState<ExamAnalyticsData | null>(null);

  // Finance Analytics State
  const [financeAnalytics, setFinanceAnalytics] = useState<FinanceAnalyticsData | null>(null);

  // Admissions Intelligence State
  const [, setAdmissionsData] = useState<any>(null);

  // Case & SLA Intelligence State
  const [, setCasesData] = useState<any>(null);

  // Cybersecurity State
  const [securityData, setSecurityData] = useState<{
    metrics: any;
    eventTimeline: SecurityEventItem[];
  } | null>(null);

  // Activity Logs State
  const [activityLogs, setActivityLogs] = useState<AIActivityLogItem[]>([]);

  // Knowledge Assistant (RAG) State
  const [ragQuery, setRagQuery] = useState("");
  const [ragResult, setRagResult] = useState<any>(null);
  const [ragLoading, setRagLoading] = useState(false);

  // Document Intelligence State
  const [rawTranscriptText, setRawTranscriptText] = useState(``);
  const [extractedTranscript, setExtractedTranscript] = useState<any>(null);

  // What-If Simulator State
  const [simAttendanceThreshold, setSimAttendanceThreshold] = useState(85);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  // Process Mining State
  const [processMiningData, setProcessMiningData] = useState<any>(null);

  // IT Services State
  const [itData, setITData] = useState<ITServiceData | null>(null);
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [newTicketDesc, setNewTicketDesc] = useState("");

  // Digital Credentials & Attendance State
  const [verifyCertNumber, setVerifyCertNumber] = useState("");
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [activeQRSession, setActiveQRSession] = useState<any>(null);
  const [checkInSessionCode, setCheckInSessionCode] = useState("");

  // Load initial overview metrics
  const loadOverviewData = async () => {
    setLoading(true);
    try {
      const [anomRes, logsRes, healthRes] = await Promise.all([
        aiApi.fetchAnomalies(),
        aiApi.fetchActivityLogs({ pendingOnly: true }),
        aiApi.fetchSystemHealth().catch(() => null),
      ]);
      setAnomalies(anomRes.alerts || []);
      setPendingConfirmations(logsRes.logs || []);
      setSystemHealth(healthRes);
    } catch (err: any) {
      notify("Telemetry Load Error", err.message || "Failed to load intelligence overview telemetry.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverviewData();
  }, []);

  // Filter tabs by role permissions
  const allTabs: Array<{ id: AITab; labelEn: string; icon: any }> = [
    { id: "overview", labelEn: "Overview", icon: BrainCircuit },
    { id: "operations", labelEn: "Operations Agent", icon: Sparkles },
    { id: "academic", labelEn: "Academic & Copilot", icon: BookOpen },
    { id: "examination", labelEn: "Exam Analytics", icon: FileText },
    { id: "finance", labelEn: "Finance Analytics", icon: BarChart3 },
    { id: "admissions", labelEn: "Admissions AI", icon: Users },
    { id: "cases", labelEn: "Cases & SLA", icon: Inbox },
    { id: "security", labelEn: "Security Ops", icon: ShieldCheck },
    { id: "system_health", labelEn: "System Health", icon: ServerCog },
    { id: "alerts", labelEn: "Anomaly Alerts", icon: AlertTriangle },
    { id: "activity_log", labelEn: "Audit Trail", icon: ListChecks },
    { id: "knowledge", labelEn: "Policy RAG", icon: BookOpen },
    { id: "documents", labelEn: "Document AI", icon: FileText },
    { id: "simulator", labelEn: "What-If Simulator", icon: Activity },
    { id: "process_mining", labelEn: "Process Mining", icon: Network },
    { id: "it_services", labelEn: "IT Asset & Service", icon: Laptop },
    { id: "credentials_attendance", labelEn: "Credentials & QR", icon: KeyRound },
  ];

  const availableTabs = allTabs.filter((t) => {
    if (currentRole === "super_admin") return true;
    if (t.id === "overview" || t.id === "operations" || t.id === "knowledge") return true;
    if (t.id === "credentials_attendance") return ["registrar", "faculty", "student"].includes(currentRole);
    if (t.id === "academic") return ["dean", "hod", "program_coordinator", "registrar", "faculty", "student"].includes(currentRole);
    if (t.id === "examination") return ["dean", "hod", "registrar", "exam_officer"].includes(currentRole);
    if (t.id === "finance") return ["finance_officer"].includes(currentRole);
    if (t.id === "admissions") return ["registrar"].includes(currentRole);
    if (t.id === "cases") return ["campus_admin", "dean", "hod", "program_coordinator", "registrar", "exam_officer", "finance_officer"].includes(currentRole);
    if (t.id === "security" || t.id === "it_services") return ["campus_admin"].includes(currentRole);
    if (t.id === "alerts" || t.id === "activity_log") return ["campus_admin", "dean", "hod", "registrar", "exam_officer", "finance_officer"].includes(currentRole);
    if (t.id === "documents") return ["registrar", "exam_officer"].includes(currentRole);
    if (t.id === "simulator" || t.id === "process_mining") return ["dean", "registrar", "hod"].includes(currentRole);
    return false;
  });

  // Handler for Operations Agent
  const handleAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentQuery.trim()) return;
    setAgentLoading(true);
    try {
      const res = await aiApi.queryOperationsAgent(agentQuery.trim(), crypto.randomUUID());
      setAgentChatHistory((prev) => [
        ...prev,
        {
          query: res.query,
          answer: res.answer,
          evidence: res.evidence,
          proposedAction: res.proposedAction,
          humanConfirmationRequired: res.humanConfirmationRequired,
          logId: res.logId,
        },
      ]);
      setAgentQuery("");
      loadOverviewData();
    } catch (err: any) {
      notify("Agent Error", err.message || "Failed to process operations query.", "error");
    } finally {
      setAgentLoading(false);
    }
  };

  // Handler for Action Approval / Rejection
  const handleConfirmAction = async (approved: boolean) => {
    if (!selectedLogForConfirm) return;
    try {
      const res = await aiApi.confirmStagedAction(
        selectedLogForConfirm._id,
        approved,
        confirmationNotes
      );
      notify(approved ? "Action Approved" : "Action Rejected", res.message, approved ? "success" : "info");
      setConfirmModalOpen(false);
      setSelectedLogForConfirm(null);
      setConfirmationNotes("");
      loadOverviewData();
    } catch (err: any) {
      notify("Confirmation Error", err.message || "Failed to submit human confirmation.", "error");
    }
  };

  // Helper for badge variant mapping
  const severityToVariant = (sev: string): BadgeVariant => {
    if (sev === "CRITICAL" || sev === "HIGH") return "danger";
    if (sev === "MEDIUM") return "warning";
    return "info";
  };

  // Load tab-specific data when tab changes
  useEffect(() => {
    if (activeTab === "academic") {
      aiApi.fetchEarlyWarnings().then((res) => setEarlyWarnings(res.warningList || []));
      if (currentRole === "student" && !studentCopilotRequested.current) {
        studentCopilotRequested.current = true;
        aiApi
          .studentCopilotAssist(undefined, studentCopilotRequestKey.current)
          .then((res) => setStudentCopilotSummary(res))
          .catch((err: Error) => notify("Student Copilot Error", err.message, "error"));
      }
    } else if (activeTab === "examination") {
      aiApi.fetchExamAnalytics().then((res) => setExamAnalytics(res));
    } else if (activeTab === "finance") {
      aiApi.fetchFinanceAnalytics().then((res) => setFinanceAnalytics(res));
    } else if (activeTab === "admissions") {
      aiApi.fetchAdmissionsAudit().then((res) => setAdmissionsData(res));
    } else if (activeTab === "cases") {
      aiApi.fetchCasesIntelligence().then((res) => setCasesData(res));
    } else if (activeTab === "security") {
      aiApi.fetchSecurityDashboard().then((res) => setSecurityData(res));
    } else if (activeTab === "system_health") {
      aiApi.fetchSystemHealth().then((res) => setSystemHealth(res));
    } else if (activeTab === "activity_log") {
      aiApi.fetchActivityLogs().then((res) => setActivityLogs(res.logs || []));
    } else if (activeTab === "it_services") {
      aiApi.fetchITSummary().then((res) => setITData(res));
    } else if (activeTab === "process_mining") {
      aiApi.fetchProcessMining().then((res) => setProcessMiningData(res));
    }
  }, [activeTab]);

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1400px] mx-auto bg-neutral-50 min-h-screen">
      {/* Top Banner */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-200">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-900 text-white">
            <BrainCircuit className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-neutral-900 tracking-tight">
              AI Intelligence & Advanced IT Operations
            </h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Institutional AI services, anomaly detection, security operations & verified analytics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={systemHealth?.database?.status === "CONNECTED" ? "success" : "neutral"}
            size="sm"
            hideDot={false}
          >
            DB: {systemHealth?.database?.status || "ONLINE"} · {systemHealth?.database?.latencyMs ?? 2}ms
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={loadOverviewData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 align-middle"
          >
            <RefreshCw className={loading ? "w-3.5 h-3.5 animate-spin inline-block align-middle" : "w-3.5 h-3.5 inline-block align-middle"} strokeWidth={1.5} />
            <span className="inline-block align-middle">Refresh</span>
          </Button>
        </div>
      </header>

      {/* Navigation Sub-Tabs */}
      <nav className="relative">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
          {availableTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon as any;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative flex items-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "text-neutral-900"
                    : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                <span>{tab.labelEn}</span>
                {tab.id === "alerts" && anomalies.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-neutral-900 text-white">
                    {anomalies.length}
                  </span>
                )}
                {tab.id === "overview" && pendingConfirmations.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-amber-600 text-white">
                    {pendingConfirmations.length}
                  </span>
                )}
                {isActive && (
                  <span className="absolute -bottom-[1px] left-0 right-0 h-px bg-neutral-900" />
                )}
              </button>
            );
          })}
        </div>
        <div className="absolute -bottom-px left-0 right-0 h-px bg-neutral-200" />
      </nav>

      {/* Tab 1: AI OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Telemetry KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 bg-rose-50/40 border border-rose-200 rounded-xl hover:border-rose-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-neutral-600">Active Integrity Anomalies</p>
                  <p className="text-2xl font-semibold tracking-tight text-neutral-900">{anomalies.length}</p>
                </div>
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-100 text-rose-600">
                  <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
                </div>
              </div>
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-sm text-rose-700 hover:text-rose-900 px-0 h-auto inline-flex items-center gap-1 align-middle"
                  onClick={() => setActiveTab("alerts")}
                >
                  <span className="inline-block align-middle">View alerts</span>
                  <ArrowRight className="w-3.5 h-3.5 inline-block align-middle" strokeWidth={1.5} />
                </Button>
              </div>
            </Card>

            <Card className="p-5 bg-amber-50/40 border border-amber-200 rounded-xl hover:border-amber-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-neutral-600">Pending Human Confirmations</p>
                  <p className="text-2xl font-semibold tracking-tight text-neutral-900">{pendingConfirmations.length}</p>
                </div>
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 text-amber-700">
                  <Lock className="w-4 h-4" strokeWidth={1.5} />
                </div>
              </div>
              <p className="text-xs text-neutral-600 mt-4">Consequential AI actions gated by policy</p>
            </Card>

            <Card className="p-5 bg-slate-50/60 border border-neutral-200 rounded-xl hover:border-neutral-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-neutral-600">API Error Rate (Window)</p>
                  <p className="text-2xl font-semibold tracking-tight text-neutral-900">
                    {systemHealth?.apiHealth?.errorRatePercentage ?? 0}%
                  </p>
                </div>
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-200/70 text-neutral-700">
                  <Activity className="w-4 h-4" strokeWidth={1.5} />
                </div>
              </div>
              <p className="text-xs text-neutral-600 mt-4">p95 Latency · {systemHealth?.apiHealth?.p95LatencyMs ?? 15}ms</p>
            </Card>

            <Card className="p-5 bg-indigo-50/40 border border-indigo-200 rounded-xl hover:border-indigo-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-neutral-600">Active Role Scoping</p>
                  <p className="text-lg font-semibold tracking-tight text-neutral-900 uppercase mt-1">{currentRole}</p>
                </div>
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700">
                  <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
                </div>
              </div>
              <p className="text-xs text-neutral-600 mt-4">Strict server-side permission gating active</p>
            </Card>
          </div>

           <Card className="p-6 bg-white border border-neutral-200 rounded-xl">
             <div className="flex items-center gap-2 mb-1">
               <Sparkles className="w-4 h-4 text-neutral-700" strokeWidth={1.5} />
               <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Instant AI Operations Agent</h2>
             </div>
             <p className="text-sm text-neutral-500 mb-5">
               Ask natural-language institutional queries. The agent queries verified database models and cites records.
             </p>
             <form onSubmit={handleAgentSubmit} className="flex flex-col sm:flex-row gap-2">
               <input
                 type="text"
                 value={agentQuery}
                 onChange={(e) => setAgentQuery(e.target.value)}
                 placeholder="e.g., Which students have attendance below 75%? or Summarize this month's fee collections"
                 className="flex-1 bg-white border border-neutral-200 rounded-lg px-3.5 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 focus:border-neutral-300 transition-shadow"
               />
               <Button type="submit" size="sm" variant="primary" disabled={agentLoading}>
                 {agentLoading ? <Spinner size={14} /> : <Send className="w-3.5 h-3.5" strokeWidth={1.5} />}
                 <span>Ask Agent</span>
               </Button>
             </form>
           </Card>

          {/* Pending Human Confirmations List */}
          {pendingConfirmations.length > 0 ? (
            <Card className="p-5 bg-white border border-amber-200 rounded-xl">
              <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" strokeWidth={1.5} />
                <h3 className="text-sm font-bold text-slate-900">
                  Pending Consequential Action Approvals ({pendingConfirmations.length})
                </h3>
              </div>
                <Badge variant="warning" size="sm">Human Confirmation Gate</Badge>
              </div>

              <div className="divide-y divide-slate-100">
                {pendingConfirmations.map((log) => (
                  <div key={log._id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        {log.proposedAction?.label}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Initiated by: <span className="font-medium text-slate-700">{log.userName || "AI-assisted request"}</span> &bull; Target:{" "}
                        <span className="font-medium text-slate-700">{log.proposedAction?.targetModule} / {log.proposedAction?.targetRecord}</span> &bull;
                        Action Key: <span className="font-mono text-slate-700">{log.proposedAction?.actionKey}</span> &bull; Risk:{" "}
                        <span className="font-bold text-rose-600">{log.proposedAction?.riskLevel || "HIGH"}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setSelectedLogForConfirm(log);
                          setConfirmModalOpen(true);
                        }}
                      >
                        Review & Confirm
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="p-5 bg-white border border-neutral-200 rounded-xl">
              <EmptyState
                icon={faCircleCheck}
                title="No Consequential Actions Awaiting Approval"
                description="Informational answers and drafts do not enter the human confirmation queue."
              />
            </Card>
          )}

          {/* Recent Anomalies Highlight */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500" strokeWidth={1.5} />
                  <span>Recent Integrity Anomaly Detections</span>
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    setLoading(true);
                    await aiApi.triggerAnomalyScan();
                    await loadOverviewData();
                  }}
                >
                  Scan Now
                </Button>
              </div>

            {anomalies.length === 0 ? (
              <EmptyState
                icon={faCircleCheck}
                title="No Integrity Anomalies Detected"
                description="Deterministic anomaly engine verified payment references, score distributions and access logs."
              />
            ) : (
              <div className="space-y-3">
                {anomalies.slice(0, 3).map((alert) => (
                  <div
                    key={alert._id}
                    className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={severityToVariant(alert.severity)} size="sm">
                          {alert.severity}
                        </Badge>
                        <span className="text-xs font-bold text-slate-900">{alert.event}</span>
                        <span className="text-[11px] text-slate-500">({alert.module})</span>
                      </div>
                      <p className="text-xs text-slate-700 mt-1">{alert.reason}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Record: <span className="font-medium">{alert.affectedRecord?.label}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveTab("alerts")}
                      >
                        Investigate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: AI OPERATIONS AGENT */}
      {activeTab === "operations" && (
        <div className="space-y-4">
          <Card className="p-5 bg-white border border-slate-200 rounded-xl">
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              Natural Language Operations Agent
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Scoped to your authorized permissions. AI answers using verifiable database records and cites evidence.
            </p>

            <form onSubmit={handleAgentSubmit} className="flex gap-2">
              <input
                type="text"
                value={agentQuery}
                onChange={(e) => setAgentQuery(e.target.value)}
                placeholder="Ask any institutional operations question..."
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
              />
              <Button type="submit" size="sm" variant="primary" disabled={agentLoading}>
                {agentLoading ? <Spinner size={14} /> : <FontAwesomeIcon icon={faPaperPlane} />}
                <span className="ml-1.5">Submit</span>
              </Button>
            </form>
          </Card>

          {agentChatHistory.length === 0 ? (
            <EmptyState
              icon={faRobot}
              title="Operations Agent Ready"
              description="Type a question above or try: 'Which students have attendance below 75%?' or 'Show missing marks'"
            />
          ) : (
            <div className="space-y-4">
              {agentChatHistory.map((item, idx) => (
                <Card key={idx} className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-indigo-700">Query #{idx + 1}: &ldquo;{item.query}&rdquo;</span>
                    <Badge variant="neutral" size="sm">Evidence-Backed</Badge>
                  </div>

                  <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                    {item.answer}
                  </div>

                  {item.evidence && (
                    <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                      <p className="text-[11px] font-bold text-indigo-900 mb-1">Supporting Database Evidence:</p>
                      <pre className="text-[10px] text-slate-700 overflow-x-auto">
                        {JSON.stringify(item.evidence, null, 2)}
                      </pre>
                    </div>
                  )}

                  {item.proposedAction && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-amber-900">
                          Proposed Action: {item.proposedAction.label}
                        </p>
                        <p className="text-[11px] text-amber-700">
                          Requires authorized human confirmation before execution.
                        </p>
                      </div>
                      <Badge variant="warning" size="sm">Gate: Pending Confirmation</Badge>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: ACADEMIC INTELLIGENCE & EARLY WARNING */}
      {activeTab === "academic" && (
        <div className="space-y-6">
          {/* Faculty Copilot if Faculty or Admin */}
          {["faculty", "super_admin", "dean", "hod"].includes(currentRole) && (
            <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Faculty AI Copilot: Quiz & Assessment Assistant</h3>
                  <p className="text-xs text-slate-500">Generate rigorous curriculum-aligned assessment questions and rubrics.</p>
                </div>
                <Badge variant="info" size="sm">Faculty Teaching Scope</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Assessment Topic</label>
                  <input
                    type="text"
                    value={quizTopic}
                    onChange={(e) => setQuizTopic(e.target.value)}
                    className="w-full border border-slate-300 rounded-md p-1.5 text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Difficulty</label>
                  <select
                    value={quizDifficulty}
                    onChange={(e) => setQuizDifficulty(e.target.value)}
                    className="w-full border border-slate-300 rounded-md p-1.5 text-xs mt-1"
                  >
                    <option value="EASY">Easy (Foundational)</option>
                    <option value="MEDIUM">Medium (Analytical)</option>
                    <option value="HARD">Hard (Advanced / Evaluative)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    variant="primary"
                    className="w-full"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const res = await aiApi.facultyCopilotAssist("DEMO-COURSE", "GENERATE_QUIZ_QUESTIONS", {
                          topic: quizTopic,
                          difficulty: quizDifficulty,
                          count: 2,
                        });
                        setGeneratedQuestions(res.generatedQuestions || []);
                        notify("Questions Generated", "Quiz questions drafted successfully.", "success");
                      } catch (err: any) {
                        notify("Error", err.message, "error");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Generate Questions
                  </Button>
                </div>
              </div>

              {generatedQuestions.length > 0 && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs font-bold text-slate-800">Generated Questions Draft:</p>
                  {generatedQuestions.map((q, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                      <p className="text-xs font-semibold text-slate-900">{idx + 1}. {q.questionText}</p>
                      {q.options && (
                        <ul className="text-xs text-slate-700 list-disc list-inside space-y-0.5">
                          {q.options.map((opt: string, optIdx: number) => (
                            <li key={optIdx} className={optIdx === q.correctIndex ? "font-bold text-emerald-700" : ""}>
                              {opt} {optIdx === q.correctIndex ? "(Correct Answer)" : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                      {q.suggestedRubric && (
                        <p className="text-[11px] text-indigo-700">Rubric: {q.suggestedRubric}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Student AI Copilot view for Students */}
          {currentRole === "student" && studentCopilotSummary && (
            <Card className="p-5 bg-white border border-indigo-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Student AI Copilot: Academic Progress</h3>
                <Badge variant="success" size="sm">Your Verified Records</Badge>
              </div>
              <div className="p-4 bg-indigo-50/50 rounded-lg text-xs text-slate-800 leading-relaxed border border-indigo-100">
                {studentCopilotSummary.summary}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase">Attendance</p>
                  <p className="text-base font-bold text-slate-900">{studentCopilotSummary.studentContext?.attendancePercentage}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase">Upcoming Exams</p>
                  <p className="text-base font-bold text-slate-900">{studentCopilotSummary.studentContext?.upcomingExamsCount}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase">Fee Due</p>
                  <p className="text-base font-bold text-slate-900">{formatNPR(studentCopilotSummary.studentContext?.feeBalanceDueNpr || 0)}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase">Status</p>
                  <p className="text-base font-bold text-emerald-600">ENROLLED</p>
                </div>
              </div>
            </Card>
          )}

          {/* Early Warning Intelligence Table (for authorized faculty/admin) */}
          {["super_admin", "dean", "hod", "program_coordinator", "registrar", "faculty"].includes(currentRole) && (
            <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Student Early-Warning Intelligence</h3>
                  <p className="text-xs text-slate-500">
                    Deterministic support indicators based on attendance, assignment completion and assessment trends.
                  </p>
                </div>
                <Badge variant="neutral" size="sm">{earlyWarnings.length} Students Flagged</Badge>
              </div>

              {earlyWarnings.length === 0 ? (
                <EmptyState
                  icon={faCircleCheck}
                  title="No At-Risk Students Identified"
                  description="All students in your scope meet baseline attendance and academic requirements."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Student</th>
                        <th className="py-2.5 px-3">Program / Sem</th>
                        <th className="py-2.5 px-3">Priority</th>
                        <th className="py-2.5 px-3">Attendance</th>
                        <th className="py-2.5 px-3">Contributing Factors</th>
                        <th className="py-2.5 px-3">Recommended Intervention</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {earlyWarnings.map((w, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="py-3 px-3 font-medium text-slate-900">
                            {w.fullName}
                            <span className="block text-[11px] text-slate-500">{w.studentId}</span>
                          </td>
                          <td className="py-3 px-3">{w.program} - Sem {w.semester}</td>
                          <td className="py-3 px-3">
                            <Badge variant={w.priority === "HIGH" ? "danger" : w.priority === "MODERATE" ? "warning" : "info"} size="sm">
                              {w.priority} Priority
                            </Badge>
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800">
                            {w.attendancePercentage}%
                          </td>
                          <td className="py-3 px-3">
                            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-700">
                              {w.contributingFactors.map((f, fIdx) => (
                                <li key={fIdx}>{f}</li>
                              ))}
                            </ul>
                          </td>
                          <td className="py-3 px-3 text-[11px] text-indigo-700 font-medium">
                            {w.recommendedInterventions[0] || "Academic Advising Session"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Tab 4: EXAMINATION INTELLIGENCE */}
      {activeTab === "examination" && examAnalytics && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="p-4 bg-white border border-slate-200 text-center">
              <p className="text-xs text-slate-500 uppercase">Candidates Audited</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{examAnalytics.aggregateCandidates}</p>
            </Card>
            <Card className="p-4 bg-white border border-slate-200 text-center">
              <p className="text-xs text-slate-500 uppercase">Overall Pass Rate</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{examAnalytics.overallPassRate}%</p>
            </Card>
            <Card className="p-4 bg-white border border-slate-200 text-center">
              <p className="text-xs text-slate-500 uppercase">Cohort Average Mark</p>
              <p className="text-2xl font-bold text-indigo-700 mt-1">{examAnalytics.averageMark}</p>
            </Card>
            <Card className="p-4 bg-white border border-slate-200 text-center">
              <p className="text-xs text-slate-500 uppercase">Missing Marks Flagged</p>
              <p className="text-2xl font-bold text-rose-600 mt-1">{examAnalytics.missingMarksCount}</p>
            </Card>
          </div>

          <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Grade Distribution Histogram</h3>
            <div className="grid grid-cols-5 gap-3 text-center">
              {Object.entries(examAnalytics.gradeDistribution || {}).map(([grade, count]) => (
                <div key={grade} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-xs font-bold text-slate-500">Grade {grade}</p>
                  <p className="text-lg font-bold text-indigo-700 mt-1">{count}</p>
                  <p className="text-[10px] text-slate-400">
                    {examAnalytics.aggregateCandidates > 0
                      ? Math.round((count / examAnalytics.aggregateCandidates) * 100)
                      : 0}%
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 5: FINANCE INTELLIGENCE */}
      {activeTab === "finance" && financeAnalytics && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 bg-white border border-slate-200 text-center">
              <p className="text-xs text-slate-500 uppercase">Total Billed</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{formatNPR(financeAnalytics.totalBilledNpr)}</p>
            </Card>
            <Card className="p-4 bg-white border border-slate-200 text-center">
              <p className="text-xs text-slate-500 uppercase">Total Collected</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{formatNPR(financeAnalytics.totalPaidNpr)}</p>
            </Card>
            <Card className="p-4 bg-white border border-slate-200 text-center">
              <p className="text-xs text-slate-500 uppercase">Total Outstanding</p>
              <p className="text-2xl font-bold text-rose-600 mt-1">{formatNPR(financeAnalytics.totalOutstandingNpr)}</p>
            </Card>
          </div>

          <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Payment Gateway Reconciliation Breakdown</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(financeAnalytics.paymentMethodBreakdown || {}).map(([method, data]) => (
                <div key={method} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-xs font-bold text-slate-600 uppercase">{method}</p>
                  <p className="text-base font-bold text-slate-900 mt-1">{formatNPR(data.totalAmount)}</p>
                  <p className="text-[11px] text-slate-500">{data.count} successful transactions</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 8: CYBERSECURITY OPERATIONS */}
      {activeTab === "security" && securityData && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Security Incident Simulation & Testing</h3>
              <p className="text-xs text-slate-500">Test defensive alerting without touching production accounts.</p>
            </div>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                try {
                  const res = await aiApi.simulateSecurityIncident("CREDENTIAL_STUFFING");
                  notify("Credential Stuffing Simulated", `Security event logged with alert ID ${res.alertId}`, "warning");
                  const updated = await aiApi.fetchSecurityDashboard();
                  setSecurityData(updated);
                } catch (err: any) {
                  notify("Simulation Error", err.message, "error");
                }
              }}
            >
              Simulate Credential Stuffing
            </Button>
          </div>

          <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Cybersecurity Event Timeline</h3>
            <div className="divide-y divide-slate-100">
              {securityData.eventTimeline.map((ev) => (
                <div key={ev._id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{ev.event}</span> &bull;{" "}
                    <span className="text-slate-600">{ev.details}</span>
                    <span className="block text-[11px] text-slate-400">
                      IP: {ev.sourceIp} &bull; {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <Badge variant={severityToVariant(ev.severity)} size="sm">
                    {ev.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 9: SYSTEM HEALTH & RELIABILITY */}
      {activeTab === "system_health" && systemHealth && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 bg-white border border-slate-200">
              <p className="text-xs text-slate-500">MongoDB Latency</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{systemHealth.database.latencyMs} ms</p>
              <p className="text-[11px] text-slate-500 mt-1">{systemHealth.database.collectionsCount} active collections</p>
            </Card>

            <Card className="p-4 bg-white border border-slate-200">
              <p className="text-xs text-slate-500">API Error Rate</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{systemHealth.apiHealth.errorRatePercentage}%</p>
              <p className="text-[11px] text-slate-500 mt-1">{systemHealth.apiHealth.requestsTrackedLastWindow} requests tracked</p>
            </Card>

            <Card className="p-4 bg-white border border-slate-200">
              <p className="text-xs text-slate-500">Node Memory Heap</p>
              <p className="text-2xl font-bold text-indigo-700 mt-1">{systemHealth.server.memoryHeapUsedMb} MB</p>
              <p className="text-[11px] text-slate-500 mt-1">Uptime: {Math.round(systemHealth.server.uptimeSeconds / 60)} mins</p>
            </Card>
          </div>

          <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Simulate API Diagnostic Error Spike</h3>
                <p className="text-xs text-slate-500">Test health telemetry and ring-buffer anomaly detection.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await aiApi.simulateSystemErrorSpike();
                  notify("Incident Triggered", "Ring-buffer recorded 500 error spike.", "warning");
                  const updated = await aiApi.fetchSystemHealth();
                  setSystemHealth(updated);
                }}
              >
                Trigger Error Spike
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 10: ANOMALY ALERTS */}
      {activeTab === "alerts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Deterministic & Statistical Anomaly Alerts</h2>
              <p className="text-xs text-slate-500">Flagged integrity issues across finance, exams, attendance and security.</p>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                setLoading(true);
                await aiApi.triggerAnomalyScan();
                await loadOverviewData();
                notify("Scan Complete", "Anomaly engine evaluation complete.", "success");
              }}
            >
              Run Full Scan
            </Button>
          </div>

          {anomalies.length === 0 ? (
            <EmptyState
              icon={faCircleCheck}
              title="No Open Alerts"
              description="No integrity anomalies currently detected."
            />
          ) : (
            <div className="space-y-3">
              {anomalies.map((alert) => (
                <Card key={alert._id} className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={severityToVariant(alert.severity)} size="sm">
                        {alert.severity}
                      </Badge>
                      <span className="text-xs font-bold text-slate-900">{alert.event}</span>
                      <span className="text-[11px] text-slate-500">({alert.module})</span>
                    </div>
                    <Badge variant={alert.status === "OPEN" ? "danger" : "info"} size="sm">{alert.status}</Badge>
                  </div>

                  <p className="text-xs text-slate-800">{alert.reason}</p>
                  <p className="text-[11px] text-slate-500">
                    Target: <span className="font-semibold text-slate-700">{alert.affectedRecord?.label}</span>
                  </p>
                  <p className="text-[11px] text-indigo-700 bg-indigo-50/60 p-2 rounded">
                    Investigation Guidance: {alert.recommendedInvestigation}
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await aiApi.updateAnomalyStatus(alert._id, "ACKNOWLEDGED", "Acknowledged by reviewer.");
                        loadOverviewData();
                      }}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={async () => {
                        await aiApi.updateAnomalyStatus(alert._id, "RESOLVED", "Verified and resolved.");
                        loadOverviewData();
                      }}
                    >
                      Resolve
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 11: ACTIVITY LOG */}
      {activeTab === "activity_log" && (
        <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-slate-900">AI Intelligence Audit Trail</h2>
          <p className="text-xs text-slate-500">Immutable append-only record of all AI actions, queries and human decisions.</p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Module</th>
                  <th className="py-2.5 px-3">Recommendation / Action</th>
                  <th className="py-2.5 px-3">Human Confirmation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activityLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {new Date(log.createdAt || log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900">
                      {log.actor?.fullName || log.userName}
                      <span className="block text-[10px] text-slate-500 uppercase">{log.actor?.role || log.role}</span>
                    </td>
                    <td className="py-3 px-3">{log.module}</td>
                    <td className="py-3 px-3 text-slate-800 max-w-xs truncate">{log.recommendation}</td>
                    <td className="py-3 px-3">
                      <Badge
                        variant={
                          ["CONFIRMED", "EXECUTED"].includes(log.humanConfirmation?.status || "")
                            ? "success"
                            : log.humanConfirmation?.status === "PENDING"
                            ? "warning"
                            : "neutral"
                        }
                        size="sm"
                      >
                        {log.humanConfirmation?.status || "NOT_REQUIRED"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 12: POLICY KNOWLEDGE ASSISTANT (RAG) */}
      {activeTab === "knowledge" && (
        <div className="space-y-4">
          <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
            <h2 className="text-sm font-bold text-slate-900">CollegeOS Policy Knowledge Assistant (RAG)</h2>
            <p className="text-xs text-slate-500">
              Retrieves authoritative passages from academic regulations, examination guidelines, tuition and leave policies.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!ragQuery.trim()) return;
                setRagLoading(true);
                try {
                  const res = await aiApi.queryKnowledgeAssistant(ragQuery.trim());
                  setRagResult(res);
                } catch (err: any) {
                  notify("Lookup Error", err.message, "error");
                } finally {
                  setRagLoading(false);
                }
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                placeholder="e.g., What is the minimum attendance required for examination eligibility?"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
              <Button type="submit" size="sm" variant="primary" disabled={ragLoading}>
                {ragLoading ? <Spinner size={14} /> : <FontAwesomeIcon icon={faPaperPlane} />}
                <span className="ml-1.5">Query</span>
              </Button>
            </form>
          </Card>

          {ragResult && (
            <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Answer</span>
                <Badge variant={ragResult.found ? "success" : "neutral"} size="sm">
                  {ragResult.found ? "Verified Policy Citation" : "Not Found In Policy"}
                </Badge>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                {ragResult.answer}
              </div>

              {ragResult.citations?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-indigo-900">Document Citations:</p>
                  {ragResult.citations.map((c: any, idx: number) => (
                    <div key={idx} className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 text-xs space-y-1">
                      <p className="font-semibold text-indigo-950">{c.documentTitle} &bull; {c.sectionTitle}</p>
                      <p className="text-slate-700 italic text-[11px]">&ldquo;{c.passage}&rdquo;</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Tab 13: DOCUMENT INTELLIGENCE */}
      {activeTab === "documents" && (
        <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-slate-900">AI Document Intelligence: Transcript Extractor</h2>
          <p className="text-xs text-slate-500">
            Extracts structured academic transcripts with line-by-line provenance and human verification gate.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-700">Transcript Text</label>
            <textarea
              rows={6}
              value={rawTranscriptText}
              onChange={(e) => setRawTranscriptText(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 font-mono text-xs"
              placeholder="Paste transcript text here..."
            />
          </div>

          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              setLoading(true);
              try {
                const res = await aiApi.extractTranscript(rawTranscriptText);
                setExtractedTranscript(res.extractedData);
                notify("Extracted", "Transcript parsed with line-level source provenance.", "success");
              } catch (err: any) {
                notify("Error", err.message, "error");
              } finally {
                setLoading(false);
              }
            }}
          >
            Extract Structured Fields
          </Button>

          {extractedTranscript && (
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] text-slate-500">Student ID</p>
                  <p className="text-sm font-bold text-slate-900">{extractedTranscript.studentId}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] text-slate-500">Program</p>
                  <p className="text-sm font-bold text-slate-900">{extractedTranscript.program}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] text-slate-500">Semester</p>
                  <p className="text-sm font-bold text-slate-900">{extractedTranscript.semester}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] text-slate-500">CGPA</p>
                  <p className="text-sm font-bold text-indigo-700">{extractedTranscript.gpa}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Course Code</th>
                      <th className="py-2 px-3">Course Name</th>
                      <th className="py-2 px-3">Credits</th>
                      <th className="py-2 px-3">Grade</th>
                      <th className="py-2 px-3">Grade Point</th>
                      <th className="py-2 px-3">Source Provenance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {extractedTranscript.courses?.map((c: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-mono font-medium">{c.courseCode}</td>
                        <td className="py-2 px-3">{c.courseName}</td>
                        <td className="py-2 px-3">{c.credits}</td>
                        <td className="py-2 px-3 font-bold">{c.grade}</td>
                        <td className="py-2 px-3">{c.gradePoint}</td>
                        <td className="py-2 px-3 text-[11px] text-slate-500 font-mono">{c.sourceLine}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Tab 14: WHAT-IF SCENARIO SIMULATOR */}
      {activeTab === "simulator" && (
        <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" strokeWidth={1.5} />
              <span className="text-xs font-bold text-amber-900">
              SIMULATION ONLY — DOES NOT MODIFY ACADEMIC POLICIES OR OFFICIAL STUDENT RECORDS
            </span>
          </div>

          <h2 className="text-sm font-bold text-slate-900">What-If Policy Simulator</h2>
          <p className="text-xs text-slate-500">
            Model the impact of increasing the minimum attendance threshold from the current baseline (75%).
          </p>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span>Proposed Attendance Threshold: {simAttendanceThreshold}%</span>
              <span className="text-slate-500">Baseline: 75%</span>
            </div>
            <input
              type="range"
              min={70}
              max={95}
              value={simAttendanceThreshold}
              onChange={(e) => setSimAttendanceThreshold(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              setLoading(true);
              try {
                const res = await aiApi.simulateScenario("ATTENDANCE_THRESHOLD", {
                  baselineThreshold: 75,
                  proposedThreshold: simAttendanceThreshold,
                });
                setSimulationResult(res.simulationResult);
              } catch (err: any) {
                notify("Error", err.message, "error");
              } finally {
                setLoading(false);
              }
            }}
          >
            Run Simulation Model
          </Button>

          {simulationResult && (
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
              <p className="text-xs font-bold text-slate-900">Projected Simulation Impact:</p>
              <p className="text-xs text-slate-700 leading-relaxed">{simulationResult.projectedImpact?.impactSummary}</p>
              <p className="text-xs text-rose-600 font-semibold leading-relaxed">
                Flagged Students Under Proposed Threshold: {simulationResult.projectedImpact?.flaggedStudentsCount}
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Tab 15: PROCESS MINING */}
      {activeTab === "process_mining" && processMiningData && (
        <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-slate-900">Institutional Process Mining & Bottleneck Detection</h2>
          <p className="text-xs text-slate-500">
            Actual cycle times computed from institutional workflow case transition timestamps.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {processMiningData.processStages?.map((stage: any, idx: number) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border ${
                  stage.isBottleneck ? "bg-rose-50 border-rose-300" : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-800">{stage.stageName}</span>
                  {stage.isBottleneck && <Badge variant="danger" size="sm">Bottleneck</Badge>}
                </div>
                <p className="text-xl font-bold text-slate-900 mt-2">{stage.averageHours} hrs</p>
                <p className="text-[11px] text-slate-500 mt-1">{stage.sampleCasesTracked} cases analyzed</p>
                {stage.bottleneckReason && (
                  <p className="text-[10px] text-rose-700 mt-2">{stage.bottleneckReason}</p>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 text-xs text-indigo-900 space-y-1">
            <p className="font-bold">Total Workflow Cycle Time: {processMiningData.totalCycleTimeHours} hours</p>
            <p className="text-[11px]">Primary bottleneck: {processMiningData.primaryBottleneckStage}</p>
          </div>
        </Card>
      )}

      {/* Tab 16: IT ASSET & SERVICE MANAGEMENT */}
      {activeTab === "it_services" && itData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 bg-white border border-slate-200 text-center">
              <p className="text-xs text-slate-500 uppercase">Hardware Assets Tracked</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{itData.totalAssetsCount}</p>
            </Card>
            <Card className="p-4 bg-white border border-slate-200 text-center">
              <p className="text-xs text-slate-500 uppercase">Software Licenses</p>
              <p className="text-2xl font-bold text-indigo-700 mt-1">{itData.totalSoftwareLicenses}</p>
            </Card>
            <Card className="p-4 bg-white border border-slate-200 text-center">
              <p className="text-xs text-slate-500 uppercase">Open IT Tickets</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{itData.openTicketsCount}</p>
            </Card>
          </div>

          <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Create IT Support Ticket (AI Triage)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  placeholder="Ticket Subject / Title"
                  value={newTicketTitle}
                  onChange={(e) => setNewTicketTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-2 text-xs"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Problem Description"
                  value={newTicketDesc}
                  onChange={(e) => setNewTicketDesc(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-2 text-xs"
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                if (!newTicketTitle || !newTicketDesc) return;
                try {
                  const res = await aiApi.createITTicket({
                    title: newTicketTitle,
                    description: newTicketDesc,
                  });
                  notify("Ticket Created & Triaged", `Assigned category: ${res.category}`, "success");
                  setNewTicketTitle("");
                  setNewTicketDesc("");
                  const updated = await aiApi.fetchITSummary();
                  setITData(updated);
                } catch (err: any) {
                  notify("Error", err.message, "error");
                }
              }}
            >
              Submit Ticket
            </Button>
          </Card>

          <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Campus Hardware Inventory (Replaces IoT)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Asset Tag</th>
                    <th className="py-2 px-3">Device Name</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Location</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itData.recentAssets?.map((a) => (
                    <tr key={a._id}>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-700">{a.assetTag}</td>
                      <td className="py-2 px-3">{a.name}</td>
                      <td className="py-2 px-3">{a.category}</td>
                      <td className="py-2 px-3">{a.location}</td>
                      <td className="py-2 px-3">
                        <Badge variant={a.status === "ACTIVE" ? "success" : "warning"} size="sm">{a.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 17: DIGITAL CREDENTIALS & SMART QR ATTENDANCE */}
      {activeTab === "credentials_attendance" && (
        <div className="space-y-6">
          {/* Digital Credential Verification */}
          <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Tamper-Evident Digital Student Credentials (HMAC Signed)</h3>
            <p className="text-xs text-slate-500">Issue cryptographic digital ID cards and verify signatures against institutional keys.</p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Credential Number (e.g., CRED-BScIT25011-...)"
                value={verifyCertNumber}
                onChange={(e) => setVerifyCertNumber(e.target.value)}
                className="flex-1 border border-slate-300 rounded-md p-2 text-xs"
              />
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  if (!verifyCertNumber.trim()) return;
                  try {
                    const res = await aiApi.verifyCredential(verifyCertNumber.trim());
                    setVerificationResult(res);
                  } catch (err: any) {
                    notify("Verification Failed", err.message, "error");
                  }
                }}
              >
                Verify Authenticity
              </Button>
            </div>

            {verificationResult && (
              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 text-xs space-y-1">
                <p className="font-bold text-emerald-900">Status: {verificationResult.status}</p>
                <p className="text-emerald-800">Student: {verificationResult.studentName} ({verificationResult.studentId})</p>
                <p className="text-emerald-700 font-mono text-[10px]">Digest: {verificationResult.signatureDigest}</p>
              </div>
            )}
          </Card>

          {/* Smart QR Attendance */}
          <Card className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Smart QR Dynamic Attendance Check-in</h3>
            <p className="text-xs text-slate-500">Time-bounded rotating session tokens with duplicate prevention.</p>

            {["faculty", "super_admin"].includes(currentRole) && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                <p className="text-xs font-bold text-slate-800">Faculty QR Session Generator</p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    try {
                      const res = await aiApi.createQRSession({
                        courseId: "COURSE-601",
                        durationMinutes: 30,
                        topic: "Advanced Distributed Systems",
                      });
                      setActiveQRSession(res);
                      notify("Session Created", `Session code: ${res.sessionCode}`, "success");
                    } catch (err: any) {
                      notify("Error", err.message, "error");
                    }
                  }}
                >
                  Generate New QR Session
                </Button>

                {activeQRSession && (
                  <div className="p-3 bg-white rounded border border-indigo-200 space-y-1">
                    <p className="text-xs font-bold text-indigo-900">Active Session Code: {activeQRSession.sessionCode}</p>
                    <p className="text-[11px] text-slate-600">Expires: {new Date(activeQRSession.expiresAt).toLocaleTimeString()}</p>
                    <p className="text-[11px] text-slate-600">Check-ins: {activeQRSession.totalCheckIns || 0}</p>
                  </div>
                )}
              </div>
            )}

            {["student", "super_admin"].includes(currentRole) && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                <p className="text-xs font-bold text-slate-800">Student Attendance Check-In</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter Session Code (e.g. QRS-1234)"
                    value={checkInSessionCode}
                    onChange={(e) => setCheckInSessionCode(e.target.value)}
                    className="flex-1 border border-slate-300 rounded-md p-2 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      if (!checkInSessionCode.trim()) return;
                      try {
                        const res = await aiApi.checkInViaQR(checkInSessionCode.trim());
                        notify("Check-in Successful", res.message, "success");
                        setCheckInSessionCode("");
                      } catch (err: any) {
                        notify("Check-in Refused", err.message, "error");
                      }
                    }}
                  >
                    Check In
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Confirmation Modal Dialog */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Human Confirmation Gate"
      >
        <div className="space-y-4 p-4 text-xs">
          <p className="font-semibold text-slate-800">
            {selectedLogForConfirm?.proposedAction?.label}
          </p>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
            <p className="text-slate-600">Action Key: <span className="font-mono">{selectedLogForConfirm?.proposedAction?.actionKey || "Unavailable"}</span></p>
            <p className="text-slate-600">Initiated by: <span className="font-medium">{selectedLogForConfirm?.userName} ({selectedLogForConfirm?.role})</span></p>
            <p className="text-slate-600">Target module / record: <span className="font-medium">{selectedLogForConfirm?.proposedAction?.targetModule} / {selectedLogForConfirm?.proposedAction?.targetRecord}</span></p>
            <p className="text-slate-600">Operation: <span className="font-medium">{selectedLogForConfirm?.proposedAction?.operation}</span></p>
            <p className="text-slate-600">Current value: <span className="font-medium">{JSON.stringify(selectedLogForConfirm?.proposedAction?.currentValue ?? null)}</span></p>
            <p className="text-slate-600">Proposed value: <span className="font-medium">{JSON.stringify(selectedLogForConfirm?.proposedAction?.proposedValue ?? null)}</span></p>
            <p className="text-slate-600">Reason: <span className="font-medium">{selectedLogForConfirm?.proposedAction?.reason}</span></p>
            <p className="text-slate-600">Risk level: <span className="font-bold text-rose-600">{selectedLogForConfirm?.proposedAction?.riskLevel}</span></p>
            <p className="text-slate-600">Required permission: <span className="font-medium">{selectedLogForConfirm?.proposedAction?.requiredPermission}</span></p>
            <p className="text-slate-600">Status: <span className="font-medium">{selectedLogForConfirm?.humanConfirmation?.status}</span></p>
            <p className="text-slate-600">Created: <span className="font-medium">{selectedLogForConfirm?.createdAt ? new Date(selectedLogForConfirm.createdAt).toLocaleString() : "Unavailable"}</span></p>
          </div>

          <div>
            <label className="font-medium text-slate-700">Approval / Rejection Notes</label>
            <input
              type="text"
              value={confirmationNotes}
              onChange={(e) => setConfirmationNotes(e.target.value)}
              placeholder="e.g., Approved after verifying student records."
              className="w-full border border-slate-300 rounded-md p-2 mt-1 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleConfirmAction(false)}
            >
              <FontAwesomeIcon icon={faXmark} className="mr-1 text-rose-500" />
              Reject Action
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleConfirmAction(true)}
              disabled={
                !selectedLogForConfirm?.proposedAction?.actionKey ||
                !selectedLogForConfirm?.proposedAction?.operation ||
                !selectedLogForConfirm?.proposedAction?.requiredPermission
              }
            >
              <FontAwesomeIcon icon={faCheck} className="mr-1 text-emerald-400" />
              Approve & Execute
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
