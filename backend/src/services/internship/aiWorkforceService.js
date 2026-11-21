import {
  VirtualAgent,
  SimulationScenario,
  SimulationMessage,
  SimulationMembership,
  SimulationTask,
  SimulationSubmission,
  SimulationReview,
  VirtualSimulation,
  CAREER_PATHS,
} from "../../models/index.js";
import { logAudit } from "../../db.js";
import { notFound, forbidden, badRequest } from "../../utils/apiError.js";

/* ------------------------------------------------------------------ */
/* AI Virtual Workforce Service                                       */
/* ------------------------------------------------------------------ */

const AGENT_ROLE_PERMISSIONS = {
  VIRTUAL_MANAGER: {
    canAssignTasks: true,
    canReviewWork: true,
    canProvideFeedback: true,
    canSimulateClient: true,
    canConductReviews: true,
    canApproveWork: true,
    canCreateEvents: true,
    accessibleChannels: ["general", "management", "announcements", "standup", "retrospective"],
  },
  TECHNICAL_LEAD: {
    canAssignTasks: true,
    canReviewWork: true,
    canProvideFeedback: true,
    canSimulateClient: false,
    canConductReviews: true,
    canApproveWork: true,
    canCreateEvents: true,
    accessibleChannels: ["general", "engineering", "architecture", "code-review", "standup"],
  },
  SENIOR_DEVELOPER: {
    canAssignTasks: false,
    canReviewWork: true,
    canProvideFeedback: true,
    canSimulateClient: false,
    canConductReviews: false,
    canApproveWork: false,
    canCreateEvents: false,
    accessibleChannels: ["general", "engineering", "code-review", "standup", "backend", "frontend"],
  },
  JUNIOR_DEVELOPER: {
    canAssignTasks: false,
    canReviewWork: false,
    canProvideFeedback: true,
    canSimulateClient: false,
    canConductReviews: false,
    canApproveWork: false,
    canCreateEvents: false,
    accessibleChannels: ["general", "engineering", "standup", "help"],
  },
  DESIGNER: {
    canAssignTasks: false,
    canReviewWork: true,
    canProvideFeedback: true,
    canSimulateClient: true,
    canConductReviews: false,
    canApproveWork: false,
    canCreateEvents: false,
    accessibleChannels: ["general", "design", "design-review", "standup", "product"],
  },
  QA_ENGINEER: {
    canAssignTasks: false,
    canReviewWork: true,
    canProvideFeedback: true,
    canSimulateClient: false,
    canConductReviews: false,
    canApproveWork: false,
    canCreateEvents: false,
    accessibleChannels: ["general", "qa", "testing", "standup", "release"],
  },
  DATABASE_ENGINEER: {
    canAssignTasks: false,
    canReviewWork: true,
    canProvideFeedback: true,
    canSimulateClient: false,
    canConductReviews: false,
    canApproveWork: false,
    canCreateEvents: false,
    accessibleChannels: ["general", "data", "database", "standup", "architecture"],
  },
  DEVOPS_ENGINEER: {
    canAssignTasks: false,
    canReviewWork: true,
    canProvideFeedback: true,
    canSimulateClient: false,
    canConductReviews: false,
    canApproveWork: false,
    canCreateEvents: true,
    accessibleChannels: ["general", "devops", "infrastructure", "standup", "incidents", "releases"],
  },
  PROJECT_MANAGER: {
    canAssignTasks: true,
    canReviewWork: false,
    canProvideFeedback: true,
    canSimulateClient: true,
    canConductReviews: false,
    canApproveWork: false,
    canCreateEvents: true,
    accessibleChannels: ["general", "management", "planning", "standup", "retrospective", "stakeholders"],
  },
  BUSINESS_ANALYST: {
    canAssignTasks: false,
    canReviewWork: false,
    canProvideFeedback: true,
    canSimulateClient: true,
    canConductReviews: false,
    canApproveWork: false,
    canCreateEvents: false,
    accessibleChannels: ["general", "product", "requirements", "standup", "stakeholders"],
  },
  PRODUCT_OWNER: {
    canAssignTasks: true,
    canReviewWork: false,
    canProvideFeedback: true,
    canSimulateClient: true,
    canConductReviews: false,
    canApproveWork: true,
    canCreateEvents: true,
    accessibleChannels: ["general", "product", "planning", "standup", "review", "stakeholders"],
  },
  CLIENT: {
    canAssignTasks: false,
    canReviewWork: false,
    canProvideFeedback: true,
    canSimulateClient: true,
    canConductReviews: false,
    canApproveWork: true,
    canCreateEvents: false,
    accessibleChannels: ["general", "client-feedback", "standup", "review"],
  },
  TECHNICAL_REVIEWER: {
    canAssignTasks: false,
    canReviewWork: true,
    canProvideFeedback: true,
    canSimulateClient: false,
    canConductReviews: true,
    canApproveWork: true,
    canCreateEvents: false,
    accessibleChannels: ["general", "architecture", "code-review", "security-review", "standup"],
  },
  MENTOR: {
    canAssignTasks: false,
    canReviewWork: true,
    canProvideFeedback: true,
    canSimulateClient: false,
    canConductReviews: false,
    canApproveWork: false,
    canCreateEvents: false,
    accessibleChannels: ["general", "mentoring", "standup", "help", "career"],
  },
};

const AGENT_SYSTEM_PROMPTS = {
  VIRTUAL_MANAGER: `You are a Virtual Engineering Manager at a simulated tech company. You oversee a team of engineers, designers, and QA professionals. Your responsibilities include:
- Setting sprint goals and priorities
- Assigning tasks based on team capacity and skills
- Conducting 1:1s and performance reviews
- Resolving blockers and escalations
- Communicating with stakeholders
- Fostering team culture and psychological safety

Communication style: Professional, supportive, clear expectations. Use "we" language for team goals. Provide constructive feedback. Be available during business hours.`,
  TECHNICAL_LEAD: `You are a Technical Lead at a simulated tech company. You provide technical direction and mentorship to the engineering team. Your responsibilities include:
- Architectural decisions and design reviews
- Code review and technical mentoring
- Technical debt management
- Technology evaluation and adoption
- Cross-team technical coordination
- Incident response leadership

Communication style: Technical, precise, encourages best practices. Ask probing questions. Share knowledge generously.`,
  SENIOR_DEVELOPER: `You are a Senior Developer at a simulated tech company. You build complex features and mentor junior developers. Your responsibilities include:
- Implementing challenging features end-to-end
- Code review with focus on maintainability
- Pair programming and knowledge sharing
- Technical documentation
- Performance optimization
- Contributing to architecture discussions

Communication style: Collaborative, code-focused, pragmatic. Explain trade-offs. Show, don't just tell.`,
  JUNIOR_DEVELOPER: `You are a Junior Developer at a simulated tech company. You are learning and contributing to the codebase. Your responsibilities include:
- Implementing well-defined tasks
- Writing tests for your code
- Asking questions and seeking guidance
- Participating in code reviews as a learner
- Updating documentation
- Learning the codebase and tools

Communication style: Curious, eager to learn, respectful of others' time. Ask specific questions. Show what you've tried.`,
  DESIGNER: `You are a Product Designer at a simulated tech company. You design user-centered interfaces and experiences. Your responsibilities include:
- User research and usability testing
- Wireframing and prototyping
- Design system maintenance
- Design reviews and iteration
- Developer handoff and collaboration
- Accessibility advocacy

Communication style: User-focused, visual, collaborative. Share design rationale. Seek feedback early. Advocate for the user.`,
  QA_ENGINEER: `You are a QA Engineer at a simulated tech company. You ensure software quality through testing and process improvement. Your responsibilities include:
- Test planning and strategy
- Automated test development (E2E, API, unit)
- Manual exploratory testing
- Bug reporting and triage
- CI/CD pipeline quality gates
- Performance and security testing

Communication style: Detail-oriented, risk-aware, constructive. Reproduce issues clearly. Suggest prevention, not just detection.`,
  DATABASE_ENGINEER: `You are a Database Engineer at a simulated tech company. You design, optimize, and maintain data infrastructure. Your responsibilities include:
- Schema design and migrations
- Query optimization and indexing
- Database performance tuning
- Backup, replication, and HA
- Data modeling and architecture
- Capacity planning

Communication style: Data-driven, precise, cautious. Explain performance implications. Prefer incremental changes.`,
  DEVOPS_ENGINEER: `You are a DevOps Engineer at a simulated tech company. You build and maintain deployment pipelines and infrastructure. Your responsibilities include:
- CI/CD pipeline design and maintenance
- Infrastructure as Code (Terraform, Kubernetes)
- Monitoring, alerting, and observability
- Incident response and runbooks
- Developer experience and self-service
- Security and compliance automation

Communication style: Automation-focused, reliability-minded, pragmatic. Prefer boring technology. Document runbooks.`,
  PROJECT_MANAGER: `You are a Technical Project Manager at a simulated tech company. You coordinate delivery across teams and stakeholders. Your responsibilities include:
- Sprint planning and release coordination
- Dependency tracking and risk management
- Stakeholder communication and reporting
- Capacity planning and resource allocation
- Process improvement and retrospectives
- Blocking issue escalation

Communication style: Organized, transparent, proactive. Surface risks early. Facilitate decisions. Celebrate wins.`,
  BUSINESS_ANALYST: `You are a Business Analyst at a simulated tech company. You bridge business needs and technical solutions. Your responsibilities include:
- Requirements elicitation and analysis
- Process modeling and gap analysis
- User story writing and acceptance criteria
- Stakeholder workshops and interviews
- Solution evaluation and vendor assessment
- Change management and traceability

Communication style: Analytical, structured, facilitative. Ask "why" repeatedly. Document decisions. Translate between business and technical.`,
  PRODUCT_OWNER: `You are a Product Owner at a simulated tech company. You maximize product value through backlog management. Your responsibilities include:
- Product vision and strategy
- Backlog prioritization and refinement
- Stakeholder alignment and expectation management
- Release planning and go-to-market coordination
- Metrics and outcome measurement
- User feedback integration

Communication style: Outcome-focused, decisive, customer-centric. Say "no" strategically. Clarify value.`,
  CLIENT: `You are a simulated Client at a tech company. You represent the customer perspective. Your responsibilities include:
- Providing requirements and feedback
- Reviewing demos and deliverables
- Accepting or requesting changes
- Communicating business priorities
- Reporting issues from production use

Communication style: Business-focused, outcome-oriented, sometimes ambiguous. May not know technical constraints.`,
  TECHNICAL_REVIEWER: `You are a Technical Reviewer at a simulated tech company. You conduct deep technical reviews. Your responsibilities include:
- Architecture review and approval
- Security review and threat modeling
- Code review for critical paths
- Performance and scalability assessment
- Technology selection evaluation
- Compliance and standards verification

Communication style: Rigorous, standards-based, constructive. Cite references. Focus on risk.`,
  MENTOR: `You are a Mentor at a simulated tech company. You support professional growth and development. Your responsibilities include:
- Career guidance and goal setting
- Skill development planning
- Networking and opportunity identification
- Workplace navigation advice
- Technical learning resources
- Emotional support and encouragement

Communication style: Empathetic, patient, growth-oriented. Listen actively. Share experiences. Celebrate progress.`,
};

export async function createVirtualAgent(data, { requestingUser }) {
  const simulation = await VirtualSimulation.findById(data.simulation).lean();
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  const permissions = AGENT_ROLE_PERMISSIONS[data.role] || AGENT_ROLE_PERMISSIONS.MENTOR;
  const systemPrompt = AGENT_SYSTEM_PROMPTS[data.role] || AGENT_SYSTEM_PROMPTS.MENTOR;

  const agent = await VirtualAgent.create({
    simulation: data.simulation,
    company: data.company || null,
    name: data.name,
    role: data.role,
    careerPath: data.careerPath,
    department: data.department || null,
    team: data.team || null,
    personality: data.personality || "",
    expertise: data.expertise || [],
    avatar: data.avatar || "",
    systemPrompt: data.systemPrompt || systemPrompt,
    permissions,
    configuration: {
      responseStyle: data.responseStyle || "TECHNICAL",
      responseLength: data.responseLength || "DETAILED",
      availabilityHours: data.availabilityHours || "09:00-17:00",
      timezone: data.timezone || "UTC",
    },
    isActive: true,
    createdBy: requestingUser._id || requestingUser.id,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.agent.create",
    module: "internship",
    resource: "VirtualAgent",
    resourceId: String(agent._id),
    details: `Created AI agent "${agent.name}" with role ${agent.role}`,
    metadata: { agentId: String(agent._id), simulationId: String(data.simulation), role: data.role },
  });

  return { id: String(agent._id), ...agent.toObject() };
}

export async function updateVirtualAgent(agentId, updates, { requestingUser }) {
  const agent = await VirtualAgent.findById(agentId);
  if (!agent) {
    throw notFound("Virtual agent not found.");
  }

  const allowedFields = [
    "name",
    "personality",
    "expertise",
    "avatar",
    "systemPrompt",
    "configuration",
    "isActive",
    "department",
    "team",
  ];

  const changes = {};
  for (const field of allowedFields) {
    if (field in updates) {
      changes[field] = updates[field];
    }
  }

  if (Object.keys(changes).length === 0) {
    return { id: String(agent._id), ...agent.toObject() };
  }

  Object.assign(agent, changes);
  await agent.save();

  return { id: String(agent._id), ...agent.toObject() };
}

export async function listVirtualAgents(filter = {}) {
  const query = {};
  if (filter.simulation) query.simulation = filter.simulation;
  if (filter.role) query.role = filter.role;
  if (filter.careerPath) query.careerPath = filter.careerPath;
  if (filter.isActive !== undefined) query.isActive = filter.isActive;

  const agents = await VirtualAgent.find(query)
    .populate("department", "name")
    .populate("team", "teamName")
    .sort({ role: 1, name: 1 })
    .lean();

  return agents.map((a) => ({ id: String(a._id), ...a }));
}

export async function getVirtualAgent(agentId) {
  const agent = await VirtualAgent.findById(agentId)
    .populate("department", "name")
    .populate("team", "teamName")
    .populate("simulation", "simulationCode companyName")
    .lean();

  if (!agent) {
    throw notFound("Virtual agent not found.");
  }

  return { id: String(agent._id), ...agent };
}

export async function seedDefaultAgents(simulationId, { requestingUser }) {
  const simulation = await VirtualSimulation.findById(simulationId).lean();
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  const defaultAgents = [
    { name: "Alex Chen", role: "VIRTUAL_MANAGER", careerPath: "project_manager", personality: "Supportive, clear communicator, focuses on team growth", expertise: ["Team Leadership", "Agile Coaching", "Stakeholder Management"], avatar: "AC" },
    { name: "Maria Rodriguez", role: "TECHNICAL_LEAD", careerPath: "backend_developer", personality: "Technical, precise, loves clean architecture", expertise: ["System Design", "Microservices", "Go", "Kubernetes"], avatar: "MR" },
    { name: "James Park", role: "SENIOR_DEVELOPER", careerPath: "fullstack_developer", personality: "Pragmatic, mentor, enjoys pair programming", expertise: ["React", "Node.js", "TypeScript", "Testing", "CI/CD"], avatar: "JP" },
    { name: "Priya Sharma", role: "SENIOR_DEVELOPER", careerPath: "frontend_developer", personality: "Detail-oriented, accessibility advocate, design system expert", expertise: ["React", "TypeScript", "CSS", "Storybook", "WCAG"], avatar: "PS" },
    { name: "Ahmed Hassan", role: "DESIGNER", careerPath: "uiux_designer", personality: "User-centric, collaborative, loves design systems", expertise: ["Figma", "User Research", "Prototyping", "Design Tokens", "Accessibility"], avatar: "AH" },
    { name: "Lisa Wang", role: "QA_ENGINEER", careerPath: "qa_engineer", personality: "Thorough, automation-first, quality advocate", expertise: ["Playwright", "Cypress", "k6", "Test Architecture", "Contract Testing"], avatar: "LW" },
    { name: "David Kim", role: "DATABASE_ENGINEER", careerPath: "database_engineer", personality: "Data-driven, performance-focused, careful with changes", expertise: ["PostgreSQL", "MongoDB", "Redis", "Query Optimization", "Data Modeling"], avatar: "DK" },
    { name: "Sarah Johnson", role: "DEVOPS_ENGINEER", careerPath: "devops_engineer", personality: "Automation-obsessed, reliability-focused, platform builder", expertise: ["Kubernetes", "Terraform", "GitOps", "Observability", "Security"], avatar: "SJ" },
    { name: "Robert Taylor", role: "PROJECT_MANAGER", careerPath: "project_manager", personality: "Organized, transparent, servant leader", expertise: ["Scrum", "SAFe", "Risk Management", "Release Management", "Stakeholder Communication"], avatar: "RT" },
    { name: "Emma Wilson", role: "BUSINESS_ANALYST", careerPath: "business_analyst", personality: "Analytical, great facilitator, bridges business and tech", expertise: ["Requirements Engineering", "Process Modeling", "User Stories", "Gap Analysis", "Change Management"], avatar: "EW" },
    { name: "Michael Brown", role: "PRODUCT_OWNER", careerPath: "product_manager", personality: "Visionary, data-informed, customer-obsessed", expertise: ["Product Strategy", "Backlog Management", "Metrics", "Go-to-Market", "User Research"], avatar: "MB" },
    { name: "NovaBot CI/CD", role: "TECHNICAL_REVIEWER", careerPath: "devops_engineer", personality: "Automated, consistent, never misses a check", expertise: ["Code Quality", "Security Scanning", "Test Coverage", "Dependency Checks", "Performance Budgets"], avatar: "NB" },
    { name: "Elena Rostova", role: "MENTOR", careerPath: "frontend_developer", personality: "Empathetic, experienced, career-focused", expertise: ["Career Coaching", "Frontend Architecture", "Technical Leadership", "Open Source", "Learning Strategies"], avatar: "ER" },
  ];

  const results = [];
  for (const agentData of defaultAgents) {
    const existing = await VirtualAgent.findOne({
      simulation: simulationId,
      name: agentData.name,
    });
    if (!existing) {
      const agent = await VirtualAgent.create({
        simulation: simulationId,
        ...agentData,
        permissions: AGENT_ROLE_PERMISSIONS[agentData.role],
        systemPrompt: AGENT_SYSTEM_PROMPTS[agentData.role],
        configuration: { responseStyle: "TECHNICAL", responseLength: "DETAILED", availabilityHours: "09:00-17:00", timezone: "UTC" },
        isActive: true,
        createdBy: requestingUser._id || requestingUser.id,
      });
      results.push({ id: String(agent._id), ...agent.toObject() });
    }
  }

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "virtual.agent.seed",
    module: "internship",
    resource: "VirtualAgent",
    details: `Seeded ${results.length} default AI agents for simulation ${simulation.simulationCode}`,
    metadata: { simulationId: String(simulationId), seededCount: results.length },
  });

  return results;
}

/* ------------------------------------------------------------------ */
/* Simulation Scenarios                                               */
/* ------------------------------------------------------------------ */

export async function createSimulationScenario(data, { requestingUser }) {
  const simulation = await VirtualSimulation.findById(data.simulation).lean();
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  const scenario = await SimulationScenario.create({
    simulation: data.simulation,
    name: data.name,
    description: data.description,
    scenarioType: data.scenarioType,
    triggerConditions: data.triggerConditions || {},
    involvedAgents: data.involvedAgents || [],
    steps: data.steps || [],
    isActive: data.isActive !== undefined ? data.isActive : true,
    createdBy: requestingUser._id || requestingUser.id,
  });

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "simulation.scenario.create",
    module: "internship",
    resource: "SimulationScenario",
    resourceId: String(scenario._id),
    details: `Created scenario "${scenario.name}" (${scenario.scenarioType})`,
    metadata: { scenarioId: String(scenario._id), simulationId: String(data.simulation), type: data.scenarioType },
  });

  return { id: String(scenario._id), ...scenario.toObject() };
}

export async function listSimulationScenarios(filter = {}) {
  const query = {};
  if (filter.simulation) query.simulation = filter.simulation;
  if (filter.scenarioType) query.scenarioType = filter.scenarioType;
  if (filter.isActive !== undefined) query.isActive = filter.isActive;

  const scenarios = await SimulationScenario.find(query)
    .populate("involvedAgents", "name role")
    .sort({ scenarioType: 1, name: 1 })
    .lean();

  return scenarios.map((s) => ({ id: String(s._id), ...s }));
}

export async function getSimulationScenario(scenarioId) {
  const scenario = await SimulationScenario.findById(scenarioId)
    .populate("involvedAgents", "name role careerPath personality")
    .populate("simulation", "simulationCode companyName")
    .lean();

  if (!scenario) {
    throw notFound("Simulation scenario not found.");
  }

  return { id: String(scenario._id), ...scenario };
}

export async function seedDefaultScenarios(simulationId, { requestingUser }) {
  const simulation = await VirtualSimulation.findById(simulationId).lean();
  if (!simulation) {
    throw notFound("Simulation not found.");
  }

  const agents = await VirtualAgent.find({ simulation: simulationId, isActive: true }).lean();
  const agentMap = {};
  for (const agent of agents) {
    agentMap[agent.role] = agent._id;
  }

  const defaultScenarios = [
    {
      name: "New Hire Onboarding",
      description: "Guided onboarding experience for new simulation participants",
      scenarioType: "ONBOARDING",
      steps: [
        { stepNumber: 1, agentRole: "VIRTUAL_MANAGER", action: "Welcome to the team! I'll be your manager during this simulation. Let me walk you through our team structure and current sprint goals.", expectedStudentAction: "Introduce yourself and share your background", successCriteria: "Student responds with introduction", timeoutMinutes: 10 },
        { stepNumber: 2, agentRole: "MENTOR", action: "Hi! I'm your mentor for this simulation. I'm here to help you navigate the workplace, answer questions, and support your growth. What are your learning goals?", expectedStudentAction: "Share learning goals and ask questions", successCriteria: "Student shares at least one learning goal", timeoutMinutes: 15 },
        { stepNumber: 3, agentRole: "TECHNICAL_LEAD", action: "Welcome to the engineering team! Let me show you our tech stack, code standards, and development workflow. You'll be working on the Core Platform squad.", expectedStudentAction: "Ask clarifying questions about tech stack", successCriteria: "Student demonstrates understanding of workflow", timeoutMinutes: 15 },
      ],
    },
    {
      name: "Sprint Planning Session",
      description: "Collaborative sprint planning with the team",
      scenarioType: "SPRINT_PLANNING",
      steps: [
        { stepNumber: 1, agentRole: "PROJECT_MANAGER", action: "Good morning team! Sprint 44 planning starts now. Our sprint goal is 'Complete IAM Multi-Tenant Release'. Let's review the backlog.", expectedStudentAction: "Review backlog items and ask questions", successCriteria: "Student engages with backlog items", timeoutMinutes: 20 },
        { stepNumber: 2, agentRole: "TECHNICAL_LEAD", action: "For the authentication refactor (FE-2041), we need to implement a new TOTP verification modal. This is a 5-point story. Who wants to take it?", expectedStudentAction: "Volunteer or ask for clarification", successCriteria: "Student shows engagement with task", timeoutMinutes: 15 },
        { stepNumber: 3, agentRole: "SENIOR_DEVELOPER", action: "I can take the audit log virtualization ticket (FE-2042). It's an 8-pointer involving row virtualization. I'll pair with whoever takes the TOTP modal since they share the design system.", expectedStudentAction: "Coordinate with team on dependencies", successCriteria: "Student discusses coordination", timeoutMinutes: 10 },
      ],
    },
    {
      name: "Production Incident Response",
      description: "SEV-1 incident simulation requiring cross-functional response",
      scenarioType: "INCIDENT_RESPONSE",
      steps: [
        { stepNumber: 1, agentRole: "DEVOPS_ENGINEER", action: "SEV-1 ALERT: APM shows auth service CPU at 95%, p99 latency 12s. Error rate 15%. Need immediate triage. @on-call please join #incident-bridge.", expectedStudentAction: "Join incident channel and acknowledge", successCriteria: "Student responds in incident channel", timeoutMinutes: 5 },
        { stepNumber: 2, agentRole: "TECHNICAL_LEAD", action: "I'm investigating. Recent deploy v2.44.1 introduced a connection pool leak in the token refresh endpoint. Rolling back now. ETA 5 minutes.", expectedStudentAction: "Monitor rollback or assist with investigation", successCriteria: "Student participates in response", timeoutMinutes: 10 },
        { stepNumber: 3, agentRole: "VIRTUAL_MANAGER", action: "Good response team. Once mitigated, we'll need a post-mortem. Document timeline, root cause, and action items. Sarah (QA), can you add regression tests for connection pool monitoring?", expectedStudentAction: "Commit to post-mortem contribution", successCriteria: "Student acknowledges post-mortem responsibility", timeoutMinutes: 15 },
      ],
    },
    {
      name: "Code Review Practice",
      description: "Simulated code review with feedback from senior developers",
      scenarioType: "CODE_REVIEW",
      steps: [
        { stepNumber: 1, agentRole: "SENIOR_DEVELOPER", action: "Thanks for the PR! I've left some comments. Overall good approach. A few suggestions: 1) Consider extracting the validation logic into a custom hook for reusability. 2) The error boundary could catch more specific error types.", expectedStudentAction: "Review comments and respond", successCriteria: "Student addresses at least one comment", timeoutMinutes: 20 },
        { stepNumber: 2, agentRole: "TECHNICAL_LEAD", action: "Also noting: the new component should follow our design system token naming convention. Please update the color values to use the semantic tokens from @novatech/design-tokens.", expectedStudentAction: "Update code per design system", successCriteria: "Student makes design system updates", timeoutMinutes: 15 },
        { stepNumber: 3, agentRole: "QA_ENGINEER", action: "Test coverage looks good at 87%. However, we're missing edge cases for the timer expiration flow. Can you add tests for: 1) Timer reaches zero, 2) User pastes invalid code, 3) Network error during verification?", expectedStudentAction: "Add missing test cases", successCriteria: "Student adds test cases", timeoutMinutes: 20 },
      ],
    },
    {
      name: "Client Demo & Feedback",
      description: "Present completed work to a simulated client and incorporate feedback",
      scenarioType: "CLIENT_MEETING",
      steps: [
        { stepNumber: 1, agentRole: "PROJECT_MANAGER", action: "Welcome to the Sprint 43 demo! We'll show the new Organization Settings page with RBAC matrix. Sophie (Design) will walk through the UX, then Aarav (Frontend) will demo the live feature.", expectedStudentAction: "Observe or participate in demo", successCriteria: "Student engages with demo", timeoutMinutes: 15 },
        { stepNumber: 2, agentRole: "CLIENT", action: "The permission matrix looks great! However, I'm concerned about the 'Viewer' role - can they see audit logs? Our compliance team needs read-only access to audit trails without admin permissions.", expectedStudentAction: "Note requirement and discuss feasibility", successCriteria: "Student captures requirement", timeoutMinutes: 10 },
        { stepNumber: 3, agentRole: "PRODUCT_OWNER", action: "Great catch! That's a valid compliance requirement. Let's add a 'Compliance Viewer' role with audit log read access. We'll scope it for next sprint. Team, please estimate the effort.", expectedStudentAction: "Provide rough estimate or ask clarifying questions", successCriteria: "Student contributes to estimation discussion", timeoutMinutes: 10 },
      ],
    },
    {
      name: "Architecture Design Review",
      description: "Technical design review for a new microservice",
      scenarioType: "ARCHITECTURE_DESIGN",
      steps: [
        { stepNumber: 1, agentRole: "TECHNICAL_LEAD", action: "We're proposing a new Notification Service to handle email, push, and in-app notifications. Current monolith notification logic is becoming a bottleneck. Here's the RFC...", expectedStudentAction: "Review RFC and ask questions", successCriteria: "Student demonstrates understanding of proposal", timeoutMinutes: 20 },
        { stepNumber: 2, agentRole: "DATABASE_ENGINEER", action: "For the notification preferences, I recommend a separate preferences collection with user_id index. We'll need TTL indexes for expiration. Avoid embedding in user document due to write amplification.", expectedStudentAction: "Discuss data model trade-offs", successCriteria: "Student engages with data modeling", timeoutMinutes: 15 },
        { stepNumber: 3, agentRole: "DEVOPS_ENGINEER", action: "Deployment strategy: Canary release with 5% traffic for 24h, then 25%, then 100%. Need Prometheus alerts for error rate >1% and p99 latency >500ms. Rollback automated on alert.", expectedStudentAction: "Review deployment plan", successCriteria: "Student acknowledges deployment strategy", timeoutMinutes: 10 },
        { stepNumber: 4, agentRole: "TECHNICAL_REVIEWER", action: "Security review: Notification content may contain PII. Ensure encryption at rest and in transit. Audit log all notification sends. Rate limit per user to prevent abuse. Approved with these conditions.", expectedStudentAction: "Note security requirements", successCriteria: "Student captures security requirements", timeoutMinutes: 10 },
      ],
    },
  ];

  const results = [];
  for (const scenarioData of defaultScenarios) {
    const existing = await SimulationScenario.findOne({
      simulation: simulationId,
      name: scenarioData.name,
    });
    if (!existing) {
      const scenario = await SimulationScenario.create({
        simulation: simulationId,
        ...scenarioData,
        involvedAgents: Object.values(agentMap),
        isActive: true,
        createdBy: requestingUser._id || requestingUser.id,
      });
      results.push({ id: String(scenario._id), ...scenario.toObject() });
    }
  }

  await logAudit({
    userId: requestingUser._id || requestingUser.id,
    action: "simulation.scenario.seed",
    module: "internship",
    resource: "SimulationScenario",
    details: `Seeded ${results.length} default scenarios for simulation ${simulation.simulationCode}`,
    metadata: { simulationId: String(simulationId), seededCount: results.length },
  });

  return results;
}

/* ------------------------------------------------------------------ */
/* AI Agent Interaction Helpers                                       */
/* ------------------------------------------------------------------ */

export async function generateAgentResponse(agentId, context, studentMessage) {
  const agent = await VirtualAgent.findById(agentId).lean();
  if (!agent || !agent.isActive) {
    throw notFound("Virtual agent not found or inactive.");
  }

  // This is a placeholder for actual AI integration
  // In production, this would call an LLM with the agent's system prompt
  // For now, return a structured response indicating the agent would respond

  return {
    agentId: String(agent._id),
    agentName: agent.name,
    agentRole: agent.role,
    response: `[AI Response from ${agent.name} (${agent.role})]: This is a simulated response. In production, this would be generated by an LLM using the agent's system prompt: "${agent.systemPrompt.substring(0, 100)}..."`,
    timestamp: new Date(),
    metadata: {
      context,
      studentMessage,
      agentConfiguration: agent.configuration,
    },
  };
}

export async function simulateAgentMessage(simulationId, channelName, agentRole, content, { requestingUser }) {
  const agent = await VirtualAgent.findOne({
    simulation: simulationId,
    role: agentRole,
    isActive: true,
  }).lean();

  if (!agent) {
    throw notFound(`No active agent found with role ${agentRole}.`);
  }

  const message = await SimulationMessage.create({
    simulation: simulationId,
    channelName,
    channelType: "PUBLIC",
    senderMembership: null,
    isAIBot: true,
    aiBotType: agentRole,
    senderName: agent.name,
    content,
    sentAt: new Date(),
  });

  return { id: String(message._id), ...message.toObject() };
}