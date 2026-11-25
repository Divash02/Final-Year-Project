import React, { useState, createContext, useContext, ReactNode } from "react";
import { CareerPath } from "../types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
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
  faSearch,
  faBell,
  faCircleQuestion,
  faUser,
  faSignOutAlt,
  faBars,
  faChevronLeft,
  faChevronRight,
  faHome,
  faBriefcase as faBriefcaseIcon,
  faLaptopCode,
} from "@fortawesome/free-solid-svg-icons";

interface VirtualWorkspaceContextType {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  membershipId: string | null;
  setMembershipId: (id: string) => void;
  company: any;
  setCompany: (company: any) => void;
  department: any;
  setDepartment: (dept: any) => void;
  team: any;
  setTeam: (team: any) => void;
  careerPath: CareerPath;
  setCareerPath: (path: CareerPath) => void;
  onExitWorkspace: () => void;
}

const VirtualWorkspaceContext = createContext<VirtualWorkspaceContextType | null>(null);

export function useVirtualWorkspace() {
  const context = useContext(VirtualWorkspaceContext);
  if (!context) {
    throw new Error("useVirtualWorkspace must be used within VirtualWorkspaceProvider");
  }
  return context;
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
  badge?: string | number;
  badgeColor?: string;
  requiredRoles?: CareerPath[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Workplace Overview",
    items: [
      { id: "overview", label: "Overview", icon: faHome },
      { id: "company", label: "My Company", icon: faBuilding },
      { id: "department", label: "My Department", icon: faSitemap },
      { id: "team", label: "My Team", icon: faUsers, badge: "5 online", badgeColor: "bg-emerald-500 text-white" },
    ],
  },
  {
    title: "Sprint & Delivery",
    items: [
      { id: "projects", label: "Projects", icon: faDiagramProject },
      { id: "tasks", label: "Tasks & Tickets", icon: faListCheck, badge: 3, badgeColor: "bg-indigo-600 text-white" },
      { id: "documentation", label: "Documentation", icon: faBookOpen },
      { id: "meetings", label: "Meetings", icon: faCalendarCheck },
      { id: "communication", label: "Communication", icon: faComments },
    ],
  },
  {
    title: "Engineering & Quality",
    items: [
      { id: "submission", label: "Work Submission", icon: faCodeBranch },
      { id: "reviews", label: "Reviews", icon: faCodeCompare },
      { id: "qa", label: "QA & Testing", icon: faClipboardCheck },
      { id: "incidents", label: "Incidents & Challenges", icon: faTriangleExclamation, badge: "1 Active", badgeColor: "bg-rose-500 text-white" },
    ],
  },
  {
    title: "Professional Development",
    items: [
      { id: "performance", label: "Performance", icon: faChartPie },
      { id: "skills", label: "Skills & Competencies", icon: faAward },
      { id: "portfolio", label: "Portfolio", icon: faBriefcase },
    ],
  },
];

const CAREER_PATH_CONFIG: Record<CareerPath, { label: string; icon: any; color: string; description: string; tools: string[] }> = {
  frontend_developer: { label: "Frontend Developer", icon: faLaptopCode, color: "indigo", description: "Build responsive, accessible UIs with React, TypeScript, and modern CSS.", tools: ["React 19", "TypeScript", "Tailwind CSS", "Vitest", "Playwright", "Storybook"] },
  backend_developer: { label: "Backend Developer", icon: faLaptopCode, color: "blue", description: "Design scalable APIs, microservices, and data layers with Node.js, Go, or Python.", tools: ["Node.js", "Go", "PostgreSQL", "Redis", "Kafka", "gRPC", "OpenAPI"] },
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
  product_manager: { label: "Product Manager", icon: faBriefcaseIcon, color: "indigo", description: "Define product strategy, prioritize backlogs, and measure outcomes.", tools: ["ProductBoard", "Amplitude", "A/B Testing", "Roadmaps", "User Research"] },
  technical_writer: { label: "Technical Writer", icon: faFileAlt, color: "cyan", description: "Create developer documentation, API references, and knowledge bases.", tools: ["Docs-as-Code", "OpenAPI", "Markdown", "Docusaurus", "Mermaid", "Vale"] },
  systems_analyst: { label: "Systems Analyst", icon: faCube, color: "teal", description: "Analyze system requirements, design architectures, and evaluate solutions.", tools: ["UML", "Architecture Diagrams", "Trade-off Analysis", "RFCs", "Decision Records"] },
  it_support_engineer: { label: "IT Support Engineer", icon: faWrench, color: "orange", description: "Manage endpoints, identity, and provide technical support at scale.", tools: ["MDM/Intune", "Okta/Azure AD", "ServiceNow", "Remote Access", "Scripting", "Asset Management"] },
  security_engineer: { label: "Security Engineer", icon: faLock, color: "red", description: "Secure applications, infrastructure, and respond to threats.", tools: ["SAST/DAST", "Burp Suite", "WAF", "SIEM", "Threat Modeling", "Compliance"] },
  mobile_developer: { label: "Mobile Developer", icon: faMobileAlt, color: "green", description: "Build native and cross-platform mobile applications.", tools: ["Swift/Kotlin", "React Native/Flutter", "Xcode/Android Studio", "Fastlane", "TestFlight"] },
  embedded_engineer: { label: "Embedded Engineer", icon: faMicrochipIcon, color: "yellow", description: "Develop firmware, RTOS, and hardware-software integration.", tools: ["C/C++", "Rust", "FreeRTOS/Zephyr", "JTAG", "Oscilloscopes", "Hardware Debuggers"] },
};

import {
  faLayerGroup,
  faPaintBrush,
  faDatabase,
  faNetworkWired,
  faBug,
  faCogs,
  faCloud,
  faBrain,
  faChartLine,
  faProjectDiagram,
  faSitemap as faSitemapIcon,
  faFileAlt,
  faCube,
  faWrench,
  faLock,
  faMobileAlt,
  faMicrochip as faMicrochipIcon,
  faBriefcase as faBriefcaseIcon,
  faServer,
  faGlobe,
  faMicrochip,
  faTerminal,
  faSearch,
  faPalette,
  faFire,
  faCode,
  faVial,
  faExternalLinkAlt,
  faArrowRight,
  faCheck,
  faTimes,
  faPlus,
  faPaperPlane,
} from "@fortawesome/free-solid-svg-icons";

interface VirtualWorkspaceLayoutProps {
  children: ReactNode;
  membershipId: string;
  activePage: string;
  onNavigate: (pageId: string) => void;
  careerPath: CareerPath;
  onChangeCareerPath: (path: CareerPath) => void;
  onExitWorkspace: () => void;
  initialCompany?: any;
  initialDepartment?: any;
  initialTeam?: any;
}

export const VirtualWorkspaceLayout: React.FC<VirtualWorkspaceLayoutProps> = ({
  children,
  membershipId,
  activePage,
  onNavigate,
  careerPath,
  onChangeCareerPath,
  onExitWorkspace,
  initialCompany,
  initialDepartment,
  initialTeam,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [company, setCompany] = useState(initialCompany);
  const [department, setDepartment] = useState(initialDepartment);
  const [team, setTeam] = useState(initialTeam);

  const config = CAREER_PATH_CONFIG[careerPath];

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const filteredSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.requiredRoles && item.requiredRoles.length > 0) {
        return item.requiredRoles.includes(careerPath);
      }
      return true;
    }),
  }));

  const handleNavClick = (pageId: string) => {
    onNavigate(pageId);
    if (window.innerWidth < 1024) {
      setIsMobileSidebarOpen(false);
    }
  };

  return (
    <VirtualWorkspaceContext.Provider
      value={{
        isSidebarOpen,
        setIsSidebarOpen,
        toggleSidebar,
        membershipId,
        setMembershipId,
        company,
        setCompany,
        department,
        setDepartment,
        team,
        setTeam,
        careerPath,
        setCareerPath: onChangeCareerPath,
        onExitWorkspace,
      }}
    >
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
        {/* Mobile sidebar overlay */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Left Sidebar */}
        <aside
          className={`fixed lg:relative z-50 flex-shrink-0 flex flex-col h-full transition-all duration-300 ease-in-out bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 ${
            isSidebarOpen ? "w-64" : "w-20"
          } ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
          aria-label="Virtual Workplace Navigation"
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200 dark:border-slate-800 bg-indigo-50/50 dark:bg-indigo-950/20">
            {isSidebarOpen && (
              <div className="flex items-center space-x-3 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  <FontAwesomeIcon icon={faLaptopCode} />
                </div>
                <div className="overflow-hidden">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    Virtual Workplace
                  </h2>
                  <p className="text-[10px] text-indigo-700 dark:text-indigo-400 font-medium">
                    Simulated Enterprise
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors lg:hidden"
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <FontAwesomeIcon icon={isSidebarOpen ? faChevronLeft : faChevronRight} className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto p-3 space-y-5 min-h-0">
            {filteredSections.map((sec, idx) => (
              isSidebarOpen && (
                <div key={idx}>
                  <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 px-3 mb-1.5">
                    {sec.title}
                  </h3>
                  <ul className="space-y-0.5">
                    {sec.items.map((item) => {
                      const isActive = activePage === item.id || (item.id === "overview" && activePage === "vw_overview");
                      const navId = item.id === "overview" ? "vw_overview" : item.id.startsWith("vw_") ? item.id : `vw_${item.id}`;
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => handleNavClick(navId)}
                            className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition-all ${
                              isActive
                                ? "bg-indigo-600 text-white shadow-xs font-semibold"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <div className="flex items-center space-x-2.5 truncate">
                              <FontAwesomeIcon
                                icon={item.icon}
                                className={`w-5 text-center ${isActive ? "text-white" : "text-slate-400"} flex-shrink-0`}
                              />
                              <span className="truncate">{item.label}</span>
                            </div>
                            {item.badge !== undefined && isSidebarOpen && (
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-1.5 flex-shrink-0 ${
                                  item.badgeColor || (isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300")
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
            ))}

            {/* Collapsed sidebar icons only */}
            {!isSidebarOpen && (
              <ul className="space-y-1">
                {filteredSections.flatMap((sec) =>
                  sec.items.map((item) => {
                    const isActive = activePage === item.id || (item.id === "overview" && activePage === "vw_overview");
                    const navId = item.id === "overview" ? "vw_overview" : item.id.startsWith("vw_") ? item.id : `vw_${item.id}`;
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => handleNavClick(navId)}
                          className={`mx-auto p-2 rounded-lg transition-all ${
                            isActive
                              ? "bg-indigo-600 text-white shadow-xs"
                              : "text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                          title={item.label}
                          aria-label={item.label}
                        >
                          <FontAwesomeIcon icon={item.icon} className="w-5 h-5" />
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>

          {/* Sidebar Footer - Career Path & Exit */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800">
            {isSidebarOpen && (
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center space-x-2">
                    <FontAwesomeIcon icon={config.icon} className={`text-${config.color}-600 text-lg`} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{config.label}</p>
                      <p className="text-[10px] text-slate-500">Simulated Role</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onChangeCareerPath(careerPath)}
                    className="mt-2 w-full text-left text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Change Simulated Role →
                  </button>
                </div>

                <button
                  onClick={onExitWorkspace}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                >
                  <FontAwesomeIcon icon={faSignOutAlt} className="w-4 h-4" />
                  <span>Exit Workspace</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Header */}
          <header className="h-16 flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-30 shadow-xs">
            <div className="h-full px-4 md:px-6 flex items-center justify-between">
              {/* Left: Company Info & Breadcrumbs */}
              <div className="flex items-center space-x-4 min-w-0 flex-1">
                <button
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="lg:hidden p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Open navigation"
                >
                  <FontAwesomeIcon icon={faBars} className="w-5 h-5" />
                </button>

                <div className="flex items-center space-x-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center flex-shrink-0">
                    <FontAwesomeIcon icon={faBuilding} className="text-indigo-600 text-lg" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {company?.name || "Virtual Company"}
                    </h1>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {department?.name ? `${department.name} • ${config.label}` : `${config.label} Workspace`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Center: Search */}
              <div className="relative max-w-md w-full md:max-w-lg mx-4 hidden sm:block">
                <FontAwesomeIcon
                  icon={faSearch}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"
                />
                <input
                  type="text"
                  placeholder="Search workspace..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all"
                />
              </div>

              {/* Right: Notifications, Help, Profile, Exit */}
              <div className="flex items-center space-x-1">
                <button
                  className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Notifications"
                >
                  <FontAwesomeIcon icon={faBell} className="w-5 h-5" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
                </button>
                <button
                  className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Help"
                >
                  <FontAwesomeIcon icon={faCircleQuestion} className="w-5 h-5" />
                </button>
                <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
                <div className="flex items-center space-x-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                  <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center flex-shrink-0">
                    <FontAwesomeIcon icon={faUser} className="text-indigo-600 text-sm" />
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 hidden sm:block">
                    Student
                  </span>
                </div>
                <button
                  onClick={onExitWorkspace}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                  aria-label="Exit Workspace"
                >
                  <FontAwesomeIcon icon={faSignOutAlt} className="w-4 h-4" />
                  <span className="hidden sm:inline">Exit Workspace</span>
                </button>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-full mx-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </VirtualWorkspaceContext.Provider>
  );
};

export function VirtualWorkspaceHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 mb-3">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
              {crumb.onClick ? (
                <button
                  onClick={crumb.onClick}
                  className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-slate-800 dark:text-slate-200 font-semibold">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center space-x-2">{actions}</div>}
      </div>
    </div>
  );
}

export function VirtualWorkspaceCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl ${className}`}>
      {children}
    </div>
  );
}

export function VirtualWorkspaceSection({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      {title && (
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
          <span>{title}</span>
        </h3>
      )}
      {children}
    </div>
  );
}