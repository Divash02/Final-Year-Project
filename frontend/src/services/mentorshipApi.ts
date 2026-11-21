import { apiFetch, ApiError } from "./apiClient";

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({ error: "Failed to parse JSON" }));
  if (!res.ok) {
    throw new ApiError(json.error || `HTTP ${res.status}`, res.status);
  }
  return json as T;
}

/* ========================================================================
 * Faculty Mentorship – Assignments
 * ======================================================================== */

export async function fetchMentorshipAssignments(params?: {
  status?: string;
  studentId?: string;
  facultyId?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: any[]; total: number; page: number; limit: number; pages: number }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.studentId) query.set("studentId", params.studentId);
  if (params?.facultyId) query.set("facultyId", params.facultyId);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const res = await apiFetch(`/mentorship/assignments?${query.toString()}`);
  return handleResponse(res);
}

export async function fetchMentorshipAssignment(id: string): Promise<any> {
  const res = await apiFetch(`/mentorship/assignments/${encodeURIComponent(id)}`);
  return handleResponse(res);
}

export async function createMentorshipAssignment(payload: {
  studentId: string;
  facultyId: string;
  academicProgram?: string;
  semester?: number;
  notes?: string;
}): Promise<any> {
  const res = await apiFetch("/mentorship/assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function updateMentorshipAssignment(id: string, payload: {
  status?: string;
  notes?: string;
  terminationReason?: string;
}): Promise<any> {
  const res = await apiFetch(`/mentorship/assignments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

/* ========================================================================
 * Faculty Mentorship – Sessions
 * ======================================================================== */

export async function fetchMentorshipSessions(params?: {
  assignmentId?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: any[]; total: number; page: number; limit: number; pages: number }> {
  const query = new URLSearchParams();
  if (params?.assignmentId) query.set("assignmentId", params.assignmentId);
  if (params?.status) query.set("status", params.status);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const res = await apiFetch(`/mentorship/sessions?${query.toString()}`);
  return handleResponse(res);
}

export async function createMentorshipSession(payload: {
  assignmentId: string;
  scheduledAt: string;
  sessionType?: "individual" | "group" | "checkin";
  topics?: string[];
}): Promise<any> {
  const res = await apiFetch("/mentorship/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function updateMentorshipSession(id: string, payload: {
  heldAt?: string | null;
  durationMinutes?: number | null;
  outcomes?: string;
  studentReflection?: string | null;
  facultyComments?: string | null;
  nextSteps?: string | null;
  status?: "SCHEDULED" | "HELD" | "MISSED" | "CANCELLED";
}): Promise<any> {
  const res = await apiFetch(`/mentorship/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

/* ========================================================================
 * Faculty Mentorship – Observations
 * ======================================================================== */

export async function fetchFacultyObservations(params?: {
  assignmentId?: string;
  studentId?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: any[]; total: number; page: number; limit: number; pages: number }> {
  const query = new URLSearchParams();
  if (params?.assignmentId) query.set("assignmentId", params.assignmentId);
  if (params?.studentId) query.set("studentId", params.studentId);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const res = await apiFetch(`/mentorship/observations?${query.toString()}`);
  return handleResponse(res);
}

export async function createFacultyObservation(payload: {
  assignmentId: string;
  studentId: string;
  competencyArea: string;
  rating: number;
  evidence?: string;
  comments?: string;
}): Promise<any> {
  const res = await apiFetch("/mentorship/observations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

/* ========================================================================
 * Faculty Mentorship – Dashboard
 * ======================================================================== */

export async function fetchMentorshipDashboard(): Promise<any> {
  const res = await apiFetch("/mentorship/dashboard");
  return handleResponse(res);
}
