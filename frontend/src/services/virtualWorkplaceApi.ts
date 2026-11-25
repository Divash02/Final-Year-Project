import { apiRequest } from "./apiClient";
import { CareerPath, VirtualCompany, VirtualDepartment, SimulationTeam, SimulationProject, SimulationTask, SimulationSubmission, SimulationReview, SimulationEvent, SimulationMeeting, SimulationMessage, SimulationAssessment, VirtualAgent, SimulationScenario, SpecialistWorkspaceConfig, CompetencyEvidence, ProfessionalPortfolio, SimulationMembership } from "../components/modules/internship/types";

export interface WorkspaceData {
  membership: SimulationMembership;
  simulation: any;
  company: VirtualCompany;
  department: VirtualDepartment;
  team: SimulationTeam;
  careerPath: CareerPath;
}

export interface MembershipValidation {
  valid: boolean;
  membership?: SimulationMembership;
  simulation?: any;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface TaskFilters {
  status?: string;
  careerPath?: CareerPath;
  projectId?: string;
  sprintNumber?: number;
  assigneeMembershipId?: string;
  page?: number;
  limit?: number;
}

export interface SubmissionFilters {
  taskId?: string;
  membershipId?: string;
  simulationId?: string;
  page?: number;
  limit?: number;
}

class VirtualWorkplaceApi {
  private basePath = "/api/internship/virtual-workplace";

  async validateMembership(membershipId: string): Promise<MembershipValidation> {
    try {
      const response = await apiRequest<{ membership: SimulationMembership; simulation: any }>(
        `${this.basePath}/memberships/${membershipId}/validate`
      );
      return { valid: true, membership: response.membership, simulation: response.simulation };
    } catch (error: any) {
      if (error.status === 404) {
        return { valid: false, error: "Membership not found" };
      }
      if (error.status === 403) {
        return { valid: false, error: "Not authorized to access this workspace" };
      }
      return { valid: false, error: error.message || "Failed to validate membership" };
    }
  }

  async getWorkspaceData(membershipId: string): Promise<WorkspaceData | null> {
    try {
      return await apiRequest<WorkspaceData>(`${this.basePath}/memberships/${membershipId}/workspace`);
    } catch (error) {
      console.error("Failed to fetch workspace data:", error);
      return null;
    }
  }

  async getSimulation(simulationId: string) {
    return apiRequest(`${this.basePath}/simulations/${simulationId}`);
  }

  async getCompany(companyId: string): Promise<VirtualCompany> {
    return apiRequest(`${this.basePath}/companies/${companyId}`);
  }

  async getDepartment(departmentId: string): Promise<VirtualDepartment> {
    return apiRequest(`${this.basePath}/departments/${departmentId}`);
  }

  async getTeam(teamId: string): Promise<SimulationTeam> {
    return apiRequest(`${this.basePath}/teams/${teamId}`);
  }

  async getTasks(filters: TaskFilters = {}): Promise<PaginatedResponse<SimulationTask>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    return apiRequest(`${this.basePath}/tasks?${params.toString()}`);
  }

  async getTask(taskId: string): Promise<SimulationTask> {
    return apiRequest(`${this.basePath}/tasks/${taskId}`);
  }

  async updateTask(taskId: string, updates: Partial<SimulationTask>): Promise<SimulationTask> {
    return apiRequest(`${this.basePath}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async submitWork(taskId: string, data: {
    pullRequestUrl?: string;
    figmaLink?: string;
    testSuiteSummary?: string;
    documentationLink?: string;
    networkDiagramUrl?: string;
    databaseSchemaUrl?: string;
    deploymentUrl?: string;
    notes?: string;
  }): Promise<SimulationSubmission> {
    return apiRequest(`${this.basePath}/tasks/${taskId}/submit`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSubmissions(filters: SubmissionFilters = {}): Promise<PaginatedResponse<SimulationSubmission>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    return apiRequest(`${this.basePath}/submissions?${params.toString()}`);
  }

  async getSubmission(submissionId: string): Promise<SimulationSubmission> {
    return apiRequest(`${this.basePath}/submissions/${submissionId}`);
  }

  async getReviews(submissionId: string): Promise<SimulationReview[]> {
    return apiRequest(`${this.basePath}/submissions/${submissionId}/reviews`);
  }

  async createReview(submissionId: string, data: {
    reviewStatus: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
    score?: number;
    comments?: { file: string; line: number; comment: string }[];
    summary?: string;
    strengths?: string[];
    improvements?: string[];
  }): Promise<SimulationReview> {
    return apiRequest(`${this.basePath}/submissions/${submissionId}/reviews`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getProjects(simulationId: string): Promise<SimulationProject[]> {
    return apiRequest(`${this.basePath}/simulations/${simulationId}/projects`);
  }

  async getProject(projectId: string): Promise<SimulationProject> {
    return apiRequest(`${this.basePath}/projects/${projectId}`);
  }

  async getEvents(simulationId: string, filters?: { status?: string; eventType?: string }): Promise<SimulationEvent[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.eventType) params.append("eventType", filters.eventType);
    return apiRequest(`${this.basePath}/simulations/${simulationId}/events?${params.toString()}`);
  }

  async getMeetings(simulationId: string, filters?: { teamId?: string; projectId?: string; status?: string }): Promise<SimulationMeeting[]> {
    const params = new URLSearchParams();
    if (filters?.teamId) params.append("teamId", filters.teamId);
    if (filters?.projectId) params.append("projectId", filters.projectId);
    if (filters?.status) params.append("status", filters.status);
    return apiRequest(`${this.basePath}/simulations/${simulationId}/meetings?${params.toString()}`);
  }

  async getMessages(simulationId: string, channelName: string, limit = 50): Promise<SimulationMessage[]> {
    return apiRequest(`${this.basePath}/simulations/${simulationId}/messages/${encodeURIComponent(channelName)}?limit=${limit}`);
  }

  async sendMessage(simulationId: string, data: {
    channelName: string;
    channelType: "PUBLIC" | "PRIVATE" | "DIRECT" | "ANNOUNCEMENT" | "THREAD";
    content: string;
    attachments?: { url: string; name: string; type: string }[];
    mentions?: string[];
    threadId?: string;
  }): Promise<SimulationMessage> {
    return apiRequest(`${this.basePath}/simulations/${simulationId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getAssessment(studentId: string, simulationId: string): Promise<SimulationAssessment | null> {
    try {
      return await apiRequest(`${this.basePath}/simulations/${simulationId}/assessments/${studentId}`);
    } catch (error: any) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async getCompetencies(simulationId: string): Promise<any[]> {
    return apiRequest(`${this.basePath}/simulations/${simulationId}/competencies`);
  }

  async getCompetencyEvidence(studentId: string, simulationId: string): Promise<CompetencyEvidence[]> {
    return apiRequest(`${this.basePath}/simulations/${simulationId}/competency-evidence/${studentId}`);
  }

  async createCompetencyEvidence(data: {
    competency: string;
    sourceDomain: "REAL_INTERNSHIP" | "INDUSTRY_PROJECT" | "VIRTUAL_SIMULATION";
    sourceReferenceId: string;
    evidenceSummary?: string;
    evidenceUrl?: string;
    scoreLevel?: number;
  }): Promise<CompetencyEvidence> {
    return apiRequest(`${this.basePath}/competency-evidence`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getPortfolio(slug: string): Promise<ProfessionalPortfolio> {
    return apiRequest(`${this.basePath}/portfolios/${slug}`);
  }

  async createOrUpdatePortfolio(data: {
    slug?: string;
    headline?: string;
    bio?: string;
    featuredSkills?: string[];
    verifiedDeliverables?: any[];
    isPublic?: boolean;
  }): Promise<ProfessionalPortfolio> {
    return apiRequest(`${this.basePath}/portfolios`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getVirtualAgents(simulationId: string): Promise<VirtualAgent[]> {
    return apiRequest(`${this.basePath}/../ai-workforce/agents?simulation=${simulationId}`);
  }

  async getSimulationScenarios(simulationId: string): Promise<SimulationScenario[]> {
    return apiRequest(`${this.basePath}/../ai-workforce/scenarios?simulation=${simulationId}`);
  }

  async triggerAgentResponse(data: {
    agentId: string;
    message: string;
    context?: Record<string, any>;
  }): Promise<any> {
    return apiRequest(`${this.basePath}/../ai-workforce/agents/respond`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSpecialistWorkspaceConfig(careerPath: CareerPath): Promise<SpecialistWorkspaceConfig> {
    return apiRequest(`${this.basePath}/../virtual-companies/workspace-configs/${careerPath}`);
  }

  async getStudentMemberships(): Promise<SimulationMembership[]> {
    return apiRequest(`${this.basePath}/memberships/mine`);
  }
}

export const virtualWorkplaceApi = new VirtualWorkplaceApi();