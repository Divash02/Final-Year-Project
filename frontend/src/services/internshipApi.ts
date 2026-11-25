import { apiFetch, ApiError } from "./apiClient";

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({ error: "Failed to parse JSON" }));
  if (!res.ok) {
    throw new ApiError(json.error || `HTTP ${res.status}`, res.status);
  }
  return json as T;
}

function qs(params: Record<string, any>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return q.toString();
}

export async function listOpportunities(params?: any): Promise<any> {
  const res = await apiFetch(`/internship/opportunities?${qs(params || {})}`);
  return handleResponse(res);
}

export async function createOpportunity(payload: any): Promise<any> {
  const res = await apiFetch("/internship/opportunities", { method: "POST", body: JSON.stringify(payload) });
  return handleResponse(res);
}

export async function listApplications(params?: any): Promise<any> {
  const res = await apiFetch(`/internship/applications?${qs(params || {})}`);
  return handleResponse(res);
}

export async function createApplication(payload: any): Promise<any> {
  const res = await apiFetch("/internship/applications", { method: "POST", body: JSON.stringify(payload) });
  return handleResponse(res);
}

export async function listEmployers(params?: any): Promise<any> {
  const res = await apiFetch(`/internship/employers?${qs(params || {})}`);
  return handleResponse(res);
}

export async function listPlacements(params?: any): Promise<any> {
  const res = await apiFetch(`/internship/placements?${qs(params || {})}`);
  return handleResponse(res);
}

export async function listLogbooks(placementId: string): Promise<any> {
  const res = await apiFetch(`/internship/placements/${encodeURIComponent(placementId)}/logbooks`);
  return handleResponse(res);
}

export async function listVirtualCompanies(params?: any): Promise<any> {
  const res = await apiFetch(`/virtual-companies?${qs(params || {})}`);
  return handleResponse(res);
}

export async function getCareerExplorerDashboard(): Promise<any> {
  const res = await apiFetch("/careers/dashboard");
  return handleResponse(res);
}

export async function listCareerRoles(params?: any): Promise<any> {
  const res = await apiFetch(`/careers/roles?${qs(params || {})}`);
  return handleResponse(res);
}

export async function addCareerInterest(payload: any): Promise<any> {
  const res = await apiFetch("/careers/interests", { method: "POST", body: JSON.stringify(payload) });
  return handleResponse(res);
}

export async function removeCareerInterest(id: string): Promise<any> {
  const res = await apiFetch(`/careers/interests/${encodeURIComponent(id)}`, { method: "DELETE" });
  return handleResponse(res);
}
