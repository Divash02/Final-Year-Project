import {
  VirtualCompanyTemplate,
  VirtualDepartment,
  VirtualSimulation,
  SimulationApplication,
  SimulationMembership,
  SimulationTeam,
  SimulationProject,
  SimulationTask,
  SimulationSubmission,
  SimulationReview,
  SimulationEvent,
  SimulationMeeting,
  SimulationMessage,
  SimulationAssessment,
  VirtualCompany,
  VirtualAgent,
  SimulationScenario,
  SpecialistWorkspaceConfig,
  CrossFunctionalProject,
  ProjectTeamMembership,
  CAREER_PATHS,
  CareerRole,
} from "../../models/index.js";
import { getStudentByUserId, logAudit } from "../../db.js";
import {
  badRequest,
  notFound,
  forbidden,
  conflict,
} from "../../utils/apiError.js";
import { createAndEmitNotification } from "../notificationService.js";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function isCoordinator(user) {
  const roles = user.roles || [];
  return roles.some((r) =>
    ["registrar", "dean", "hod", "program_coordinator", "super_admin", "campus_admin"].includes(r),
  );
}

function isFaculty(user) {
  const roles = user.roles || [];
  return roles.includes("faculty");
}

async function resolveStudentForUser(user) {
  const roles = user.roles || [];
  if (!roles.includes("student")) return null;
  return getStudentByUserId(user._id || user.id);
}

/* ------------------------------------------------------------------ */
/* Virtual Company Engine - Company Generation                        */
/* ------------------------------------------------------------------ */

const COMPANY_NAME_PREFIXES = [
  "TechNova", "NexaSoft", "CloudBridge", "PixelCraft", "DataSphere",
  "NetworkCore", "AgileWorks", "InnovateAI", "QuantumLeap", "CyberShield",
  "DevHorizon", "CodeForge", "SysArch", "NetPulse", "DataFlow",
  "AppCraft", "CloudNine", "BitWise", "LogicLayer", "StackFlow",
];

const COMPANY_NAME_SUFFIXES = [
  "Technologies", "Solutions", "Systems", "Digital", "Labs",
  "Innovations", "Engineering", "Platforms", "Networks", "Analytics",
  "Dynamics", "Ventures", "Collective", "Studios", "Works",
];

const COMPANY_SECTORS = [
  "CLOUD_SAAS",
  "FINTECH_ENTERPRISE",
  "HEALTH_TECH",
  "ECOMMERCE_SCALEUP",
  "CYBER_SECURITY",
  "AI_ML_PLATFORM",
  "IOT_INDUSTRIAL",
  "EDTECH",
  "GAMING",
  "BLOCKCHAIN_WEB3",
  "AUTOMOTIVE_TECH",
  "TELECOM",
];

const SECTOR_TECHNOLOGIES = {
  CLOUD_SAAS: ["React", "Node.js", "TypeScript", "Kubernetes", "Docker", "PostgreSQL", "Redis", "GraphQL", "AWS", "GCP"],
  FINTECH_ENTERPRISE: ["Java", "Spring Boot", "Kafka", "PostgreSQL", "Redis", "Docker", "Kubernetes", "Python", "Go"],
  HEALTH_TECH: ["Python", "FastAPI", "React", "PostgreSQL", "FHIR", "DICOM", "Docker", "Kubernetes", "TensorFlow"],
  ECOMMERCE_SCALEUP: ["React", "Next.js", "Node.js", "MongoDB", "Redis", "Elasticsearch", "Kafka", "Docker", "AWS"],
  CYBER_SECURITY: ["Go", "Rust", "Python", "C++", "Linux", "Docker", "Kubernetes", "eBPF", "Wireshark"],
  AI_ML_PLATFORM: ["Python", "PyTorch", "TensorFlow", "FastAPI", "Docker", "Kubernetes", "MLflow", "Ray", "Jupyter"],
  IOT_INDUSTRIAL: ["C", "C++", "Rust", "Go", "Python", "MQTT", "InfluxDB", "TimescaleDB", "Kubernetes", "eBPF"],
  EDTECH: ["React", "TypeScript", "Node.js", "PostgreSQL", "Redis", "Docker", "WebRTC", "Canvas API"],
  GAMING: ["C++", "C#", "Unity", "Unreal Engine", "Python", "Docker", "Kubernetes", "WebSockets"],
  BLOCKCHAIN_WEB3: ["Solidity", "Rust", "Go", "TypeScript", "React", "Hardhat", "Foundry", "IPFS", "Docker"],
  AUTOMOTIVE_TECH: ["C++", "Rust", "Python", "ROS", "Docker", "Kubernetes", "Linux", "eBPF"],
  TELECOM: ["Go", "Java", "Python", "C++", "Kafka", "gRPC", "Protobuf", "Docker", "Kubernetes", "eBPF"],
};

const ROLE_DEPARTMENT_MAPPING = {
  frontend_developer: ["Frontend Platform", "Design Systems", "Web Applications", "Mobile Web"],
  backend_developer: ["Backend Services", "API Platform", "Microservices", "Data Engineering"],
  fullstack_developer: ["Full Stack Engineering", "Product Engineering", "Feature Teams"],
  uiux_designer: ["Product Design", "Design Systems", "User Research", "Design Operations"],
  database_engineer: ["Data Platform", "Database Engineering", "Data Infrastructure", "Analytics Engineering"],
  network_engineer: ["Network Engineering", "Infrastructure", "Site Reliability", "Platform Engineering"],
  qa_engineer: ["Quality Engineering", "Test Automation", "Quality Assurance", "Release Engineering"],
  devops_engineer: ["DevOps", "Platform Engineering", "Site Reliability", "Infrastructure"],
  cloud_engineer: ["Cloud Engineering", "Platform Engineering", "Infrastructure", "Site Reliability"],
  ai_ml_engineer: ["Machine Learning", "AI Platform", "Data Science", "ML Operations"],
  data_engineer: ["Data Engineering", "Data Platform", "Analytics Engineering", "Data Infrastructure"],
  project_manager: ["Engineering Management", "Program Management", "Delivery Management", "Technical Program Management"],
  business_analyst: ["Business Analysis", "Product Operations", "Requirements Engineering", "Process Improvement"],
  product_manager: ["Product Management", "Product Strategy", "Growth Product", "Platform Product"],
  technical_writer: ["Technical Writing", "Developer Documentation", "Content Strategy", "Documentation Engineering"],
  systems_analyst: ["Systems Analysis", "Enterprise Architecture", "Solution Architecture", "Technical Architecture"],
  it_support_engineer: ["IT Support", "Service Desk", "Endpoint Management", "Identity & Access"],
  security_engineer: ["Security Engineering", "Application Security", "Infrastructure Security", "Security Operations"],
  mobile_developer: ["Mobile Engineering", "iOS Engineering", "Android Engineering", "Cross-Platform"],
  embedded_engineer: ["Embedded Systems", "Firmware Engineering", "IoT Engineering", "Real-Time Systems"],
};

function generateCompanyName() {
  const prefix = COMPANY_NAME_PREFIXES[Math.floor(Math.random() * COMPANY_NAME_PREFIXES.length)];
  const suffix = COMPANY_NAME_SUFFIXES[Math.floor(Math.random() * COMPANY_NAME_SUFFIXES.length)];
  return `${prefix} ${suffix}`;
}

function getSectorTechnologies(sector) {
  return SECTOR_TECHNOLOGIES[sector] || SECTOR_TECHNOLOGIES.CLOUD_SAAS;
}

function getDefaultDepartmentsForSector(sector) {
  const sectorDepartments = {
    CLOUD_SAAS: [
      { name: "Frontend Platform", description: "Core UI component library, microfrontends, and web accessibility standards.", roles: ["frontend_developer", "uiux_designer"] },
      { name: "Backend Services", description: "API development, microservices, and distributed systems.", roles: ["backend_developer", "fullstack_developer", "devops_engineer"] },
      { name: "Product Engineering", description: "Feature development and product delivery.", roles: ["fullstack_developer", "project_manager", "product_manager"] },
      { name: "Quality Engineering", description: "Automated testing, quality assurance, and release engineering.", roles: ["qa_engineer", "devops_engineer"] },
      { name: "Platform & Infrastructure", description: "Cloud infrastructure, Kubernetes, and developer tooling.", roles: ["devops_engineer", "cloud_engineer", "site_reliability_engineer"] },
    ],
    FINTECH_ENTERPRISE: [
      { name: "Core Banking", description: "Transaction processing, ledger systems, and payment rails.", roles: ["backend_developer", "database_engineer", "security_engineer"] },
      { name: "Digital Channels", description: "Customer-facing portals, mobile apps, and web interfaces.", roles: ["frontend_developer", "mobile_developer", "uiux_designer"] },
      { name: "Risk & Compliance", description: "Fraud detection, regulatory compliance, and audit systems.", roles: ["security_engineer", "data_engineer", "business_analyst"] },
      { name: "Platform Engineering", description: "High-availability infrastructure and deployment pipelines.", roles: ["devops_engineer", "cloud_engineer", "network_engineer"] },
    ],
    AI_ML_PLATFORM: [
      { name: "ML Research", description: "Model development, experimentation, and research.", roles: ["ai_ml_engineer", "data_engineer", "data_scientist"] },
      { name: "ML Platform", description: "Model serving, MLOps, and feature stores.", roles: ["devops_engineer", "backend_developer", "cloud_engineer"] },
      { name: "AI Products", description: "AI-powered applications and user-facing features.", roles: ["fullstack_developer", "frontend_developer", "product_manager", "uiux_designer"] },
      { name: "Data Engineering", description: "Data pipelines, feature engineering, and data quality.", roles: ["data_engineer", "backend_developer", "database_engineer"] },
    ],
  };

  return sectorDepartments[sector] || sectorDepartments.CLOUD_SAAS;
}

export async function generateVirtualCompanyTemplate(data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only coordinators can generate company templates.");
  }

  const sector = data.sector || COMPANY_SECTORS[Math.floor(Math.random() * COMPANY_SECTORS.length)];
  const name = data.name || generateCompanyName();
  const templateCode = data.templateCode || name.replace(/\s+/g, "").toUpperCase().substring(0, 8) + Date.now().toString(36).toUpperCase();

  const existing = await VirtualCompanyTemplate.findOne({ templateCode });
  if (existing) {
    throw conflict("A template with this code already exists.", { code: "DUPLICATE_TEMPLATE_CODE" });
  }

  const departments = getDefaultDepartmentsForSector(sector);
  const technologies = getSectorTechnologies(sector);

  const template = await VirtualCompanyTemplate.create({
    templateCode,
    name,
    brandTagline: data.brandTagline || `Simulated ${sector.replace(/_/g, " ")} Enterprise`,
    sector,
    description: data.description || `A simulated ${sector.replace(/_/g, " ").toLowerCase()} organization building enterprise-grade software solutions.`,
    headquarters: "Virtual Innovation District",
    simulatedEmployeeCount: data.simulatedEmployeeCount || Math.floor(Math.random() * 500) + 200,
    technologies,
    difficulty: data.difficulty || "PRODUCTION_GRADE",
    defaultDepartments: departments.map((d) => ({
      name: d.name,
      description: d.description,
      openRoles: d.roles,
    })),
    defaultProjects: data.defaultProjects || [
      "Core Platform Modernization",
      "Customer Portal Redesign",
      "API Gateway Implementation",
      "Data Analytics Dashboard",
      "Security Hardening Initiative",
    ],
    companyRules: [
      { title: "Code Review Required", description: "All code changes must pass peer review before merging.", category: "CODE_QUALITY" },
      { title: "Daily Standups", description: "Teams conduct 15-minute standup meetings each morning.", category: "MEETINGS" },
      { title: "Security First", description: "Security considerations must be addressed in every design decision.", category: "SECURITY" },
      { title: "Documentation Standards", description: "All APIs and architectural decisions must be documented.", category: "WORKFLOW" },
    ],
    professionalExpectations: [
      { expectation: "Write clean, maintainable, and well-tested code", category: "TECHNICAL" },
      { expectation: "Communicate proactively about blockers and progress", category: "COMMUNICATION" },
      { expectation: "Follow agile ceremonies and sprint commitments", category: "PROCESS" },
      { expectation: "Collaborate effectively across functions and teams", category: "COLLABORATION" },
      { expectation: "Continuously learn and share knowledge with the team", category: "LEARNING" },
    ],
    performanceReviewCriteria: [
      { criterion: "Technical Excellence", weight: 30, description: "Code quality, architecture, and problem-solving" },
      { criterion: "Delivery & Execution", weight: 25, description: "Meeting commitments and delivering value" },
      { criterion: "Collaboration & Communication", weight: 20, description: "Teamwork, code reviews, and knowledge sharing" },
      { criterion: "Innovation & Learning", weight: 15, description: "Adopting new technologies and improving processes" },
      { criterion: "Ownership & Accountability", weight: 10, description: "Taking responsibility for outcomes" },
    ],
    isPublished: true,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.company.template.generate",
    module: "internship",
    resource: "VirtualCompanyTemplate",
    resourceId: String(template._id),
    details: `Generated company template "${template.name}" for sector ${sector}`,
    metadata: { templateId: String(template._id), templateCode: template.templateCode, sector },
  });

  return { id: String(template._id), ...template.toObject() };
}

export async function createVirtualCompanyFromTemplate(templateId, simulationId, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only coordinators can create virtual companies.");
  }

  const template = await VirtualCompanyTemplate.findById(templateId).lean();
  if (!template) {
    throw notFound("Company template not found.");
  }

  const simulation = await VirtualSimulation.findById(simulationId).lean();
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  const company = await VirtualCompany.create({
    template: templateId,
    simulation: simulationId,
    name: simulation.companyName,
    logo: template.logo,
    brandTagline: template.brandTagline,
    industry: template.sector.replace(/_/g, " "),
    companyOverview: template.description,
    businessModel: `B2B ${template.sector.replace(/_/g, " ")} SaaS Platform`,
    headquarters: template.headquarters,
    simulatedEmployeeCount: template.simulatedEmployeeCount,
    technologies: template.technologies,
    departments: [],
    virtualManagers: [],
    virtualColleagues: [],
    teams: [],
    projects: [],
    announcements: [],
    communicationChannels: [
      { name: "general", description: "Company-wide announcements and discussions", type: "PUBLIC" },
      { name: "random", description: "Casual conversations and watercooler chat", type: "PUBLIC" },
      { name: "announcements", description: "Official company announcements", type: "ANNOUNCEMENT" },
    ],
    companyRules: template.companyRules,
    professionalExpectations: template.professionalExpectations,
    performanceReviewCriteria: template.performanceReviewCriteria,
    lifecycleStatus: "PUBLISHED",
  });

  // Create departments from template
  const departments = [];
  for (const deptTemplate of template.defaultDepartments) {
    const dept = await VirtualDepartment.create({
      companyTemplate: templateId,
      simulation: simulationId,
      name: deptTemplate.name,
      description: deptTemplate.description,
      openRoles: deptTemplate.openRoles,
      workflowConfig: {
        sprintLengthDays: 14,
        standupTime: "09:00",
        retrospectiveEnabled: true,
        codeReviewRequired: true,
        ciCdEnabled: true,
      },
    });
    departments.push(dept._id);
  }

  company.departments = departments;
  await company.save();

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.company.create",
    module: "internship",
    resource: "VirtualCompany",
    resourceId: String(company._id),
    details: `Created virtual company "${company.name}" from template ${template.templateCode}`,
    metadata: { companyId: String(company._id), templateId: String(templateId), simulationId: String(simulationId) },
  });

  return { id: String(company._id), ...company.toObject() };
}

export async function listVirtualCompanies(filter = {}, { page = 1, limit = 20 }) {
  const query = {};
  if (filter.lifecycleStatus) query.lifecycleStatus = filter.lifecycleStatus;
  if (filter.simulation) query.simulation = filter.simulation;

  const p = Math.max(1, Number(page));
  const l = Math.min(100, Math.max(1, Number(limit)));
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    VirtualCompany.find(query)
      .populate("template", "name sector templateCode")
      .populate("simulation", "simulationCode companyName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    VirtualCompany.countDocuments(query),
  ]);

  return {
    items: items.map((c) => ({ id: String(c._id), ...c })),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
  };
}

export async function getVirtualCompany(companyId) {
  const company = await VirtualCompany.findById(companyId)
    .populate("template", "name sector templateCode defaultDepartments defaultProjects")
    .populate("simulation", "simulationCode companyName status")
    .populate("departments")
    .populate("teams")
    .populate("projects")
    .lean();

  if (!company) {
    throw notFound("Virtual company not found.");
  }

  return { id: String(company._id), ...company };
}

/* ------------------------------------------------------------------ */
/* Specialist Workspace Configurations                                */
/* ------------------------------------------------------------------ */

export async function createSpecialistWorkspaceConfig(data, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only coordinators can create workspace configurations.");
  }

  const existing = await SpecialistWorkspaceConfig.findOne({ careerPath: data.careerPath });
  if (existing) {
    throw conflict("Workspace configuration for this career path already exists.", {
      code: "DUPLICATE_WORKSPACE_CONFIG",
    });
  }

  const config = await SpecialistWorkspaceConfig.create({
    careerPath: data.careerPath,
    workspaceName: data.workspaceName,
    description: data.description,
    supportedTools: data.supportedTools || [],
    defaultLayout: data.defaultLayout || "HYBRID",
    sampleProjects: data.sampleProjects || [],
    skillCategories: data.skillCategories || [],
    assessmentRubric: data.assessmentRubric || [],
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "specialist.workspace.config.create",
    module: "internship",
    resource: "SpecialistWorkspaceConfig",
    resourceId: String(config._id),
    details: `Created workspace config for ${data.careerPath}`,
    metadata: { configId: String(config._id), careerPath: data.careerPath },
  });

  return { id: String(config._id), ...config.toObject() };
}

export async function updateSpecialistWorkspaceConfig(careerPath, updates, { requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only coordinators can update workspace configurations.");
  }

  const config = await SpecialistWorkspaceConfig.findOne({ careerPath });
  if (!config) {
    throw notFound("Workspace configuration not found.");
  }

  const allowedFields = [
    "workspaceName",
    "description",
    "supportedTools",
    "defaultLayout",
    "sampleProjects",
    "skillCategories",
    "assessmentRubric",
  ];

  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(config._id), ...config.toObject() };
  }

  Object.assign(config, changes);
  await config.save();

  return { id: String(config._id), ...config.toObject() };
}

export async function listSpecialistWorkspaceConfigs(filter = {}) {
  const query = {};
  if (filter.careerPath) query.careerPath = filter.careerPath;

  const configs = await SpecialistWorkspaceConfig.find(query).sort({ careerPath: 1 }).lean();
  return configs.map((c) => ({ id: String(c._id), ...c }));
}

export async function getSpecialistWorkspaceConfig(careerPath) {
  const config = await SpecialistWorkspaceConfig.findOne({ careerPath }).lean();
  if (!config) {
    throw notFound("Workspace configuration not found.");
  }
  return { id: String(config._id), ...config };
}

/* ------------------------------------------------------------------ */
/* Default Specialist Workspace Configurations (Seed Data)            */
/* ------------------------------------------------------------------ */

export async function seedDefaultWorkspaceConfigs({ requestingUser }) {
  if (!isCoordinator(requestingUser)) {
    throw forbidden("Only coordinators can seed workspace configurations.");
  }

  const defaultConfigs = [
    {
      careerPath: "frontend_developer",
      workspaceName: "Frontend Development Workbench",
      description: "Professional frontend development environment with React, TypeScript, and modern tooling.",
      defaultLayout: "IDE_FOCUSED",
      supportedTools: [
        { toolName: "VS Code / Monaco Editor", toolType: "CODE_EDITOR", isRequired: true },
        { toolName: "Git & GitHub", toolType: "VERSION_CONTROL", isRequired: true },
        { toolName: "Chrome DevTools", toolType: "DEBUGGER", isRequired: true },
        { toolName: "Storybook", toolType: "DOCUMENTATION", isRequired: false },
        { toolName: "Vitest / Jest", toolType: "TEST_RUNNER", isRequired: true },
        { toolName: "Playwright / Cypress", toolType: "TEST_RUNNER", isRequired: false },
        { toolName: "Figma Integration", toolType: "DESIGN_CANVAS", isRequired: false },
        { toolName: "CI/CD Pipeline", toolType: "CI_CD_PIPELINE", isRequired: true },
        { toolName: "Bundle Analyzer", toolType: "MONITORING", isRequired: false },
      ],
      skillCategories: [
        { category: "Core Frontend", skills: ["React", "TypeScript", "HTML/CSS", "State Management", "Component Architecture"] },
        { category: "Testing", skills: ["Unit Testing", "Integration Testing", "E2E Testing", "Visual Regression"] },
        { category: "Performance", skills: ["Bundle Optimization", "Lazy Loading", "Caching Strategies", "Core Web Vitals"] },
        { category: "Accessibility", skills: ["WCAG 2.1", "ARIA", "Screen Readers", "Keyboard Navigation"] },
        { category: "Tooling", skills: ["Build Tools", "Linting", "Type Checking", "CI/CD"] },
      ],
      sampleProjects: [
        { name: "Design System Component Library", description: "Build accessible, reusable UI components with Storybook documentation.", difficulty: "INTERMEDIATE" },
        { name: "Real-time Dashboard", description: "Create a performant dashboard with WebSocket data streaming and virtualized lists.", difficulty: "ADVANCED" },
        { name: "Multi-tenant SaaS Frontend", description: "Implement theming, feature flags, and tenant isolation in a React application.", difficulty: "ADVANCED" },
      ],
      assessmentRubric: [
        { criterion: "Code Quality & Architecture", weight: 30, levels: [
          { level: "BEGINNER", description: "Basic components, minimal structure" },
          { level: "DEVELOPING", description: "Functional components with some organization" },
          { level: "COMPETENT", description: "Well-structured, reusable components with proper patterns" },
          { level: "ADVANCED", description: "Advanced patterns, performance optimization, design system thinking" },
          { level: "EXPERT", description: "Architectural leadership, framework contributions, innovation" },
        ]},
        { criterion: "Testing & Quality", weight: 25, levels: [
          { level: "BEGINNER", description: "No tests or minimal testing" },
          { level: "DEVELOPING", description: "Basic unit tests for happy paths" },
          { level: "COMPETENT", description: "Comprehensive unit + integration tests" },
          { level: "ADVANCED", description: "E2E tests, visual regression, contract testing" },
          { level: "EXPERT", description: "Test infrastructure, flakiness elimination, quality culture" },
        ]},
      ],
    },
    {
      careerPath: "backend_developer",
      workspaceName: "Backend Engineering Workbench",
      description: "Professional backend development with API design, databases, and distributed systems.",
      defaultLayout: "IDE_FOCUSED",
      supportedTools: [
        { toolName: "VS Code / Monaco Editor", toolType: "CODE_EDITOR", isRequired: true },
        { toolName: "Git & GitHub", toolType: "VERSION_CONTROL", isRequired: true },
        { toolName: "Postman / Insomnia", toolType: "API_TESTER", isRequired: true },
        { toolName: "Docker", toolType: "TERMINAL", isRequired: true },
        { toolName: "Database Explorer", toolType: "DATABASE_EXPLORER", isRequired: true },
        { toolName: "Redis CLI", toolType: "TERMINAL", isRequired: false },
        { toolName: "Load Testing (k6)", toolType: "TEST_RUNNER", isRequired: false },
        { toolName: "CI/CD Pipeline", toolType: "CI_CD_PIPELINE", isRequired: true },
        { toolName: "OpenAPI/Swagger", toolType: "DOCUMENTATION", isRequired: true },
      ],
      skillCategories: [
        { category: "API Design", skills: ["REST", "GraphQL", "gRPC", "API Versioning", "OpenAPI Spec"] },
        { category: "Databases", skills: ["PostgreSQL", "MongoDB", "Redis", "Data Modeling", "Query Optimization"] },
        { category: "Architecture", skills: ["Microservices", "Event-Driven", "CQRS", "Domain-Driven Design"] },
        { category: "Reliability", skills: ["Caching", "Rate Limiting", "Circuit Breakers", "Observability"] },
        { category: "Security", skills: ["Authentication", "Authorization", "Encryption", "OWASP"] },
      ],
      sampleProjects: [
        { name: "Multi-tenant API Gateway", description: "Build a gateway with authentication, rate limiting, and tenant isolation.", difficulty: "ADVANCED" },
        { name: "Event-Driven Order Processing", description: "Implement order processing with Kafka, event sourcing, and saga patterns.", difficulty: "ADVANCED" },
        { name: "High-Performance Cache Layer", description: "Design a distributed caching strategy with Redis Cluster.", difficulty: "INTERMEDIATE" },
      ],
    },
    {
      careerPath: "uiux_designer",
      workspaceName: "UI/UX Design Studio",
      description: "Professional design environment for user research, wireframing, prototyping, and design systems.",
      defaultLayout: "DESIGN_FOCUSED",
      supportedTools: [
        { toolName: "Figma", toolType: "DESIGN_CANVAS", isRequired: true },
        { toolName: "FigJam", toolType: "DESIGN_CANVAS", isRequired: false },
        { toolName: "User Research Tools", toolType: "REQUIREMENTS_TOOL", isRequired: false },
        { toolName: "Accessibility Checker", toolType: "TEST_RUNNER", isRequired: true },
        { toolName: "Design Tokens Manager", toolType: "DOCUMENTATION", isRequired: true },
        { toolName: "Prototyping Tools", toolType: "DESIGN_CANVAS", isRequired: true },
        { toolName: "Developer Handoff", toolType: "DOCUMENTATION", isRequired: true },
      ],
      skillCategories: [
        { category: "User Research", skills: ["User Interviews", "Usability Testing", "Surveys", "Analytics Analysis", "Persona Development"] },
        { category: "Interaction Design", skills: ["Wireframing", "Prototyping", "User Flows", "Information Architecture", "Design Systems"] },
        { category: "Visual Design", skills: ["Typography", "Color Theory", "Layout", "Iconography", "Motion Design"] },
        { category: "Accessibility", skills: ["WCAG 2.1", "Inclusive Design", "Color Contrast", "Screen Reader Testing"] },
        { category: "Collaboration", skills: ["Design Reviews", "Developer Handoff", "Design Tokens", "Documentation"] },
      ],
      sampleProjects: [
        { name: "Enterprise SaaS Design System", description: "Create a comprehensive design system with tokens, components, and documentation.", difficulty: "ADVANCED" },
        { name: "Complex Data Visualization Dashboard", description: "Design intuitive visualizations for multi-dimensional data with accessibility.", difficulty: "ADVANCED" },
        { name: "Mobile-First Onboarding Flow", description: "Design and prototype a user onboarding experience for a fintech app.", difficulty: "INTERMEDIATE" },
      ],
    },
    {
      careerPath: "qa_engineer",
      workspaceName: "Quality Engineering Lab",
      description: "Professional QA environment for test automation, performance testing, and quality assurance.",
      defaultLayout: "HYBRID",
      supportedTools: [
        { toolName: "Playwright / Cypress", toolType: "TEST_RUNNER", isRequired: true },
        { toolName: "Postman / REST Assured", toolType: "API_TESTER", isRequired: true },
        { toolName: "k6 / JMeter", toolType: "TEST_RUNNER", isRequired: false },
        { toolName: "Test Management", toolType: "PROJECT_BOARD", isRequired: true },
        { toolName: "Bug Tracking", toolType: "PROJECT_BOARD", isRequired: true },
        { toolName: "CI/CD Integration", toolType: "CI_CD_PIPELINE", isRequired: true },
        { toolName: "Browser DevTools", toolType: "DEBUGGER", isRequired: true },
        { toolName: "Accessibility Testing", toolType: "TEST_RUNNER", isRequired: true },
      ],
      skillCategories: [
        { category: "Test Automation", skills: ["E2E Testing", "API Testing", "Visual Regression", "Contract Testing", "Test Architecture"] },
        { category: "Quality Processes", skills: ["Test Planning", "Risk-Based Testing", "Shift-Left Testing", "Quality Gates", "Release Criteria"] },
        { category: "Performance Testing", skills: ["Load Testing", "Stress Testing", "Spike Testing", "Soak Testing", "Performance Profiling"] },
        { category: "Security Testing", skills: ["SAST", "DAST", "Penetration Testing", "Dependency Scanning", "Secrets Detection"] },
        { category: "Test Infrastructure", skills: ["CI/CD Integration", "Test Environments", "Test Data Management", "Parallel Execution", "Flakiness Management"] },
      ],
      sampleProjects: [
        { name: "Comprehensive E2E Test Suite", description: "Build a maintainable E2E test suite for a multi-tenant SaaS application.", difficulty: "ADVANCED" },
        { name: "API Contract Testing Framework", description: "Implement contract testing between frontend and backend services.", difficulty: "INTERMEDIATE" },
        { name: "Performance Benchmark Suite", description: "Create automated performance benchmarks with regression detection.", difficulty: "ADVANCED" },
      ],
    },
    {
      careerPath: "devops_engineer",
      workspaceName: "DevOps & Platform Engineering Workbench",
      description: "Professional DevOps environment for CI/CD, infrastructure as code, and platform engineering.",
      defaultLayout: "TERMINAL_FOCUSED",
      supportedTools: [
        { toolName: "Terminal / Shell", toolType: "TERMINAL", isRequired: true },
        { toolName: "Git & GitHub", toolType: "VERSION_CONTROL", isRequired: true },
        { toolName: "Docker", toolType: "TERMINAL", isRequired: true },
        { toolName: "Kubernetes (kubectl)", toolType: "TERMINAL", isRequired: true },
        { toolName: "Terraform / Pulumi", toolType: "CODE_EDITOR", isRequired: true },
        { toolName: "CI/CD (GitHub Actions/GitLab CI)", toolType: "CI_CD_PIPELINE", isRequired: true },
        { toolName: "Helm / Kustomize", toolType: "CODE_EDITOR", isRequired: false },
        { toolName: "Monitoring (Prometheus/Grafana)", toolType: "MONITORING", isRequired: true },
        { toolName: "Logging (ELK/Loki)", toolType: "MONITORING", isRequired: false },
        { toolName: "Secrets Management (Vault)", toolType: "TERMINAL", isRequired: false },
      ],
      skillCategories: [
        { category: "CI/CD", skills: ["Pipeline Design", "GitOps", "Deployment Strategies", "Pipeline Optimization", "Security Scanning"] },
        { category: "Infrastructure as Code", skills: ["Terraform", "Kubernetes Manifests", "Helm Charts", "Module Design", "State Management"] },
        { category: "Kubernetes", skills: ["Cluster Management", "Operators", "CRDs", "Networking", "Storage", "Security"] },
        { category: "Observability", skills: ["Metrics", "Logging", "Tracing", "Alerting", "SLO/SLI Definition"] },
        { category: "Platform Engineering", skills: ["Developer Experience", "Self-Service", "Internal Tools", "Golden Paths", "Standards"] },
      ],
      sampleProjects: [
        { name: "GitOps Deployment Pipeline", description: "Implement a complete GitOps pipeline with ArgoCD and progressive delivery.", difficulty: "ADVANCED" },
        { name: "Multi-Cluster Kubernetes Platform", description: "Design a platform for managing multiple Kubernetes clusters.", difficulty: "ADVANCED" },
        { name: "Observability Stack Deployment", description: "Deploy and configure a full observability stack (Prometheus, Grafana, Loki, Tempo).", difficulty: "INTERMEDIATE" },
      ],
    },
    {
      careerPath: "database_engineer",
      workspaceName: "Database Engineering Workbench",
      description: "Professional database environment for schema design, query optimization, and data architecture.",
      defaultLayout: "HYBRID",
      supportedTools: [
        { toolName: "Database Explorer (pgAdmin/Compass)", toolType: "DATABASE_EXPLORER", isRequired: true },
        { toolName: "SQL Editor", toolType: "CODE_EDITOR", isRequired: true },
        { toolName: "ER Diagram Tool", toolType: "DESIGN_CANVAS", isRequired: true },
        { toolName: "Query Profiler (EXPLAIN ANALYZE)", toolType: "DEBUGGER", isRequired: true },
        { toolName: "Migration Tool (Flyway/Liquibase)", toolType: "CI_CD_PIPELINE", isRequired: true },
        { toolName: "Performance Testing", toolType: "TEST_RUNNER", isRequired: false },
        { toolName: "CDC / Replication Tools", toolType: "TERMINAL", isRequired: false },
      ],
      skillCategories: [
        { category: "Schema Design", skills: ["Normalization", "Data Modeling", "ER Diagrams", "Constraints", "Partitioning"] },
        { category: "Query Optimization", skills: ["Indexing", "Execution Plans", "Query Rewriting", "Statistics", "Parameter Sniffing"] },
        { category: "Database Operations", skills: ["Backup/Restore", "Replication", "HA/DR", "Upgrades", "Capacity Planning"] },
        { category: "Data Architecture", skills: ["Polyglot Persistence", "CQRS", "Event Sourcing", "Data Mesh", "Data Lake"] },
        { category: "NoSQL & NewSQL", skills: ["MongoDB", "Cassandra", "Redis", "Elasticsearch", "Time-Series DBs"] },
      ],
      sampleProjects: [
        { name: "Multi-Tenant Schema Design", description: "Design a schema supporting row-level security and tenant isolation.", difficulty: "ADVANCED" },
        { name: "Query Optimization Challenge", description: "Optimize a set of slow queries using indexing, partitioning, and rewriting.", difficulty: "INTERMEDIATE" },
        { name: "CDC Pipeline Implementation", description: "Build a change data capture pipeline for real-time analytics.", difficulty: "ADVANCED" },
      ],
    },
    {
      careerPath: "network_engineer",
      workspaceName: "Network Engineering Simulator",
      description: "Professional network engineering environment for topology design, configuration, and troubleshooting.",
      defaultLayout: "HYBRID",
      supportedTools: [
        { toolName: "Network Topology Designer", toolType: "NETWORK_SIMULATOR", isRequired: true },
        { toolName: "Cisco Packet Tracer / GNS3", toolType: "NETWORK_SIMULATOR", isRequired: true },
        { toolName: "CLI Simulator", toolType: "TERMINAL", isRequired: true },
        { toolName: "IP Calculator / Subnet Planner", toolType: "CODE_EDITOR", isRequired: true },
        { toolName: "Packet Capture (Wireshark)", toolType: "DEBUGGER", isRequired: true },
        { toolName: "Network Monitoring", toolType: "MONITORING", isRequired: true },
        { toolName: "VPN / Firewall Config", toolType: "TERMINAL", isRequired: false },
      ],
      skillCategories: [
        { category: "Network Design", skills: ["Topology Design", "IP Addressing", "Subnetting", "VLAN Design", "Routing Protocols"] },
        { category: "Switching & Routing", skills: ["STP", "VLANs", "OSPF", "BGP", "EVPN/VXLAN", "Segment Routing"] },
        { category: "Network Security", skills: ["Firewalls", "VPN", "Zero Trust", "NAC", "DDoS Mitigation", "IDS/IPS"] },
        { category: "Automation", skills: ["Ansible", "Netmiko", "NAPALM", "Infrastructure as Code", "GitOps for Networking"] },
        { category: "Troubleshooting", skills: ["Packet Analysis", "Log Analysis", "Performance Tuning", "Capacity Planning", "Root Cause Analysis"] },
      ],
      sampleProjects: [
        { name: "Enterprise Network Design", description: "Design a multi-site enterprise network with redundancy and security zones.", difficulty: "ADVANCED" },
        { name: "BGP Configuration Lab", description: "Configure BGP peering, route reflectors, and policy-based routing.", difficulty: "INTERMEDIATE" },
        { name: "Network Automation with Ansible", description: "Automate network configuration deployment and compliance checking.", difficulty: "ADVANCED" },
      ],
    },
    {
      careerPath: "project_manager",
      workspaceName: "Technical Project Management Office",
      description: "Professional project management environment for agile delivery, risk management, and stakeholder communication.",
      defaultLayout: "DASHBOARD_FOCUSED",
      supportedTools: [
        { toolName: "Jira / Linear / Azure Boards", toolType: "PROJECT_BOARD", isRequired: true },
        { toolName: "Confluence / Notion", toolType: "DOCUMENTATION", isRequired: true },
        { toolName: "Gantt Chart / Roadmap Tool", toolType: "DESIGN_CANVAS", isRequired: true },
        { toolName: "Risk Register", toolType: "PROJECT_BOARD", isRequired: true },
        { toolName: "Capacity Planning Tool", toolType: "PROJECT_BOARD", isRequired: true },
        { toolName: "Meeting Notes Template", toolType: "DOCUMENTATION", isRequired: true },
        { toolName: "Retrospective Tool", toolType: "PROJECT_BOARD", isRequired: false },
      ],
      skillCategories: [
        { category: "Agile Delivery", skills: ["Scrum", "Kanban", "SAFe", "Sprint Planning", "Release Management", "Velocity Tracking"] },
        { category: "Risk Management", skills: ["Risk Identification", "Mitigation Planning", "Issue Tracking", "RAID Logs", "Contingency Planning"] },
        { category: "Stakeholder Management", skills: ["Communication Plans", "Status Reporting", "Executive Presentations", "Negotiation", "Conflict Resolution"] },
        { category: "Technical Understanding", skills: ["Architecture Awareness", "Technical Debt", "Code Review Process", "CI/CD Understanding", "Incident Management"] },
        { category: "Team Leadership", skills: ["Servant Leadership", "Coaching", "Psychological Safety", "Team Dynamics", "Performance Management"] },
      ],
      sampleProjects: [
        { name: "Multi-Team Release Coordination", description: "Coordinate a release across 5+ teams with dependencies and risk mitigation.", difficulty: "ADVANCED" },
        { name: "Agile Transformation Initiative", description: "Lead a team through agile adoption with metrics and continuous improvement.", difficulty: "INTERMEDIATE" },
        { name: "Technical Debt Reduction Program", description: "Plan and execute a systematic technical debt reduction initiative.", difficulty: "INTERMEDIATE" },
      ],
    },
  ];

  const results = [];
  for (const configData of defaultConfigs) {
    const existing = await SpecialistWorkspaceConfig.findOne({ careerPath: configData.careerPath });
    if (!existing) {
      const config = await SpecialistWorkspaceConfig.create(configData);
      results.push({ id: String(config._id), ...config.toObject() });
    }
  }

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "specialist.workspace.config.seed",
    module: "internship",
    resource: "SpecialistWorkspaceConfig",
    details: `Seeded ${results.length} default workspace configurations`,
    metadata: { seededCount: results.length },
  });

  return results;
}