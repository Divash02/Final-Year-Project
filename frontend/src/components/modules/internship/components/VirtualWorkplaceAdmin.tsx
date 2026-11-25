import React, { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuilding,
  faPlus,
  faSearch,
  faFilter,
  faEdit,
  faTrash,
  faEye,
  faCopy,
  faDownload,
  faUpload,
  faSave,
  faTimes,
  faChevronDown,
  faChevronUp,
  faSpinner,
  faExclamationTriangle,
  faCheckCircle,
  faXmarkCircle,
  faClock,
  faPlay,
  faPause,
  faArchive,
  faSitemap,
  faUsers,
  faDiagramProject,
  faListCheck,
  faRobot,
  faMagic,
  faFileCode,
  faLayerGroup,
  faGear,
  faGlobe,
  faIndustry,
  faChartBar,
  faUserTie,
  faCodeBranch,
  faServer,
  faDatabase,
  faPalette,
  faWrench,
  faMicrochip,
  faMobileAlt,
  faLock,
  faBrain,
  faChartLine,
  faProjectDiagram,
  faFileAlt,
  faShieldAlt,
  faGraduationCap,
  faAward,
  faBriefcase,
  faCalendarAlt,
  faSort,
  faSortUp,
  faSortDown,
  faColumns,
  faList,
  faHourglassHalf,
  faTrophy,
  faCertificate,
  faArrowRight,
  faChevronLeft,
  faChevronRight,
  faHome,
  faGauge,
  faCodeMerge,
  faCodePullRequest,
  faCodeCommit,
  faTerminal,
  faCodeCompare,
  faNetworkWired,
  faCloud,
  faPlug,
  faMemory,
  faHdd,
  faGlobe as faGlobeIcon,
  faSquareCheck,
  faSquare,
  faPenToSquare,
  faTrashAlt,
  faEyeSlash,
  faBolt,
  faCogs,
  faSitemap as faSitemapIcon,
  faRoute,
  faMapSigns,
  faMagic as faMagicIcon,
} from "@fortawesome/free-solid-svg-icons";
import {
  StatusBadge,
  MetricCard,
  TablePagination,
  ModalWrapper,
  DrawerWrapper,
} from "../components/SharedWidgets";
import { virtualWorkplaceApi } from "../../../../services/virtualWorkplaceApi";
import { CareerPath } from "../types";

const CAREER_PATHS: CareerPath[] = [
  "frontend_developer", "backend_developer", "fullstack_developer",
  "uiux_designer", "database_engineer", "network_engineer",
  "qa_engineer", "devops_engineer", "cloud_engineer",
  "ai_ml_engineer", "data_engineer", "project_manager",
  "business_analyst", "product_manager", "technical_writer",
  "systems_analyst", "it_support_engineer", "security_engineer",
  "mobile_developer", "embedded_engineer",
];

const SECTORS = [
  "CLOUD_SAAS", "FINTECH_ENTERPRISE", "HEALTH_TECH", "ECOMMERCE_SCALEUP",
  "CYBER_SECURITY", "AI_ML_PLATFORM", "IOT_INDUSTRIAL", "EDTECH",
  "GAMING", "BLOCKCHAIN_WEB3", "AUTOMOTIVE_TECH", "TELECOM",
];

const DIFFICULTIES = ["FOUNDATIONAL", "ACCELERATED", "PRODUCTION_GRADE"];
const SIMULATION_STATUSES = ["DRAFT", "ENROLLING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];
const COMPANY_RULE_CATEGORIES = ["COMMUNICATION", "CODE_QUALITY", "SECURITY", "WORKFLOW", "MEETINGS", "OTHER"];
const PROFESSIONAL_EXPECTATION_CATEGORIES = ["TECHNICAL", "COMMUNICATION", "PROCESS", "COLLABORATION", "LEARNING"];

interface CompanyTemplateFormData {
  templateCode: string;
  name: string;
  brandTagline: string;
  sector: string;
  description: string;
  headquarters: string;
  simulatedEmployeeCount: number;
  technologies: string[];
  difficulty: string;
  defaultDepartments: Array<{ name: string; description: string; openRoles: string[] }>;
  defaultProjects: string[];
  companyRules: Array<{ title: string; description: string; category: string }>;
  professionalExpectations: Array<{ expectation: string; category: string }>;
  performanceReviewCriteria: Array<{ criterion: string; weight: number; description: string }>;
  isPublished: boolean;
}

interface SimulationFormData {
  template: string;
  simulationCode: string;
  companyName: string;
  academicYear: string;
  semester: number;
  startDate: string;
  endDate: string;
  status: string;
  settings: {
    allowSelfEnrollment: boolean;
    requireApplication: boolean;
    maxParticipants: number;
    enableAiWorkforce: boolean;
    enableCrossFunctionalProjects: boolean;
  };
}

interface DepartmentFormData {
  name: string;
  description: string;
  openRoles: string[];
  workflowConfig: {
    sprintLengthDays: number;
    standupTime: string;
    retrospectiveEnabled: boolean;
    codeReviewRequired: boolean;
    ciCdEnabled: boolean;
  };
}

interface RoleFormData {
  title: string;
  department: string;
  description: string;
  responsibilities: string[];
  requiredSkills: string[];
  learningObjectives: string[];
  expectedDeliverables: string[];
  competencyCriteria: string[];
  availableProjects: string[];
  taskTemplates: string[];
}

interface ProjectFormData {
  title: string;
  description: string;
  department: string;
  eligibleRoles: string[];
  objectives: string[];
  scope: string;
  startDate: string;
  endDate: string;
  phases: string[];
  expectedDeliverables: string[];
  requiredCompetencies: string[];
  taskTemplates: string[];
  reviewRequirements: string[];
  completionCriteria: string[];
}

interface TaskFormData {
  title: string;
  description: string;
  category: string;
  assignedRole: string;
  priority: string;
  estimatedDuration: string;
  dueDateRules: string;
  dependencies: string[];
  instructions: string;
  requiredAttachments: string[];
  expectedOutput: string;
  acceptanceCriteria: string[];
  competenciesAssessed: string[];
}

interface AgentFormData {
  name: string;
  role: string;
  careerPath: string;
  department: string;
  team: string;
  personality: string;
  expertise: string[];
  avatar: string;
  systemPrompt: string;
  permissions: {
    canAssignTasks: boolean;
    canReviewWork: boolean;
    canProvideFeedback: boolean;
    canSimulateClient: boolean;
    canConductReviews: boolean;
    canApproveWork: boolean;
    canCreateEvents: boolean;
    accessibleChannels: string[];
  };
  configuration: {
    responseStyle: string;
    responseLength: string;
    availabilityHours: string;
    timezone: string;
  };
  isActive: boolean;
}

interface ScenarioFormData {
  name: string;
  description: string;
  scenarioType: string;
  triggerConditions: Record<string, string>;
  involvedAgents: string[];
  steps: Array<{
    stepNumber: number;
    agentRole: string;
    action: string;
    expectedStudentAction: string;
    successCriteria: string;
    timeoutMinutes: number;
    nextStepOnSuccess: number | null;
    nextStepOnFailure: number | null;
  }>;
  isActive: boolean;
}

const initialTemplateForm: CompanyTemplateFormData = {
  templateCode: "",
  name: "",
  brandTagline: "",
  sector: "CLOUD_SAAS",
  description: "",
  headquarters: "Virtual Innovation District",
  simulatedEmployeeCount: 450,
  technologies: [],
  difficulty: "PRODUCTION_GRADE",
  defaultDepartments: [],
  defaultProjects: [],
  companyRules: [],
  professionalExpectations: [],
  performanceReviewCriteria: [],
  isPublished: true,
};

const initialSimulationForm: SimulationFormData = {
  template: "",
  simulationCode: "",
  companyName: "",
  academicYear: "",
  semester: 1,
  startDate: "",
  endDate: "",
  status: "ENROLLING",
  settings: {
    allowSelfEnrollment: true,
    requireApplication: true,
    maxParticipants: 50,
    enableAiWorkforce: true,
    enableCrossFunctionalProjects: true,
  },
};

const initialDepartmentForm: DepartmentFormData = {
  name: "",
  description: "",
  openRoles: [],
  workflowConfig: {
    sprintLengthDays: 14,
    standupTime: "09:00",
    retrospectiveEnabled: true,
    codeReviewRequired: true,
    ciCdEnabled: true,
  },
};

const initialRoleForm: RoleFormData = {
  title: "",
  department: "",
  description: "",
  responsibilities: [],
  requiredSkills: [],
  learningObjectives: [],
  expectedDeliverables: [],
  competencyCriteria: [],
  availableProjects: [],
  taskTemplates: [],
};

const initialProjectForm: ProjectFormData = {
  title: "",
  description: "",
  department: "",
  eligibleRoles: [],
  objectives: [],
  scope: "",
  startDate: "",
  endDate: "",
  phases: [],
  expectedDeliverables: [],
  requiredCompetencies: [],
  taskTemplates: [],
  reviewRequirements: [],
  completionCriteria: [],
};

const initialTaskForm: TaskFormData = {
  title: "",
  description: "",
  category: "DEVELOPMENT",
  assignedRole: "",
  priority: "MEDIUM",
  estimatedDuration: "",
  dueDateRules: "",
  dependencies: [],
  instructions: "",
  requiredAttachments: [],
  expectedOutput: "",
  acceptanceCriteria: [],
  competenciesAssessed: [],
};

const initialAgentForm: AgentFormData = {
  name: "",
  role: "VIRTUAL_MANAGER",
  careerPath: "frontend_developer",
  department: "",
  team: "",
  personality: "",
  expertise: [],
  avatar: "",
  systemPrompt: "",
  permissions: {
    canAssignTasks: false,
    canReviewWork: false,
    canProvideFeedback: true,
    canSimulateClient: false,
    canConductReviews: false,
    canApproveWork: false,
    canCreateEvents: false,
    accessibleChannels: [],
  },
  configuration: {
    responseStyle: "TECHNICAL",
    responseLength: "DETAILED",
    availabilityHours: "09:00-17:00",
    timezone: "UTC",
  },
  isActive: true,
};

const initialScenarioForm: ScenarioFormData = {
  name: "",
  description: "",
  scenarioType: "ONBOARDING",
  triggerConditions: {},
  involvedAgents: [],
  steps: [],
  isActive: true,
};

// Mock data for templates and simulations (since admin API endpoints are not yet implemented)
const MOCK_TEMPLATES = [
  {
    _id: "tpl_1",
    templateCode: "NOVATECH",
    name: "NovaTech Cloud Enterprise",
    brandTagline: "Simulated Hyperscale SaaS & Distributed Cloud Platform",
    sector: "CLOUD_SAAS",
    description: "A simulated hyperscale cloud provider offering IaaS, PaaS, and SaaS solutions. Students experience enterprise-grade distributed systems, multi-region deployments, and SLA-driven operations.",
    headquarters: "Virtual Innovation District, Sector 7",
    simulatedEmployeeCount: 450,
    technologies: ["Kubernetes", "TypeScript", "Go", "PostgreSQL", "Redis", "gRPC", "Envoy"],
    difficulty: "PRODUCTION_GRADE",
    defaultDepartments: [
      { name: "Platform Engineering", description: "Core infrastructure and platform services", openRoles: ["Platform Engineer", "SRE", "DevOps Engineer"] },
      { name: "Product Engineering", description: "Customer-facing product development", openRoles: ["Frontend Developer", "Backend Developer", "Full Stack Developer", "UI/UX Designer"] },
      { name: "Data Engineering", description: "Data platform and analytics", openRoles: ["Data Engineer", "ML Engineer", "Analytics Engineer"] },
      { name: "Security Engineering", description: "Platform security and compliance", openRoles: ["Security Engineer", "Compliance Analyst"] },
    ],
    defaultProjects: ["Multi-region Kubernetes Migration", "Serverless Functions Platform", "Real-time Analytics Pipeline", "Zero-Trust Network Architecture"],
    companyRules: [
      { title: "Code Review Required", description: "All PRs require 2 approvals including one from a senior engineer", category: "CODE_QUALITY" },
      { title: "Daily Standups", description: "Mandatory 15-min standups at 09:00 UTC", category: "MEETINGS" },
      { title: "Security First", description: "All code must pass SAST/DAST scans before merge", category: "SECURITY" },
    ],
    professionalExpectations: [
      { expectation: "Write production-ready code with tests", category: "TECHNICAL" },
      { expectation: "Communicate proactively in async channels", category: "COMMUNICATION" },
      { expectation: "Follow GitOps workflow for deployments", category: "PROCESS" },
    ],
    performanceReviewCriteria: [
      { criterion: "Technical Execution", weight: 40, description: "Code quality, architecture decisions, problem solving" },
      { criterion: "Collaboration", weight: 25, description: "Code reviews, mentoring, cross-team communication" },
      { criterion: "Delivery", weight: 25, description: "On-time delivery, scope management, stakeholder communication" },
      { criterion: "Learning & Growth", weight: 10, description: "Skill acquisition, knowledge sharing, innovation" },
    ],
    isPublished: true,
  },
  {
    _id: "tpl_2",
    templateCode: "FINTECH_CORE",
    name: "FinCore Banking Platform",
    brandTagline: "Regulated Financial Services Simulation",
    sector: "FINTECH_ENTERPRISE",
    description: "A simulated core banking platform with ledger services, payment processing, compliance workflows, and regulatory reporting. Students work in a highly regulated environment with audit trails.",
    headquarters: "Virtual Financial District, Tower 42",
    simulatedEmployeeCount: 320,
    technologies: ["Java", "Spring Boot", "Kafka", "PostgreSQL", "Cassandra", "gRPC", "WireMock"],
    difficulty: "PRODUCTION_GRADE",
    defaultDepartments: [
      { name: "Core Banking", description: "Ledger, accounts, transactions", openRoles: ["Backend Developer", "QA Engineer", "Business Analyst"] },
      { name: "Payments", description: "Payment rails, SWIFT, ACH, RTP", openRoles: ["Backend Developer", "Integration Engineer"] },
      { name: "Compliance & Risk", description: "AML, KYC, regulatory reporting", openRoles: ["Compliance Analyst", "Risk Engineer"] },
      { name: "Platform", description: "Infrastructure, observability, CI/CD", openRoles: ["Platform Engineer", "SRE"] },
    ],
    defaultProjects: ["Real-time Payments Engine", "Regulatory Reporting Automation", "Fraud Detection ML Pipeline", "Multi-currency Ledger Migration"],
    companyRules: [
      { title: "Audit Trail Mandatory", description: "All financial operations must be fully auditable", category: "SECURITY" },
      { title: "Change Advisory Board", description: "Production changes require CAB approval", category: "WORKFLOW" },
      { title: "Four-eyes Principle", description: "Critical operations require dual authorization", category: "CODE_QUALITY" },
    ],
    professionalExpectations: [
      { expectation: "Understand regulatory requirements for financial data", category: "TECHNICAL" },
      { expectation: "Document all decisions for audit purposes", category: "PROCESS" },
      { expectation: "Maintain confidentiality of customer data", category: "SECURITY" },
    ],
    performanceReviewCriteria: [
      { criterion: "Regulatory Compliance", weight: 35, description: "Adherence to financial regulations and audit requirements" },
      { criterion: "Technical Execution", weight: 30, description: "Code quality, testing, system reliability" },
      { criterion: "Risk Awareness", weight: 20, description: "Proactive risk identification and mitigation" },
      { criterion: "Communication", weight: 15, description: "Clear documentation, stakeholder updates" },
    ],
    isPublished: true,
  },
];

const MOCK_SIMULATIONS = [
  {
    _id: "sim_1",
    template: { _id: "tpl_1", name: "NovaTech Cloud Enterprise", templateCode: "NOVATECH" },
    simulationCode: "SIM-2026-FALL",
    companyName: "NovaTech Cloud Enterprise Fall 2026",
    academicYear: "2026/27",
    semester: 1,
    startDate: "2026-09-01",
    endDate: "2027-01-15",
    status: "ACTIVE",
    enrolledCount: 42,
    settings: {
      allowSelfEnrollment: true,
      requireApplication: true,
      maxParticipants: 50,
      enableAiWorkforce: true,
      enableCrossFunctionalProjects: true,
    },
  },
  {
    _id: "sim_2",
    template: { _id: "tpl_2", name: "FinCore Banking Platform", templateCode: "FINTECH_CORE" },
    simulationCode: "SIM-2026-SPRING",
    companyName: "FinCore Banking Platform Spring 2026",
    academicYear: "2025/26",
    semester: 2,
    startDate: "2026-02-01",
    endDate: "2026-06-15",
    status: "COMPLETED",
    enrolledCount: 38,
    settings: {
      allowSelfEnrollment: true,
      requireApplication: false,
      maxParticipants: 40,
      enableAiWorkforce: true,
      enableCrossFunctionalProjects: true,
    },
  },
];

export const VirtualWorkplaceAdmin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("templates");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data - using mock data since admin API endpoints are not yet implemented
  const [templates, setTemplates] = useState<any[]>(MOCK_TEMPLATES);
  const [simulations, setSimulations] = useState<any[]>(MOCK_SIMULATIONS);
  const [departments, setDepartments] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);

  // Forms
  const [templateForm, setTemplateForm] = useState<CompanyTemplateFormData>(initialTemplateForm);
  const [simulationForm, setSimulationForm] = useState<SimulationFormData>(initialSimulationForm);
  const [departmentForm, setDepartmentForm] = useState<DepartmentFormData>(initialDepartmentForm);
  const [roleForm, setRoleForm] = useState<RoleFormData>(initialRoleForm);
  const [projectForm, setProjectForm] = useState<ProjectFormData>(initialProjectForm);
  const [taskForm, setTaskForm] = useState<TaskFormData>(initialTaskForm);
  const [agentForm, setAgentForm] = useState<AgentFormData>(initialAgentForm);
  const [scenarioForm, setScenarioForm] = useState<ScenarioFormData>(initialScenarioForm);

  // Modals
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showScenarioModal, setShowScenarioModal] = useState(false);

  // Editing state
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [editingSimulation, setEditingSimulation] = useState<any | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<any | null>(null);
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editingAgent, setEditingAgent] = useState<any | null>(null);
  const [editingScenario, setEditingScenario] = useState<any | null>(null);

  // Pagination
  const [templatePage, setTemplatePage] = useState(1);
  const [simulationPage, setSimulationPage] = useState(1);
  const [departmentPage, setDepartmentPage] = useState(1);
  const [rolePage, setRolePage] = useState(1);
  const [projectPage, setProjectPage] = useState(1);
  const [taskPage, setTaskPage] = useState(1);
  const [agentPage, setAgentPage] = useState(1);
  const [scenarioPage, setScenarioPage] = useState(1);
  const pageSize = 10;

  // Search/Filter
  const [templateSearch, setTemplateSearch] = useState("");
  const [simulationSearch, setSimulationSearch] = useState("");
  const [simulationStatusFilter, setSimulationStatusFilter] = useState("");

  // Handlers - using mock implementations since admin API endpoints are not yet available
  const handleTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (editingTemplate) {
        const updated = templates.map(t => t._id === editingTemplate._id ? { ...t, ...templateForm, _id: t._id } : t);
        setTemplates(updated);
        setSuccessMessage("Template updated successfully (mock - backend endpoint needed)");
      } else {
        const newTemplate = { ...templateForm, _id: `tpl_${Date.now()}`, defaultDepartments: templateForm.defaultDepartments };
        setTemplates([...templates, newTemplate]);
        setSuccessMessage("Template created successfully (mock - backend endpoint needed)");
      }
      setShowTemplateModal(false);
      setTemplateForm(initialTemplateForm);
      setEditingTemplate(null);
    } catch (e: any) {
      setError(e.message || "Failed to save template");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const selectedTemplate = templates.find(t => t._id === simulationForm.template);
      
      if (editingSimulation) {
        const updated = simulations.map(s => s._id === editingSimulation._id ? { 
          ...s, 
          ...simulationForm, 
          _id: s._id,
          template: selectedTemplate 
        } : s);
        setSimulations(updated);
        setSuccessMessage("Simulation updated successfully (mock - backend endpoint needed)");
      } else {
        const newSimulation = { 
          ...simulationForm, 
          _id: `sim_${Date.now()}`,
          template: selectedTemplate,
          enrolledCount: 0,
        };
        setSimulations([...simulations, newSimulation]);
        setSuccessMessage("Simulation created successfully (mock - backend endpoint needed)");
      }
      setShowSimulationModal(false);
      setSimulationForm(initialSimulationForm);
      setEditingSimulation(null);
    } catch (e: any) {
      setError(e.message || "Failed to save simulation");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this template?")) return;
    try {
      setTemplates(templates.filter(t => t._id !== id));
      setSuccessMessage("Template deleted (mock - backend endpoint needed)");
    } catch (e: any) {
      setError(e.message || "Failed to delete template");
    }
  };

  const handleDeleteSimulation = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this simulation?")) return;
    try {
      setSimulations(simulations.filter(s => s._id !== id));
      setSuccessMessage("Simulation deleted (mock - backend endpoint needed)");
    } catch (e: any) {
      setError(e.message || "Failed to delete simulation");
    }
  };

  const openEditTemplate = (template: any) => {
    setEditingTemplate(template);
    setTemplateForm({
      templateCode: template.templateCode,
      name: template.name,
      brandTagline: template.brandTagline || "",
      sector: template.sector,
      description: template.description,
      headquarters: template.headquarters || "Virtual Innovation District",
      simulatedEmployeeCount: template.simulatedEmployeeCount || 450,
      technologies: template.technologies || [],
      difficulty: template.difficulty || "PRODUCTION_GRADE",
      defaultDepartments: template.defaultDepartments || [],
      defaultProjects: template.defaultProjects || [],
      companyRules: template.companyRules || [],
      professionalExpectations: template.professionalExpectations || [],
      performanceReviewCriteria: template.performanceReviewCriteria || [],
      isPublished: template.isPublished !== false,
    });
    setShowTemplateModal(true);
  };

  const openEditSimulation = (simulation: any) => {
    setEditingSimulation(simulation);
    setSimulationForm({
      template: simulation.template?._id || simulation.template,
      simulationCode: simulation.simulationCode,
      companyName: simulation.companyName,
      academicYear: simulation.academicYear,
      semester: simulation.semester,
      startDate: simulation.startDate ? new Date(simulation.startDate).toISOString().split("T")[0] : "",
      endDate: simulation.endDate ? new Date(simulation.endDate).toISOString().split("T")[0] : "",
      status: simulation.status,
      settings: simulation.settings || initialSimulationForm.settings,
    });
    setShowSimulationModal(true);
  };

  const renderTemplatesTab = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Virtual Company Templates</h2>
          <p className="text-xs text-slate-500">Reusable company profiles for simulation creation</p>
        </div>
        <button
          onClick={() => { setEditingTemplate(null); setTemplateForm(initialTemplateForm); setShowTemplateModal(true); }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center space-x-1.5"
        >
          <FontAwesomeIcon icon={faPlus} />
          <span>Create Template</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">
            <tr>
              <th className="py-3 px-4">Code</th>
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Sector</th>
              <th className="py-3 px-4">Difficulty</th>
              <th className="py-3 px-4">Departments</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {templates.map((template) => (
              <tr key={template._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">{template.templateCode}</td>
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">{template.name}</td>
                <td className="py-3.5 px-4">
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md font-mono text-[10px]">
                    {template.sector.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  <StatusBadge status={template.difficulty} />
                </td>
                <td className="py-3.5 px-4 text-slate-500">{template.defaultDepartments?.length || 0}</td>
                <td className="py-3.5 px-4">
                  <StatusBadge status={template.isPublished ? "PUBLISHED" : "DRAFT"} />
                </td>
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end space-x-1.5">
                    <button onClick={() => openEditTemplate(template)} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg" title="Edit">
                      <FontAwesomeIcon icon={faPenToSquare} />
                    </button>
                    <button onClick={() => handleDeleteTemplate(template._id)} className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg" title="Delete">
                      <FontAwesomeIcon icon={faTrashAlt} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">No templates found. Create your first virtual company template.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSimulationsTab = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Virtual Simulations</h2>
          <p className="text-xs text-slate-500">Active and configured simulation instances</p>
        </div>
        <button
          onClick={() => { setEditingSimulation(null); setSimulationForm(initialSimulationForm); setShowSimulationModal(true); }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center space-x-1.5"
        >
          <FontAwesomeIcon icon={faPlus} />
          <span>Create Simulation</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">
            <tr>
              <th className="py-3 px-4">Code</th>
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Academic Year</th>
              <th className="py-3 px-4">Semester</th>
              <th className="py-3 px-4">Dates</th>
              <th className="py-3 px-4">Enrolled</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {simulations.map((sim) => (
              <tr key={sim._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">{sim.simulationCode}</td>
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">{sim.companyName}</td>
                <td className="py-3.5 px-4">{sim.academicYear}</td>
                <td className="py-3.5 px-4">Sem {sim.semester}</td>
                <td className="py-3.5 px-4 text-slate-500">
                  {sim.startDate ? new Date(sim.startDate).toLocaleDateString() : "—"} to {sim.endDate ? new Date(sim.endDate).toLocaleDateString() : "—"}
                </td>
                <td className="py-3.5 px-4">{sim.enrolledCount || 0} / {sim.settings?.maxParticipants || 50}</td>
                <td className="py-3.5 px-4"><StatusBadge status={sim.status} /></td>
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end space-x-1.5">
                    <button onClick={() => openEditSimulation(sim)} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg" title="Edit">
                      <FontAwesomeIcon icon={faPenToSquare} />
                    </button>
                    <button onClick={() => handleDeleteSimulation(sim._id)} className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg" title="Delete">
                      <FontAwesomeIcon icon={faTrashAlt} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {simulations.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">No simulations found. Create a simulation from a template.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Placeholder tabs for other admin sections
  const renderPlaceholderTab = (title: string, description: string, icon: any, color: string) => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex items-center space-x-3">
          <FontAwesomeIcon icon={icon} className={`text-2xl ${color}`} />
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
          <p><strong>Status:</strong> Backend API endpoints exist. Frontend UI implementation in progress.</p>
          <p><strong>Available Operations:</strong> Create, Read, Update, Delete, List with pagination</p>
          <p><strong>Database Models:</strong> Fully defined in VirtualWorkplace.js</p>
        </div>
      </div>
    </div>
  );

  const tabs = [
    { id: "templates", label: "Company Templates", icon: faBuilding, content: renderTemplatesTab() },
    { id: "simulations", label: "Simulations", icon: faPlay, content: renderSimulationsTab() },
    { id: "departments", label: "Departments", icon: faSitemap, content: renderPlaceholderTab("Department Management", "Configure organizational structure and departments", faSitemap, "text-blue-600") },
    { id: "roles", label: "Professional Roles", icon: faUserTie, content: renderPlaceholderTab("Professional Role Configuration", "Define career roles with responsibilities and competencies", faUserTie, "text-purple-600") },
    { id: "teams", label: "Teams", icon: faUsers, content: renderPlaceholderTab("Team Management", "Create and configure simulation teams", faUsers, "text-green-600") },
    { id: "projects", label: "Projects", icon: faDiagramProject, content: renderPlaceholderTab("Project Templates", "Reusable project configurations with phases and deliverables", faDiagramProject, "text-indigo-600") },
    { id: "tasks", label: "Task Templates", icon: faListCheck, content: renderPlaceholderTab("Task & Ticket Templates", "Reusable task configurations with acceptance criteria", faListCheck, "text-amber-600") },
    { id: "agents", label: "AI Workforce", icon: faRobot, content: renderPlaceholderTab("AI Virtual Workforce", "Configure simulated colleagues and agents", faRobot, "text-pink-600") },
    { id: "scenarios", label: "Scenarios", icon: faMagic, content: renderPlaceholderTab("Simulation Scenarios", "Scripted learning scenarios with AI agents", faMagic, "text-violet-600") },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-start space-x-2">
        <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5" />
        <div>
          <p className="font-semibold">Admin API Endpoints Not Yet Implemented</p>
          <p>Company Templates and Simulations use mock data. Backend admin endpoints for CRUD operations on templates, simulations, departments, roles, teams, projects, tasks, agents, and scenarios need to be implemented in the virtualWorkplaceApi service.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          <nav className="flex min-w-max" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-indigo-600 text-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                }`}
              >
                <FontAwesomeIcon icon={tab.icon} className="text-base" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {tabs.find((t) => t.id === activeTab)?.content}
        </div>
      </div>

      {/* Template Modal */}
      <ModalWrapper
        isOpen={showTemplateModal}
        onClose={() => { setShowTemplateModal(false); setEditingTemplate(null); setTemplateForm(initialTemplateForm); }}
        title={editingTemplate ? "Edit Company Template" : "Create Company Template"}
      >
        <form onSubmit={handleTemplateSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Template Code *</label>
              <input
                type="text"
                value={templateForm.templateCode}
                onChange={(e) => setTemplateForm({ ...templateForm, templateCode: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                placeholder="e.g., NOVATECH"
                required
                disabled={!!editingTemplate}
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Name *</label>
              <input
                type="text"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                placeholder="e.g., NovaTech Cloud Enterprise"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Sector *</label>
              <select
                value={templateForm.sector}
                onChange={(e) => setTemplateForm({ ...templateForm, sector: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                required
              >
                {SECTORS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Difficulty *</label>
              <select
                value={templateForm.difficulty}
                onChange={(e) => setTemplateForm({ ...templateForm, difficulty: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                required
              >
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Brand Tagline</label>
            <input
              type="text"
              value={templateForm.brandTagline}
              onChange={(e) => setTemplateForm({ ...templateForm, brandTagline: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              placeholder="e.g., Simulated Hyperscale SaaS & Distributed Cloud Platform"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Description *</label>
            <textarea
              value={templateForm.description}
              onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Headquarters</label>
              <input
                type="text"
                value={templateForm.headquarters}
                onChange={(e) => setTemplateForm({ ...templateForm, headquarters: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Simulated Employee Count</label>
              <input
                type="number"
                value={templateForm.simulatedEmployeeCount}
                onChange={(e) => setTemplateForm({ ...templateForm, simulatedEmployeeCount: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Published</label>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={templateForm.isPublished}
                  onChange={(e) => setTemplateForm({ ...templateForm, isPublished: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Is Published</span>
              </div>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Technologies (comma-separated)</label>
            <input
              type="text"
              value={templateForm.technologies.join(", ")}
              onChange={(e) => setTemplateForm({ ...templateForm, technologies: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              placeholder="React, TypeScript, Node.js, PostgreSQL, Docker, Kubernetes"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => { setShowTemplateModal(false); setEditingTemplate(null); setTemplateForm(initialTemplateForm); }} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-xs disabled:opacity-50">
              {loading ? <span className="flex items-center space-x-1.5"><FontAwesomeIcon icon={faSpinner} className="animate-spin" /><span>Saving...</span></span> : (editingTemplate ? "Update Template" : "Create Template")}
            </button>
          </div>
        </form>
      </ModalWrapper>

      {/* Simulation Modal */}
      <ModalWrapper
        isOpen={showSimulationModal}
        onClose={() => { setShowSimulationModal(false); setEditingSimulation(null); setSimulationForm(initialSimulationForm); }}
        title={editingSimulation ? "Edit Simulation" : "Create Simulation"}
      >
        <form onSubmit={handleSimulationSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Company Template *</label>
            <select
              value={simulationForm.template}
              onChange={(e) => setSimulationForm({ ...simulationForm, template: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              required
            >
              <option value="">Select a template...</option>
              {templates.map((t) => <option key={t._id} value={t._id}>{t.name} ({t.templateCode})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Simulation Code *</label>
              <input
                type="text"
                value={simulationForm.simulationCode}
                onChange={(e) => setSimulationForm({ ...simulationForm, simulationCode: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                placeholder="e.g., SIM-2026-FALL"
                required
                disabled={!!editingSimulation}
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Company Name *</label>
              <input
                type="text"
                value={simulationForm.companyName}
                onChange={(e) => setSimulationForm({ ...simulationForm, companyName: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                placeholder="e.g., NovaTech Cloud Enterprise Fall 2026"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Academic Year *</label>
              <input
                type="text"
                value={simulationForm.academicYear}
                onChange={(e) => setSimulationForm({ ...simulationForm, academicYear: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                placeholder="2026/27"
                required
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Semester *</label>
              <input
                type="number"
                value={simulationForm.semester}
                onChange={(e) => setSimulationForm({ ...simulationForm, semester: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                min={1}
                max={12}
                required
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Status</label>
              <select
                value={simulationForm.status}
                onChange={(e) => setSimulationForm({ ...simulationForm, status: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {SIMULATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Start Date *</label>
              <input
                type="date"
                value={simulationForm.startDate}
                onChange={(e) => setSimulationForm({ ...simulationForm, startDate: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">End Date *</label>
              <input
                type="date"
                value={simulationForm.endDate}
                onChange={(e) => setSimulationForm({ ...simulationForm, endDate: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                required
              />
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <h4 className="font-semibold text-slate-900 dark:text-white">Simulation Settings</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center space-x-2 text-sm">
                <input type="checkbox" checked={simulationForm.settings.allowSelfEnrollment} onChange={(e) => setSimulationForm({ ...simulationForm, settings: { ...simulationForm.settings, allowSelfEnrollment: e.target.checked } })} className="w-4 h-4 text-indigo-600 border-slate-300 rounded" />
                <span className="text-slate-700 dark:text-slate-300">Allow Self-Enrollment</span>
              </label>
              <label className="flex items-center space-x-2 text-sm">
                <input type="checkbox" checked={simulationForm.settings.requireApplication} onChange={(e) => setSimulationForm({ ...simulationForm, settings: { ...simulationForm.settings, requireApplication: e.target.checked } })} className="w-4 h-4 text-indigo-600 border-slate-300 rounded" />
                <span className="text-slate-700 dark:text-slate-300">Require Application</span>
              </label>
              <label className="flex items-center space-x-2 text-sm">
                <input type="checkbox" checked={simulationForm.settings.enableAiWorkforce} onChange={(e) => setSimulationForm({ ...simulationForm, settings: { ...simulationForm.settings, enableAiWorkforce: e.target.checked } })} className="w-4 h-4 text-indigo-600 border-slate-300 rounded" />
                <span className="text-slate-700 dark:text-slate-300">Enable AI Workforce</span>
              </label>
              <label className="flex items-center space-x-2 text-sm">
                <input type="checkbox" checked={simulationForm.settings.enableCrossFunctionalProjects} onChange={(e) => setSimulationForm({ ...simulationForm, settings: { ...simulationForm.settings, enableCrossFunctionalProjects: e.target.checked } })} className="w-4 h-4 text-indigo-600 border-slate-300 rounded" />
                <span className="text-slate-700 dark:text-slate-300">Cross-Functional Projects</span>
              </label>
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Max Participants</label>
              <input
                type="number"
                value={simulationForm.settings.maxParticipants}
                onChange={(e) => setSimulationForm({ ...simulationForm, settings: { ...simulationForm.settings, maxParticipants: Number(e.target.value) } })}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => { setShowSimulationModal(false); setEditingSimulation(null); setSimulationForm(initialSimulationForm); }} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-xs disabled:opacity-50">
              {loading ? <span className="flex items-center space-x-1.5"><FontAwesomeIcon icon={faSpinner} className="animate-spin" /><span>Saving...</span></span> : (editingSimulation ? "Update Simulation" : "Create Simulation")}
            </button>
          </div>
        </form>
      </ModalWrapper>
    </div>
  );
};

export default VirtualWorkplaceAdmin;