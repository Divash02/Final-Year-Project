import React, { useState } from "react";
import {
  MOCK_VIRTUAL_COMPANIES,
  MOCK_VIRTUAL_TEAM,
  MOCK_VIRTUAL_TICKETS,
  MOCK_VIRTUAL_INCIDENTS,
  MOCK_COMPETENCIES,
} from "../mockData";
import { CareerPath, TaskStatus, VirtualTicket } from "../types";
import {
  StatusBadge,
  MetricCard,
  ModalWrapper,
  DrawerWrapper,
} from "../components/SharedWidgets";
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
  faTerminal,
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
} from "@fortawesome/free-solid-svg-icons";

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
}

export const VirtualWorkplaceWorkspace: React.FC<VirtualWorkplaceWorkspaceProps> = ({
  activePage,
  onNavigate,
  careerPath,
  onChangeCareerPath,
}) => {
  const company = MOCK_VIRTUAL_COMPANIES[0]; // NovaTech Cloud Enterprise
  const config = CAREER_PATH_CONFIG[careerPath];

  // Interactive ticket state
  const [tickets, setTickets] = useState<VirtualTicket[]>(MOCK_VIRTUAL_TICKETS);
  const [selectedTicket, setSelectedTicket] = useState<VirtualTicket | null>(null);

  // Work submission modal state
  const [showSubmitWorkModal, setShowSubmitWorkModal] = useState(false);
  const [prUrl, setPrUrl] = useState("");
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // Specialist workspace state
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

  // Interactive Simulated Chat Channels State
  const [activeChannel, setActiveChannel] = useState("#frontend-squad");
  const [channelMessages, setChannelMessages] = useState<Record<string, { sender: string; text: string; time: string; isBot?: boolean }[]>>({
    "#frontend-squad": [
      { sender: "NovaBot (CI/CD)", text: "Build #1042 passed on branch fix/auth-token-loop. Staging environment updated.", time: "11:20 AM", isBot: true },
      { sender: "Elena Rostova (Staff Lead)", text: "Hey @Aarav, please test the OTP modal pasted clipboard behavior in safari viewport.", time: "11:25 AM" },
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

  // Move ticket across Kanban status
  const handleMoveTicket = (ticketId: string, newStatus: TaskStatus) => {
    const updated = tickets.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t));
    setTickets(updated);
  };

  // Submit deliverable
  const handleSubmitWork = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    const updated = tickets.map((t) =>
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
    );
    setTickets(updated);
    setSubmissionSuccess(true);
    setTimeout(() => {
      setShowSubmitWorkModal(false);
      setSubmissionSuccess(false);
      setPrUrl("");
      setSubmissionNotes("");
    }, 1200);
  };

  // Filter tickets by active career track
  const filteredTickets = tickets.filter((t) => t.careerPath === careerPath);

  // --------------------------------------------------------------------------
  // VIEW 1: WORKPLACE OVERVIEW
  // --------------------------------------------------------------------------
  const renderOverview = () => (
    <div className="space-y-6">
      {/* Simulation Hero */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
              Simulated Professional Experience
            </span>
            <span className="text-xs text-indigo-300">Sprint 44 (Day 6 of 10)</span>
          </div>
          <h2 className="text-xl font-bold mt-2">{company.name}</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            {company.brandTagline} — Operating in production-grade simulated infrastructure. All pull requests, code reviews, and sprint ceremonies emulate real enterprise standards.
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

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Sprint Velocity"
          value="18 / 24 SP"
          subtitle="75% Burndown On-Track"
          icon={faChartPie}
          color="indigo"
        />
        <MetricCard
          title="Assigned Tickets"
          value={`${filteredTickets.length} Tickets`}
          subtitle={`${filteredTickets.filter((t) => t.status === "DONE").length} Completed`}
          icon={faListCheck}
          color="emerald"
        />
        <MetricCard
          title="Team Squad"
          value="5 Colleagues"
          subtitle="4 Engineers, 1 AI Code Reviewer"
          icon={faUsers}
          color="blue"
        />
        <MetricCard
          title="Active Incidents"
          value="1 Critical"
          subtitle="SEV-1 CPU & Memory Spike"
          icon={faFire}
          color="rose"
        />
      </div>

      {/* Career-Path Specialized Spotlight */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
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

        {/* Specialist Workspace Quick Access */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => onNavigate("vw_specialist_workspace")}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-left hover:border-indigo-500 transition-colors"
          >
            <FontAwesomeIcon icon={config.icon} className="text-indigo-600 text-lg" />
            <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">Specialist Workspace</p>
            <p className="text-[10px] text-slate-500">Open {config.label} tools</p>
          </button>
          <button
            onClick={() => onNavigate("vw_ai_assistant")}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-left hover:border-purple-500 transition-colors"
          >
            <FontAwesomeIcon icon={faBrain} className="text-purple-600 text-lg" />
            <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">AI Assistant</p>
            <p className="text-[10px] text-slate-500">Chat with virtual mentors</p>
          </button>
          <button
            onClick={() => onNavigate("vw_cross_functional")}
            className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-left hover:border-teal-500 transition-colors"
          >
            <FontAwesomeIcon icon={faSitemapIcon} className="text-teal-600 text-lg" />
            <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1">Cross-Functional</p>
            <p className="text-[10px] text-slate-500">Join multi-discipline projects</p>
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
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // VIEW 2: INTERACTIVE KANBAN BOARD (TASKS & TICKETS)
  // --------------------------------------------------------------------------
  const renderTasksAndTickets = () => {
    const columns: { status: TaskStatus; label: string; color: string }[] = [
      { status: "TODO", label: "To Do / Backlog", color: "border-slate-300 text-slate-700" },
      { status: "IN_PROGRESS", label: "In Development", color: "border-blue-500 text-blue-700" },
      { status: "IN_REVIEW", label: "In Review / PR", color: "border-purple-500 text-purple-700" },
      { status: "DONE", label: "Done & Verified", color: "border-emerald-500 text-emerald-700" },
    ];

    const allCareerPaths: CareerPath[] = [
      "frontend_developer", "backend_developer", "fullstack_developer", "uiux_designer",
      "database_engineer", "network_engineer", "qa_engineer", "devops_engineer",
      "cloud_engineer", "ai_ml_engineer", "data_engineer", "project_manager",
      "business_analyst", "product_manager", "technical_writer", "systems_analyst",
      "it_support_engineer", "security_engineer", "mobile_developer", "embedded_engineer"
    ];

    return (
      <div className="space-y-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Sprint 44 Agile Kanban Board
            </h2>
            <p className="text-xs text-slate-500">
              Showing tickets tailored for: <strong className="capitalize text-indigo-600">{config.label}</strong>
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500">Switch Path:</span>
            <select
              value={careerPath}
              onChange={(e) => onChangeCareerPath(e.target.value as CareerPath)}
              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1"
            >
              {allCareerPaths.map((path) => (
                <option key={path} value={path}>{CAREER_PATH_CONFIG[path].label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 4-Column Board */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
          {columns.map((col) => {
            const colTickets = filteredTickets.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col min-h-[460px]"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {col.label}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {colTickets.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto">
                  {colTickets.map((ticket) => (
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
                        <span>{ticket.storyPoints} Story Points</span>
                        <span className="font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[100px]">
                          {ticket.assigneeName.split(" ")[0]}
                        </span>
                      </div>

                      {/* Click to advance status controls */}
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

  // --------------------------------------------------------------------------
  // VIEW 3: SIMULATED TEAM & COMMUNICATION
  // --------------------------------------------------------------------------
  const renderTeamAndChat = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Team Roster */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
          <FontAwesomeIcon icon={faUsers} className="text-indigo-600" />
          <span>My Virtual Squad & Mentors</span>
        </h3>

        <div className="space-y-3">
          {MOCK_VIRTUAL_TEAM.map((tm) => (
            <div
              key={tm.id}
              className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                  {tm.avatar}
                </div>
                <div>
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white">{tm.name}</h5>
                  <p className="text-[11px] text-slate-400">{tm.role}</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600">● {tm.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Simulated Channel Chat */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col h-[520px]">
        {/* Channel Header */}
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

        {/* Messages */}
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

        {/* Input */}
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
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // VIEW 4: INCIDENTS & CRISIS SIMULATION
  // --------------------------------------------------------------------------
  const renderIncidents = () => (
    <div className="space-y-6">
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
        {MOCK_VIRTUAL_INCIDENTS.map((inc) => (
          <div
            key={inc.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{inc.title}</h4>
                <p className="text-xs text-slate-400">Detected: {inc.detectedAt}</p>
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
                onClick={() => alert(`Launched Incident Bridge for ${inc.title}`)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs"
              >
                Join Incident War Room
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSpecialistWorkspace = () => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Specialist Workspace</h2>
      <p className="text-slate-600 dark:text-slate-400">Specialist workspace coming soon.</p>
    </div>
  );

  const renderAIAssistant = () => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI Assistant</h2>
      <p className="text-slate-600 dark:text-slate-400">AI assistant coming soon.</p>
    </div>
  );

  const renderCrossFunctional = () => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cross-Functional Workspace</h2>
      <p className="text-slate-600 dark:text-slate-400">Cross-functional workspace coming soon.</p>
    </div>
  );

  const renderPortfolio = () => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Portfolio</h2>
      <p className="text-slate-600 dark:text-slate-400">Portfolio coming soon.</p>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      {activePage === "vw_overview" && renderOverview()}
      {(activePage === "vw_tasks" || activePage === "vw_projects") && renderTasksAndTickets()}
      {(activePage === "vw_team" || activePage === "vw_communication" || activePage === "vw_meetings") &&
        renderTeamAndChat()}
      {activePage === "vw_incidents" && renderIncidents()}

      {/* Specialist Workspace Views */}
      {activePage === "vw_specialist_workspace" && renderSpecialistWorkspace()}
      {activePage === "vw_ai_assistant" && renderAIAssistant()}
      {activePage === "vw_cross_functional" && renderCrossFunctional()}
      {activePage === "vw_portfolio" && renderPortfolio()}

      {/* Fallback for company/dept/docs/submission/reviews/qa/performance/skills/portfolio */}
      {(activePage === "vw_company" ||
        activePage === "vw_department" ||
        activePage === "vw_documentation" ||
        activePage === "vw_submission" ||
        activePage === "vw_reviews" ||
        activePage === "vw_qa" ||
        activePage === "vw_performance" ||
        activePage === "vw_skills" ||
        activePage === "vw_portfolio") && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
              <FontAwesomeIcon icon={faLaptopCode} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white capitalize">
                {activePage.replace("vw_", "").replace(/_/g, " ")} Workspace Module
              </h3>
              <p className="text-xs text-slate-500">
                Operating inside {company.name} simulation ({careerPath.replace(/_/g, " ")})
              </p>
            </div>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs space-y-2 border border-slate-200 dark:border-slate-700">
            <p><strong>Sprint Active:</strong> Sprint 44 (Nov 15 - Nov 27)</p>
            <p><strong>Environment:</strong> Staging Cluster us-east-1 (Kubernetes Namespace: sim-novatech-aegis)</p>
            <p><strong>Automated Peer Reviewer:</strong> NovaBot CI/CD (Checks branch coverage, eslint, and security policies)</p>
          </div>
        </div>
      )}

      {/* Modal: Work Submission / Pull Request Link */}
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
    </div>
  );
};
