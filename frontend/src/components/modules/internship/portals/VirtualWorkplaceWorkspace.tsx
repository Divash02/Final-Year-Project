import React, { useState, useEffect, useCallback } from "react";
import { CareerPath, TaskStatus, VirtualTicket, SimulationTask, SimulationProject, SimulationSubmission, SimulationReview, SimulationEvent, SimulationMeeting, SimulationMessage, SimulationMembership, VirtualCompany, VirtualDepartment, SimulationTeam, SimulationAssessment, CompetencyScore, ProfessionalPortfolio, SpecialistWorkspaceConfig } from "../types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLaptopCode,
  faBuilding,
  faSitemap,
  faUsers,
  faDiagramProject,
  faListCheck,
  faBookOpen,
  faCalendarCheck,
  faComments,
  faCodeBranch,
  faCodeCompare,
  faClipboardCheck,
  faTriangleExclamation,
  faChartPie,
  faAward,
  faBriefcase,
  faPlus,
  faPaperPlane,
  faCheck,
  faTimes,
  faExternalLinkAlt,
  faCode,
  faBug,
  faVial,
  faPaintBrush,
  faLayerGroup,
  faFire,
  faServer,
  faDatabase,
  faNetworkWired,
  faCloud,
  faBrain,
  faChartLine,
  faProjectDiagram,
  faFileAlt,
  faShieldAlt,
  faMobileAlt,
  faMicrochip,
  faSearch,
  faPalette,
  faCube,
  faCogs,
  faSitemap as faSitemapIcon,
  faWrench,
  faPlug,
  faMemory,
  faHdd,
  faGlobe,
  faLock,
  faMobile,
  faMicrochip as faMicrochipIcon,
  faUserTie,
  faArrowRight,
  faChevronLeft,
  faChevronRight,
  faHome,
  faGauge,
  faCodeMerge,
  faCodePullRequest,
  faCodeCommit,
  faTerminal,
  faCodeCompare as faCodeCompareIcon,
  faDatabase as faDatabaseIcon,
  faNetworkWired as faNetworkWiredIcon,
  faBrain as faBrainIcon,
  faChartLine as faChartLineIcon,
  faUsers as faUsersIcon,
  faUser,
  faSignOutAlt,
  faBell,
  faCircleQuestion,
  faMagnifyingGlass,
  faFilter,
  faColumns,
  faList,

  faChartBar,
  faHourglassHalf,
  faTrophy,
  faCertificate,
  faGraduationCap,
  faBriefcase as faBriefcaseIcon2,
} from "@fortawesome/free-solid-svg-icons";
import {
  StatusBadge,
  MetricCard,
  ModalWrapper,
  DrawerWrapper,
} from "../components/SharedWidgets";
import { virtualWorkplaceApi } from "../../../../services/virtualWorkplaceApi";
import {
  VirtualWorkspaceLayout,
  VirtualWorkspaceHeader,
  VirtualWorkspaceCard,
  VirtualWorkspaceSection,
} from "./VirtualWorkspaceLayout";

const CAREER_PATH_CONFIG: Record<CareerPath, { label: string; icon: any; color: string; description: string; tools: string[] }> = {
  frontend_developer: { label: "Frontend Developer", icon: faCode, color: "indigo", description: "Build responsive, accessible UIs with React, TypeScript, and modern CSS.", tools: ["React 19", "TypeScript", "Tailwind CSS", "Vitest", "Playwright", "Storybook"] },
  backend_developer: { label: "Backend Developer", icon: faServer, color: "blue", description: "Design scalable APIs, microservices, and data layers with Node.js, Go, or Python.", tools: ["Node.js", "Go", "PostgreSQL", "Redis", "Kafka", "gRPC", "OpenAPI"] },
  fullstack_developer: { label: "Full Stack Developer", icon: faLayerGroup, color: "purple", description: "End-to-end feature development across frontend, backend, and infrastructure.", tools: ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker", "CI/CD", "GraphQL"] },
  uiux_designer: { label: "UI/UX Designer", icon: faPaintBrush, color: "pink", description: "Design user-centered interfaces, design systems, and conduct usability research.", tools: ["Figma", "FigJam", "Storybook", "Accessibility Tools", "Design Tokens", "Prototyping"] },
  database_engineer: { label: "Database Engineer", icon: faDatabase, color: "emerald", description: "Design schemas, optimize queries, and manage data infrastructure at scale.", tools: ["PostgreSQL", "MongoDB", "Redis", "ER Diagrams", "Query Profiler", "Flyway/Liquibase"] },
  network_engineer: { label: "Network Engineer", icon: faNetworkWired, color: "teal", description: "Design, configure, and troubleshoot enterprise network infrastructure.", tools: ["Cisco CLI", "BGP/OSPF", "VLANs", "Wireshark", "Ansible", "NetBox"] },
  qa_engineer: { label: "QA Engineer", icon: faBug, color: "orange", description: "Build automated test suites, performance benchmarks, and quality gates.", tools: ["Playwright", "Cypress", "k6", "Jest", "Postman", "Contract Testing"] },
  devops_engineer: { label: "DevOps Engineer", icon: faCogs, color: "gray", description: "Automate CI/CD, manage Kubernetes, and build developer platforms.", tools: ["Kubernetes", "Terraform", "Helm", "GitHub Actions", "ArgoCD", "Prometheus/Grafana"] },
  cloud_engineer: { label: "Cloud Engineer", icon: faCloud, color: "sky", description: "Architect cloud infrastructure, manage costs, and ensure reliability.", tools: ["AWS/GCP/Azure", "Terraform", "CloudFormation", "CloudWatch", "Cost Explorer", "IAM"] },
  ai_ml_engineer: { label: "AI/ML Engineer", icon: faBrain, color: "violet", description: "Build, train, and deploy ML models with MLOps best practices.", tools: ["PyTorch", "TensorFlow", "MLflow", "Kubeflow", "Ray", "Feature Stores"] },
  data_engineer: { label: "Data Engineer", icon: faChartLine, color: "amber", description: "Build data pipelines, warehouses, and streaming architectures.", tools: ["Spark", "Flink", "dbt", "Airflow", "Snowflake/BigQuery", "Kafka"] },
  project_manager: { label: "Project Manager", icon: faProjectDiagram, color: "rose", description: "Lead agile delivery, manage risks, and coordinate cross-functional teams.", tools: ["Jira/Linear", "Confluence", "Gantt Charts", "Risk Registers", "Capacity Planning"] },
  business_analyst: { label: "Business Analyst", icon: faSitemapIcon, color: "lime", description: "Elicit requirements, model processes, and bridge business-technical gaps.", tools: ["BPMN", "User Stories", "Process Mining", "Gap Analysis", "Traceability Matrix"] },
  product_manager: { label: "Product Manager", icon: faBriefcase, color: "indigo", description: "Define product strategy, prioritize backlogs, and measure outcomes.", tools: ["ProductBoard", "Amplitude", "A/B Testing", "Roadmaps", "User Research"] },
  technical_writer: { label: "Technical Writer", icon: faFileAlt, color: "cyan", description: "Create developer documentation, API references, and knowledge bases.", tools: ["Docs-as-Code", "OpenAPI", "Markdown", "Docusaurus", "Mermaid", "Vale"] },
  systems_analyst: { label: "Systems Analyst", icon: faCube, color: "teal", description: "Analyze system requirements, design architectures, and evaluate solutions.", tools: ["UML", "Architecture Diagrams", "Trade-off Analysis", "RFCs", "Decision Records"] },
  it_support_engineer: { label: "IT Support Engineer", icon: faWrench, color: "orange", description: "Manage endpoints, identity, and provide technical support at scale.", tools: ["MDM/Intune", "Okta/Azure AD", "ServiceNow", "Remote Access", "Scripting", "Asset Management"] },
  security_engineer: { label: "Security Engineer", icon: faLock, color: "red", description: "Secure applications, infrastructure, and respond to threats.", tools: ["SAST/DAST", "Burp Suite", "WAF", "SIEM", "Threat Modeling", "Compliance"] },
  mobile_developer: { label: "Mobile Developer", icon: faMobileAlt, color: "green", description: "Build native and cross-platform mobile applications.", tools: ["Swift/Kotlin", "React Native/Flutter", "Xcode/Android Studio", "Fastlane", "TestFlight"] },
  embedded_engineer: { label: "Embedded Engineer", icon: faMicrochipIcon, color: "yellow", description: "Develop firmware, RTOS, and hardware-software integration.", tools: ["C/C++", "Rust", "FreeRTOS/Zephyr", "JTAG", "Oscilloscopes", "Hardware Debuggers"] },
};

interface VirtualWorkplaceWorkspaceProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
  careerPath: CareerPath;
  onChangeCareerPath: (track: CareerPath) => void;
  membershipId: string;
  onExitWorkspace: () => void;
}

interface WorkspaceState {
  company: VirtualCompany | null;
  department: VirtualDepartment | null;
  team: SimulationTeam | null;
  membership: SimulationMembership | null;
  simulation: any;
  tasks: SimulationTask[];
  projects: SimulationProject[];
  events: SimulationEvent[];
  meetings: SimulationMeeting[];
  teamMembers: SimulationMembership[];
  assessment: SimulationAssessment | null;
  competencies: CompetencyScore[];
  portfolio: ProfessionalPortfolio | null;
  loading: boolean;
  error: string | null;
}

export const VirtualWorkplaceWorkspace: React.FC<VirtualWorkplaceWorkspaceProps> = ({
  activePage,
  onNavigate,
  careerPath,
  onChangeCareerPath,
  membershipId,
  onExitWorkspace,
}) => {
  const config = CAREER_PATH_CONFIG[careerPath];
  const [workspace, setWorkspace] = useState<WorkspaceState>({
    company: null,
    department: null,
    team: null,
    membership: null,
    simulation: null,
    tasks: [],
    projects: [],
    events: [],
    meetings: [],
    teamMembers: [],
    assessment: null,
    competencies: [],
    portfolio: null,
    loading: true,
    error: null,
  });

  const [selectedTicket, setSelectedTicket] = useState<SimulationTask | null>(null);
  const [showSubmitWorkModal, setShowSubmitWorkModal] = useState(false);
  const [prUrl, setPrUrl] = useState("");
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  const [codeEditorContent, setCodeEditorContent] = useState("// Welcome to your IDE\n// Start coding your feature here...\n\nfunction HelloWorld() {\n  return <div>Hello, Virtual Workplace!</div>;\n}");
  const [designCanvasMode, setDesignCanvasMode] = useState<"wireframe" | "prototype" | "design-system">("wireframe");
  const [networkTopology, setNetworkTopology] = useState<string[]>(["core-router", "dist-switch-1", "dist-switch-2", "access-switch-1", "server-farm"]);
  const [dbQuery, setDbQuery] = useState("SELECT * FROM users WHERE tenant_id = $1 AND active = true;");
  const [testResults, setTestResults] = useState<{ name: string; status: "pass" | "fail" | "pending"; duration: string }[]>([
    { name: "AuthModule > should issue JWT on valid credentials", status: "pass", duration: "42ms" },
    { name: "AuthModule > should reject expired tokens", status: "pass", duration: "18ms" },
    { name: "AuthModule > should enforce rate limiting", status: "pending", duration: "—" },
    { name: "UserService > should hash passwords with argon2", status: "pass", duration: "31ms" },
  ]);
  const [pipelineStages, setPipelineStages] = useState<{ name: string; status: "success" | "running" | "failed" | "pending"; duration?: string }[]>([
    { name: "Install Dependencies", status: "success", duration: "1m 23s" },
    { name: "Lint & Type Check", status: "success", duration: "45s" },
    { name: "Unit Tests", status: "running", duration: "—" },
    { name: "Integration Tests", status: "pending", duration: "—" },
    { name: "Build Docker Image", status: "pending", duration: "—" },
    { name: "Deploy to Staging", status: "pending", duration: "—" },
  ]);

  const [activeChannel, setActiveChannel] = useState("#frontend-squad");
  const [channelMessages, setChannelMessages] = useState<Record<string, { sender: string; text: string; time: string; isBot?: boolean }[]>>({
    "#frontend-squad": [
      { sender: "NovaBot (CI/CD)", text: "Build #1042 passed on branch fix/auth-token-loop. Staging environment updated.", time: "11:20 AM", isBot: true },
      { sender: "Elena Rostova (Staff Lead)", text: "Hey team, please test the OTP modal pasted clipboard behavior in safari viewport.", time: "11:25 AM" },
      { sender: "Sophie Chen (UI/UX)", text: "New design tokens for the Dark Mode contrast toggle are now live in Figma.", time: "11:42 AM" },
    ],
    "#incident-bridge": [
      { sender: "NovaBot (PagerDuty)", text: "SEV-1 ALERT: APM Pod latency threshold exceeded on /v1/auth/refresh.", time: "12:00 PM", isBot: true },
      { sender: "David Kim (QA)", text: "Running headless Playwright regression suite to verify auth payload sanity.", time: "12:05 PM" },
    ],
    "#general": [
      { sender: "Marcus Vance (TPM)", text: "Reminder: Sprint 44 Retro is at 4:00 PM today. Please add your sticky cards.", time: "09:00 AM" },
    ],
  });
  const [chatInput, setChatInput] = useState("");

  const fetchWorkspaceData = useCallback(async () => {
    try {
      setWorkspace(prev => ({ ...prev, loading: true, error: null }));
      const response = await virtualWorkplaceApi.getWorkspaceData(membershipId);
      if (response?.workspace) {
        const ws = response.workspace;
        setWorkspace({
          company: ws.company,
          department: ws.department,
          team: ws.team,
          membership: ws.membership,
          simulation: ws.simulation,
          tasks: ws.tasks || [],
          projects: ws.projects || [],
          events: ws.events || [],
          meetings: ws.meetings || [],
          teamMembers: ws.teamMembers || [],
          assessment: ws.assessment,
          competencies: ws.competencies || [],
          portfolio: ws.portfolio,
          loading: false,
          error: null,
        });
      } else {
        setWorkspace(prev => ({ ...prev, loading: false, error: "Failed to load workspace data" }));
      }
    } catch (error: any) {
      setWorkspace(prev => ({ ...prev, loading: false, error: error.message || "Failed to load workspace" }));
    }
  }, [membershipId]);

  useEffect(() => {
    if (membershipId) {
      fetchWorkspaceData();
    }
  }, [membershipId, fetchWorkspaceData]);

  const handleMoveTicket = async (ticketId: string, newStatus: TaskStatus) => {
    try {
      await virtualWorkplaceApi.updateTask(ticketId, { status: newStatus });
      setWorkspace(prev => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t)),
      }));
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    try {
      await virtualWorkplaceApi.submitWork(selectedTicket.id, {
        pullRequestUrl: prUrl || undefined,
        notes: submissionNotes || undefined,
      });
      setWorkspace(prev => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === selectedTicket.id
            ? {
                ...t,
                status: "IN_REVIEW" as TaskStatus,
                submittedWork: {
                  pullRequestUrl: prUrl || "https://github.com/novatech-simulated/frontend-core/pull/350",
                  notes: submissionNotes,
                  submittedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
                },
                reviewStatus: "PENDING" as const,
              }
            : t
        ),
      }));
      setSubmissionSuccess(true);
      setTimeout(() => {
        setShowSubmitWorkModal(false);
        setSubmissionSuccess(false);
        setPrUrl("");
        setSubmissionNotes("");
      }, 1200);
    } catch (error) {
      console.error("Failed to submit work:", error);
    }
  };

  const filteredTasks = workspace.tasks.filter((t) => t.careerPath === careerPath);

  if (workspace.loading) {
    return (
      <VirtualWorkspaceLayout
        membershipId={membershipId}
        activePage={activePage}
        onNavigate={onNavigate}
        careerPath={careerPath}
        onChangeCareerPath={onChangeCareerPath}
        onExitWorkspace={onExitWorkspace}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto" />
            <p className="text-slate-600 dark:text-slate-400">Loading workspace...</p>
          </div>
        </div>
      </VirtualWorkspaceLayout>
    );
  }

  if (workspace.error) {
    return (
      <VirtualWorkspaceLayout
        membershipId={membershipId}
        activePage={activePage}
        onNavigate={onNavigate}
        careerPath={careerPath}
        onChangeCareerPath={onChangeCareerPath}
        onExitWorkspace={onExitWorkspace}
      >
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Unable to Load Workspace</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">{workspace.error}</p>
          <button
            onClick={fetchWorkspaceData}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs"
          >
            Retry
          </button>
        </div>
      </VirtualWorkspaceLayout>
    );
  }

  const company = workspace.company;
  const department = workspace.department;
  const team = workspace.team;
  const membership = workspace.membership;
  const simulation = workspace.simulation;

  const renderOverview = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Workspace Overview"
        description={`Operating inside ${company?.name || "Virtual Company"} simulation as ${config.label}`}
        breadcrumbs={[{ label: "Overview" }]}
      />

      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
              Simulated Professional Experience
            </span>
            <span className="text-xs text-indigo-300">Sprint {simulation?.currentSprintNumber || 1} (Day 6 of 10)</span>
          </div>
          <h2 className="text-xl font-bold mt-2">{company?.name || "Virtual Company"}</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            {company?.brandTagline || "Operating in production-grade simulated infrastructure. All pull requests, code reviews, and sprint ceremonies emulate real enterprise standards."}
          </p>
        </div>

        <div className="bg-white/10 p-3.5 rounded-xl backdrop-blur-xs text-xs space-y-1">
          <span className="text-slate-400 text-[10px] block uppercase tracking-wider font-bold">Active Career Path</span>
          <strong className="text-amber-400 font-bold block text-sm capitalize">
            {config.label}
          </strong>
          <span className="text-slate-300 text-[11px]">Sprint Goal: Complete IAM Multi-Tenant Release</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Sprint Velocity"
          value={`${workspace.tasks.filter(t => t.status === "DONE").length} / ${workspace.tasks.length} SP`}
          subtitle={`${workspace.tasks.length > 0 ? Math.round((workspace.tasks.filter(t => t.status === "DONE").length / workspace.tasks.length) * 100) : 0}% Burndown`}
          icon={faChartPie}
          color="indigo"
        />
        <MetricCard
          title="Assigned Tickets"
          value={`${filteredTasks.length} Tickets`}
          subtitle={`${filteredTasks.filter((t) => t.status === "DONE").length} Completed`}
          icon={faListCheck}
          color="emerald"
        />
        <MetricCard
          title="Team Squad"
          value={`${workspace.teamMembers.length} Colleagues`}
          subtitle={`${workspace.teamMembers.filter(m => m.careerPath !== careerPath).length} Engineers, 1 AI Reviewer`}
          icon={faUsers}
          color="blue"
        />
        <MetricCard
          title="Active Incidents"
          value={`${workspace.events.filter(e => e.status === "ACTIVE" && e.severity === "SEV1_CRITICAL").length} Critical`}
          subtitle="Production Emergency"
          icon={faFire}
          color="rose"
        />
      </div>

      <VirtualWorkspaceCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <FontAwesomeIcon icon={config.icon} className="text-indigo-600" />
            <span className="capitalize">{config.label} Workspace Dashboard</span>
          </h3>
          <button
            onClick={() => onNavigate("vw_tasks")}
            className="text-xs text-indigo-600 hover:underline font-semibold"
          >
            Open Interactive Kanban Board →
          </button>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs space-y-2 border border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-900 dark:text-white">{config.label} Workbench Tools:</p>
          <p className="text-slate-600 dark:text-slate-400">
            {config.description}
          </p>
          <div className="flex flex-wrap items-center space-x-2 pt-2">
            {config.tools.map((tool, i) => (
              <span key={i} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-mono text-[11px] rounded">
                {tool}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => onNavigate("vw_submission")}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-left hover:border-indigo-500 transition-colors"
          >
            <FontAwesomeIcon icon={faCodeBranch} className="text-indigo-600 text-lg" />
            <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">Work Submission</p>
            <p className="text-[10px] text-slate-500">Submit deliverables & PRs</p>
          </button>
          <button
            onClick={() => onNavigate("vw_reviews")}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-left hover:border-purple-500 transition-colors"
          >
            <FontAwesomeIcon icon={faCodeCompare} className="text-purple-600 text-lg" />
            <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">Code Reviews</p>
            <p className="text-[10px] text-slate-500">Review & receive feedback</p>
          </button>
          <button
            onClick={() => onNavigate("vw_incidents")}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-left hover:border-rose-500 transition-colors"
          >
            <FontAwesomeIcon icon={faFire} className="text-rose-600 text-lg" />
            <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">Incidents</p>
            <p className="text-[10px] text-slate-500">Production crisis response</p>
          </button>
          <button
            onClick={() => onNavigate("vw_portfolio")}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-left hover:border-amber-500 transition-colors"
          >
            <FontAwesomeIcon icon={faBriefcase} className="text-amber-600 text-lg" />
            <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">Portfolio</p>
            <p className="text-[10px] text-slate-500">Build professional showcase</p>
          </button>
        </div>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderTasksAndTickets = () => {
    const columns: { status: TaskStatus; label: string; color: string; icon: any }[] = [
      { status: "TODO", label: "To Do / Backlog", color: "border-slate-300 text-slate-700", icon: faList },
      { status: "IN_PROGRESS", label: "In Development", color: "border-blue-500 text-blue-700", icon: faCode },
      { status: "IN_REVIEW", label: "In Review / PR", color: "border-purple-500 text-purple-700", icon: faCodePullRequest },
      { status: "DONE", label: "Done & Verified", color: "border-emerald-500 text-emerald-700", icon: faCheck },
    ];

    return (
      <div className="space-y-5">
        <VirtualWorkspaceHeader
          title="Sprint Agile Kanban Board"
          description={`Showing tickets tailored for: ${config.label}`}
          breadcrumbs={[{ label: "Sprint & Delivery", onClick: () => onNavigate("vw_projects") }, { label: "Tasks & Tickets" }]}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
          {columns.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col min-h-[460px]"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3">
                  <div className="flex items-center space-x-2">
                    <FontAwesomeIcon icon={col.icon} className={`text-${col.color.split(" ")[0].replace("border-", "").replace("text-", "")}-600`} />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {col.label}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto">
                  {colTasks.map((ticket) => (
                    <div
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 shadow-xs hover:border-indigo-500/60 cursor-pointer transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {ticket.ticketNumber}
                        </span>
                        <StatusBadge status={ticket.priority} />
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                        {ticket.title}
                      </h4>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span>{ticket.storyPoints} SP</span>
                        <span className="font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[100px]">
                          {ticket.assigneeMembership?.student?.name?.split(" ")[0] || "Unassigned"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                        {col.status !== "TODO" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveTicket(
                                ticket.id,
                                col.status === "DONE"
                                  ? "IN_REVIEW"
                                  : col.status === "IN_REVIEW"
                                  ? "IN_PROGRESS"
                                  : "TODO"
                              );
                            }}
                            className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            ← Move Back
                          </button>
                        )}
                        {col.status !== "DONE" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (col.status === "IN_PROGRESS") {
                                setSelectedTicket(ticket);
                                setShowSubmitWorkModal(true);
                              } else {
                                handleMoveTicket(
                                  ticket.id,
                                  col.status === "TODO"
                                    ? "IN_PROGRESS"
                                    : col.status === "IN_REVIEW"
                                    ? "DONE"
                                    : "IN_REVIEW"
                                );
                              }
                            }}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 ml-auto"
                          >
                            {col.status === "IN_PROGRESS" ? "Submit PR →" : "Advance →"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-bold ml-auto">✓ Verified</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderProjects = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Projects"
        description="Active and upcoming projects in your simulation"
        breadcrumbs={[{ label: "Sprint & Delivery" }, { label: "Projects" }]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {workspace.projects.map((proj) => (
          <VirtualWorkspaceCard key={proj.id} className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full">
                  {proj.epic || "Core Platform"}
                </span>
                <StatusBadge status={proj.status} />
              </div>

              <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2.5">
                {proj.name}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Team: {proj.team?.teamName || "Unassigned"}</p>

              <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                {proj.description || "No description provided."}
              </p>

              <div className="mt-3.5 space-y-1.5 text-xs">
                <div className="flex items-center space-x-1.5 text-slate-500">
                  <FontAwesomeIcon icon={faDiagramProject} className="text-xs" />
                  <span>Status: {proj.status}</span>
                </div>
                {proj.targetReleaseDate && (
                  <div className="flex items-center space-x-1.5 text-slate-500">
                    <FontAwesomeIcon icon={faCalendarCheck} className="text-xs" />
                    <span>Target Release: {new Date(proj.targetReleaseDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">{proj.requiredCareerPaths?.length || 0} roles required</span>
              <button className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-xs text-[11px]">
                View Project
              </button>
            </div>
          </VirtualWorkspaceCard>
        ))}
      </div>
    </div>
  );

  const renderTeamAndChat = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <VirtualWorkspaceCard className="p-5 space-y-4 lg:col-span-1">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
          <FontAwesomeIcon icon={faUsers} className="text-indigo-600" />
          <span>My Virtual Squad & Mentors</span>
        </h3>

        <div className="space-y-3">
          {workspace.teamMembers.map((tm) => (
            <div
              key={tm.id}
              className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                  {tm.student?.name?.charAt(0) || "?"}
                </div>
                <div>
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white">{tm.student?.name || "Unknown"}</h5>
                  <p className="text-[11px] text-slate-400">{CAREER_PATH_CONFIG[tm.careerPath]?.label || tm.careerPath}</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600">● {tm.status}</span>
            </div>
          ))}
        </div>
      </VirtualWorkspaceCard>

      <VirtualWorkspaceCard className="lg:col-span-2 flex flex-col h-[520px]">
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-xs text-slate-900 dark:text-white">{activeChannel}</span>
            <span className="text-[11px] text-slate-400">NovaTech Internal Chat</span>
          </div>
          <div className="flex items-center space-x-1">
            {["#frontend-squad", "#incident-bridge", "#general"].map((ch) => (
              <button
                key={ch}
                onClick={() => setActiveChannel(ch)}
                className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                  activeChannel === ch
                    ? "bg-indigo-600 text-white"
                    : "text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {(channelMessages[activeChannel] || []).map((msg, i) => (
            <div key={i} className="text-xs space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className={`font-bold ${msg.isBot ? "text-indigo-600" : "text-slate-900 dark:text-white"}`}>
                  {msg.sender}
                </span>
                <span className="text-[10px] text-slate-400">{msg.time}</span>
              </div>
              <p className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                {msg.text}
              </p>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!chatInput.trim()) return;
            const updated = {
              ...channelMessages,
              [activeChannel]: [
                ...(channelMessages[activeChannel] || []),
                { sender: "Aarav Sharma (You)", text: chatInput, time: "Just now" },
              ],
            };
            setChannelMessages(updated);
            setChatInput("");
          }}
          className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2"
        >
          <input
            type="text"
            placeholder={`Message ${activeChannel}...`}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs"
          >
            Send
          </button>
        </form>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderIncidents = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Incidents & Crisis Simulation"
        description="High-stakes production emergency exercises"
        breadcrumbs={[{ label: "Engineering & Quality" }, { label: "Incidents & Challenges" }]}
      />

      <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-2xl p-6">
        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-600 text-white uppercase tracking-wider">
          Simulated Production Incident Simulation
        </span>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-2">
          High-Stakes Production Emergency Exercises
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
          Learn real DevOps triage, APM log inspection, hotfix deployment, and post-mortem facilitation without risk to real systems.
        </p>
      </div>

      <div className="space-y-4">
        {workspace.events.filter(e => e.eventType === "INCIDENT_CRISIS").map((inc) => (
          <VirtualWorkspaceCard key={inc.id} className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{inc.title}</h4>
                <p className="text-xs text-slate-400">Detected: {new Date(inc.detectedAt).toLocaleString()}</p>
              </div>
              <StatusBadge status={inc.severity} />
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-800 text-xs">
              <strong>Impact Assessment:</strong> {inc.impact}
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <strong className="text-slate-900 dark:text-white block">Recommended Mitigation Protocol:</strong>
              <ul className="list-disc pl-4 space-y-1">
                {inc.recommendedActions.map((act, i) => (
                  <li key={i}>{act}</li>
                ))}
              </ul>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs"
              >
                Join Incident War Room
              </button>
            </div>
          </VirtualWorkspaceCard>
        ))}
      </div>
    </div>
  );

  const renderWorkSubmission = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Work Submission"
        description="Submit your deliverables for review"
        breadcrumbs={[{ label: "Engineering & Quality" }, { label: "Work Submission" }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <VirtualWorkspaceCard className="lg:col-span-2 p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Submit Deliverable</h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm">Select a task and submit your work for review.</p>

          <div className="space-y-4">
            {filteredTasks.filter(t => t.status === "IN_PROGRESS" || t.status === "TODO").map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => {
                  setSelectedTicket(ticket);
                  setShowSubmitWorkModal(true);
                }}
                className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-indigo-500 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">{ticket.ticketNumber}</span>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-1">{ticket.title}</h4>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{ticket.storyPoints} Story Points • {ticket.priority} Priority</p>
              </div>
            ))}
          </div>
        </VirtualWorkspaceCard>

        <VirtualWorkspaceCard className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Submission Guidelines</h3>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs space-y-2 border border-slate-200 dark:border-slate-700">
            <p><strong>Required:</strong> Pull Request URL or deliverable link</p>
            <p><strong>Optional:</strong> Figma spec, test report, documentation link</p>
            <p><strong>Notes:</strong> Document unit test results, branch coverage, or manual verification steps</p>
            <p><strong>Review:</strong> NovaBot CI/CD will run automated checks (lint, tests, security)</p>
          </div>
        </VirtualWorkspaceCard>
      </div>
    </div>
  );

  const renderReviews = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Code Reviews"
        description="Review and receive feedback on submissions"
        breadcrumbs={[{ label: "Engineering & Quality" }, { label: "Reviews" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        <p className="text-slate-600 dark:text-slate-400">Code reviews interface coming soon. This will show pending reviews, review history, and review feedback.</p>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderQA = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="QA & Testing"
        description="Quality assurance and automated testing"
        breadcrumbs={[{ label: "Engineering & Quality" }, { label: "QA & Testing" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        <p className="text-slate-600 dark:text-slate-400">QA & Testing interface coming soon. This will show test suites, test runs, coverage reports, and quality gates.</p>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderPerformance = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Performance"
        description="Your performance metrics and assessments"
        breadcrumbs={[{ label: "Professional Development" }, { label: "Performance" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        {workspace.assessment ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard title="Technical Score" value={`${workspace.assessment.technicalScore}/100`} icon={faCode} color="indigo" />
            <MetricCard title="Process & Agile" value={`${workspace.assessment.processAgileScore}/100`} icon={faDiagramProject} color="emerald" />
            <MetricCard title="Collaboration" value={`${workspace.assessment.collaborationScore}/100`} icon={faUsers} color="blue" />
            <MetricCard title="Communication" value={`${workspace.assessment.communicationScore}/100`} icon={faComments} color="purple" />
            <MetricCard title="Problem Solving" value={`${workspace.assessment.problemSolvingScore}/100`} icon={faBrain} color="rose" />
            <MetricCard title="Overall Score" value={`${workspace.assessment.overallScore}/100`} icon={faTrophy} color="amber" subtitle={`Grade: ${workspace.assessment.benchmarkGrade || "N/A"}`} />
          </div>
        ) : (
          <div className="text-center py-12">
            <FontAwesomeIcon icon={faChartPie} className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No Assessment Yet</h3>
            <p className="text-slate-600 dark:text-slate-400">Complete tasks and submissions to receive your first performance assessment.</p>
          </div>
        )}
      </VirtualWorkspaceCard>
    </div>
  );

  const renderSkills = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Skills & Competencies"
        description="Track your competency development"
        breadcrumbs={[{ label: "Professional Development" }, { label: "Skills & Competencies" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        <div className="space-y-4">
          {workspace.competencies.slice(0, 10).map((comp) => (
            <div key={comp.skill} className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{comp.skill}</h4>
                  <p className="text-xs text-slate-500 capitalize">{comp.category.toLowerCase()}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all"
                      style={{ width: `${comp.level}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-10 text-right">{comp.level}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderPortfolio = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Professional Portfolio"
        description="Build and showcase your professional portfolio"
        breadcrumbs={[{ label: "Professional Development" }, { label: "Portfolio" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        {workspace.portfolio ? (
          <div className="space-y-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{workspace.portfolio.headline || "Professional Portfolio"}</h3>
              <p className="text-slate-600 dark:text-slate-400 mt-1">{workspace.portfolio.bio || "No bio provided."}</p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Featured Skills</h4>
              <div className="flex flex-wrap gap-2">
                {workspace.portfolio.featuredSkills?.map((skill, i) => (
                  <span key={i} className="px-2.5 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded-md font-mono text-[11px]">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <FontAwesomeIcon icon={faBriefcase} className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No Portfolio Yet</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">Create your professional portfolio to showcase your skills and deliverables.</p>
            <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs">
              Create Portfolio
            </button>
          </div>
        )}
      </VirtualWorkspaceCard>
    </div>
  );

  const renderCompany = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="My Company"
        description={company?.companyOverview || "Company overview and information"}
        breadcrumbs={[{ label: "Workplace Overview" }, { label: "My Company" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        <div className="flex items-center space-x-4 mb-6">
          <div className="h-16 w-16 rounded-xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center flex-shrink-0">
            <FontAwesomeIcon icon={faBuilding} className="text-indigo-600 text-2xl" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{company?.name || "Virtual Company"}</h3>
            <p className="text-slate-600 dark:text-slate-400">{company?.brandTagline || "Simulated enterprise environment"}</p>
            <p className="text-xs text-slate-500 mt-1">{company?.industry} • {company?.headquarters} • {company?.simulatedEmployeeCount} employees</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Company Overview</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">{company?.companyOverview || "No overview provided."}</p>
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Business Model</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">{company?.businessModel || "No business model provided."}</p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Technologies</h4>
          <div className="flex flex-wrap gap-2">
            {company?.technologies?.map((tech, i) => (
              <span key={i} className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md font-mono text-[11px]">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderDepartment = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="My Department"
        description={department?.description || "Department information"}
        breadcrumbs={[{ label: "Workplace Overview" }, { label: "My Department" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        <div className="flex items-center space-x-4 mb-6">
          <div className="h-16 w-16 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
            <FontAwesomeIcon icon={faSitemap} className="text-blue-600 text-2xl" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{department?.name || "Department"}</h3>
            <p className="text-slate-600 dark:text-slate-400">{department?.description || "No description provided."}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Open Roles</h4>
            <div className="flex flex-wrap gap-2">
              {department?.openRoles?.map((role, i) => (
                <span key={i} className="px-2.5 py-1 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 rounded-md font-mono text-[11px]">
                  {CAREER_PATH_CONFIG[role as CareerPath]?.label || role}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Workflow Config</h4>
            <dl className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <div className="flex justify-between"><dt>Sprint Length</dt><dd>{department?.workflowConfig?.sprintLengthDays} days</dd></div>
              <div className="flex justify-between"><dt>Standup Time</dt><dd>{department?.workflowConfig?.standupTime}</dd></div>
              <div className="flex justify-between"><dt>Code Review Required</dt><dd>{department?.workflowConfig?.codeReviewRequired ? "Yes" : "No"}</dd></div>
              <div className="flex justify-between"><dt>CI/CD Enabled</dt><dd>{department?.workflowConfig?.ciCdEnabled ? "Yes" : "No"}</dd></div>
            </dl>
          </div>
        </div>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderDocumentation = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Documentation"
        description="Technical documentation and knowledge base"
        breadcrumbs={[{ label: "Sprint & Delivery" }, { label: "Documentation" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        <p className="text-slate-600 dark:text-slate-400">Documentation interface coming soon. This will show API docs, architecture decisions, runbooks, and team wiki.</p>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderMeetings = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Meetings"
        description="Scheduled meetings and ceremonies"
        breadcrumbs={[{ label: "Sprint & Delivery" }, { label: "Meetings" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        <div className="space-y-3">
          {workspace.meetings.slice(0, 10).map((meeting) => (
            <div key={meeting.id} className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center text-xs font-bold">
                  <FontAwesomeIcon icon={faCalendarCheck} className="text-xs" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">{meeting.title}</h4>
                  <p className="text-[11px] text-slate-500">{meeting.meetingType} • {meeting.durationMinutes} min</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <StatusBadge status={meeting.status} />
                {meeting.meetingLink && (
                  <a href={meeting.meetingLink} target="_blank" rel="noreferrer" className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-md border border-blue-200 dark:border-blue-800 hover:bg-blue-100">
                    Join
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderCommunication = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Communication"
        description="Team channels and announcements"
        breadcrumbs={[{ label: "Sprint & Delivery" }, { label: "Communication" }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <VirtualWorkspaceCard className="lg:col-span-1 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Channels</h3>
          <div className="space-y-2">
            {["#frontend-squad", "#backend-squad", "#devops", "#incident-bridge", "#general", "#random"].map((ch) => (
              <button
                key={ch}
                onClick={() => setActiveChannel(ch)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  activeChannel === ch
                    ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800"
                    : "border-slate-200 dark:border-slate-800 hover:border-indigo-300"
                }`}
              >
                <span className="font-bold text-xs">{ch}</span>
                <p className="text-[11px] text-slate-500">Team channel</p>
              </button>
            ))}
          </div>
        </VirtualWorkspaceCard>
        <VirtualWorkspaceCard className="lg:col-span-2 flex flex-col h-[520px]">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-xs text-slate-900 dark:text-white">{activeChannel}</span>
              <span className="text-[11px] text-slate-400">NovaTech Internal Chat</span>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {(channelMessages[activeChannel] || []).map((msg, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="flex items-center space-x-2">
                  <span className={`font-bold ${msg.isBot ? "text-indigo-600" : "text-slate-900 dark:text-white"}`}>
                    {msg.sender}
                  </span>
                  <span className="text-[10px] text-slate-400">{msg.time}</span>
                </div>
                <p className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  {msg.text}
                </p>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!chatInput.trim()) return;
              const updated = {
                ...channelMessages,
                [activeChannel]: [
                  ...(channelMessages[activeChannel] || []),
                  { sender: "Aarav Sharma (You)", text: chatInput, time: "Just now" },
                ],
              };
              setChannelMessages(updated);
              setChatInput("");
            }}
            className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2"
          >
            <input
              type="text"
              placeholder={`Message ${activeChannel}...`}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs">
              Send
            </button>
          </form>
        </VirtualWorkspaceCard>
      </div>
    </div>
  );

  const renderSpecialistWorkspace = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Specialist Workspace"
        description={`Specialized tools for ${config.label}`}
        breadcrumbs={[{ label: "Workplace Overview" }, { label: "Specialist Workspace" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center space-x-2">
              <FontAwesomeIcon icon={config.icon} className="text-indigo-600" />
              <span>{config.label} Workbench</span>
            </h4>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">{config.description}</p>
            <div className="flex flex-wrap gap-2">
              {config.tools.map((tool, i) => (
                <span key={i} className="px-2.5 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded-md font-mono text-[11px]">
                  {tool}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-600 dark:text-slate-400">Specialist workspace tools (IDE, Design Canvas, Network Simulator, etc.) will be integrated here.</p>
          </div>
        </div>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderAIAssistant = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="AI Assistant"
        description="Chat with virtual mentors and AI agents"
        breadcrumbs={[{ label: "Workplace Overview" }, { label: "AI Assistant" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        <p className="text-slate-600 dark:text-slate-400">AI Assistant interface coming soon. This will provide access to virtual mentors, code reviewers, and AI-powered assistance.</p>
      </VirtualWorkspaceCard>
    </div>
  );

  const renderCrossFunctional = () => (
    <div className="space-y-6">
      <VirtualWorkspaceHeader
        title="Cross-Functional Workspace"
        description="Collaborate across disciplines on shared projects"
        breadcrumbs={[{ label: "Workplace Overview" }, { label: "Cross-Functional" }]}
      />

      <VirtualWorkspaceCard className="p-6">
        <p className="text-slate-600 dark:text-slate-400">Cross-functional workspace coming soon. This will show multi-discipline projects and collaboration tools.</p>
      </VirtualWorkspaceCard>
    </div>
  );

  const getPageContent = () => {
    switch (activePage) {
      case "vw_overview":
        return renderOverview();
      case "vw_tasks":
        return renderTasksAndTickets();
      case "vw_projects":
        return renderProjects();
      case "vw_team":
      case "vw_communication":
        return renderTeamAndChat();
      case "vw_incidents":
        return renderIncidents();
      case "vw_submission":
        return renderWorkSubmission();
      case "vw_reviews":
        return renderReviews();
      case "vw_qa":
        return renderQA();
      case "vw_performance":
        return renderPerformance();
      case "vw_skills":
        return renderSkills();
      case "vw_portfolio":
        return renderPortfolio();
      case "vw_company":
        return renderCompany();
      case "vw_department":
        return renderDepartment();
      case "vw_documentation":
        return renderDocumentation();
      case "vw_meetings":
        return renderMeetings();
      case "vw_specialist_workspace":
        return renderSpecialistWorkspace();
      case "vw_ai_assistant":
        return renderAIAssistant();
      case "vw_cross_functional":
        return renderCrossFunctional();
      default:
        return (
          <VirtualWorkspaceCard className="p-6 space-y-4">
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                <FontAwesomeIcon icon={faLaptopCode} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white capitalize">
                  {activePage.replace("vw_", "").replace(/_/g, " ")} Workspace Module
                </h3>
                <p className="text-xs text-slate-500">
                  Operating inside {company?.name || "simulation"} ({careerPath.replace(/_/g, " ")})
                </p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs space-y-2 border border-slate-200 dark:border-slate-700">
              <p><strong>Sprint Active:</strong> Sprint {simulation?.currentSprintNumber || 1}</p>
              <p><strong>Environment:</strong> Staging Cluster (Kubernetes Namespace: sim-workspace)</p>
              <p><strong>Automated Peer Reviewer:</strong> NovaBot CI/CD (Checks branch coverage, eslint, and security policies)</p>
            </div>
          </VirtualWorkspaceCard>
        );
    }
  };

  return (
    <VirtualWorkspaceLayout
      membershipId={membershipId}
      activePage={activePage}
      onNavigate={onNavigate}
      careerPath={careerPath}
      onChangeCareerPath={onChangeCareerPath}
      onExitWorkspace={onExitWorkspace}
      initialCompany={company}
      initialDepartment={department}
      initialTeam={team}
    >
      {getPageContent()}

      <ModalWrapper
        isOpen={showSubmitWorkModal}
        onClose={() => setShowSubmitWorkModal(false)}
        title={`Submit Work for ${selectedTicket?.ticketNumber || "Ticket"}`}
      >
        <form onSubmit={handleSubmitWork} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold block mb-1">Ticket Title</label>
            <input
              type="text"
              readOnly
              value={selectedTicket?.title || ""}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600"
            />
          </div>

          <div>
            <label className="font-semibold block mb-1">
              Pull Request URL / Figma Spec / Test Report URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://github.com/novatech-simulated/frontend-core/pull/350"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <label className="font-semibold block mb-1">Submission Notes & Test Output</label>
            <textarea
              rows={3}
              placeholder="Document unit test results, branch coverage, or manual verification steps..."
              value={submissionNotes}
              onChange={(e) => setSubmissionNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          {submissionSuccess && (
            <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-lg font-semibold text-center">
              ✓ Deliverable submitted! Ticket moved to 'IN_REVIEW'. NovaBot dispatched for automated review.
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowSubmitWorkModal(false)}
              className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs"
            >
              Submit Deliverable
            </button>
          </div>
        </form>
      </ModalWrapper>
    </VirtualWorkspaceLayout>
  );
};
