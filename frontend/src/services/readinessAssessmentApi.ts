import { apiFetch, ApiError } from "./apiClient";

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({ error: "Failed to parse JSON" }));
  if (!res.ok) {
    throw new ApiError(json.error || `HTTP ${res.status}`, res.status);
  }
  return json as T;
}

/* ========================================================================
 * Career Readiness – Recommendations
 * ======================================================================== */

export async function fetchReadinessRecommendations(params?: {
  studentId?: string;
  facultyId?: string;
  careerRole?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: any[]; total: number; page: number; limit: number; pages: number }> {
  const query = new URLSearchParams();
  if (params?.studentId) query.set("studentId", params.studentId);
  if (params?.facultyId) query.set("facultyId", params.facultyId);
  if (params?.careerRole) query.set("careerRole", params.careerRole);
  if (params?.status) query.set("status", params.status);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const res = await apiFetch(`/readiness-assessments/recommendations?${query.toString()}`);
  return handleResponse(res);
}

export async function fetchReadinessRecommendation(id: string): Promise<any> {
  const res = await apiFetch(`/readiness-assessments/recommendations/${encodeURIComponent(id)}`);
  return handleResponse(res);
}

export async function createReadinessRecommendation(payload: {
  studentId: string;
  careerRole: string;
  careerPathCode?: string | null;
  recommendedCompetencies?: string[];
  skillGaps?: string[];
  areasOfStrength?: string[];
  facultyComments?: string;
  supportingSubmissions?: string[];
  relevantProjects?: string[];
}): Promise<any> {
  const res = await apiFetch("/readiness-assessments/recommendations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function submitReadinessRecommendation(id: string): Promise<any> {
  const res = await apiFetch(`/readiness-assessments/recommendations/${encodeURIComponent(id)}/submit`, {
    method: "POST",
  });
  return handleResponse(res);
}

export async function reviewReadinessRecommendation(id: string, payload: {
  status: string;
  reviewComments?: string | null;
  additionalEvidenceRequested?: string[] | null;
}): Promise<any> {
  const res = await apiFetch(`/readiness-assessments/recommendations/${encodeURIComponent(id)}/review`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

/* ========================================================================
 * Career Readiness – Assessments
 * ======================================================================== */

export async function fetchReadinessAssessments(params?: {
  studentId?: string;
  careerRole?: string;
  status?: string;
  assessor?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: any[]; total: number; page: number; limit: number; pages: number }> {
  const query = new URLSearchParams();
  if (params?.studentId) query.set("studentId", params.studentId);
  if (params?.careerRole) query.set("careerRole", params.careerRole);
  if (params?.status) query.set("status", params.status);
  if (params?.assessor) query.set("assessor", params.assessor);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const res = await apiFetch(`/readiness-assessments?${query.toString()}`);
  return handleResponse(res);
}

export async function fetchReadinessAssessment(id: string): Promise<any> {
  const res = await apiFetch(`/readiness-assessments/${encodeURIComponent(id)}`);
  return handleResponse(res);
}

export async function recordReadinessAssessmentDecision(id: string, payload: {
  decision: string;
  rationale?: string | null;
  evidenceSummary?: string | null;
  competenciesMet?: { competency: string; met: boolean; evidenceNote?: string; reviewerComment?: string }[];
  reassessmentDueAt?: string | null;
}): Promise<any> {
  const res = await apiFetch(`/readiness-assessments/${encodeURIComponent(id)}/decision`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

/* ========================================================================
 * Career Readiness – Dashboard
 * ======================================================================== */

export async function fetchReadinessDashboard(): Promise<any> {
  const res = await apiFetch("/readiness-assessments/dashboard");
  return handleResponse(res);
}
