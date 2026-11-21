import { apiFetch, ApiError } from "./apiClient";

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({ error: "Failed to parse JSON" }));
  if (!res.ok) {
    throw new ApiError(json.error || `HTTP ${res.status}`, res.status);
  }
  return json as T;
}

/* ========================================================================
 * Student Identity Verification
 * ======================================================================== */

export interface StudentVerificationFilters {
  status?: string;
  studentId?: string;
  verificationType?: string;
  page?: number;
  limit?: number;
}

export interface StudentVerificationListResponse {
  items: any[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export async function fetchStudentVerifications(params?: StudentVerificationFilters): Promise<StudentVerificationListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.studentId) query.set("studentId", params.studentId);
  if (params?.verificationType) query.set("verificationType", params.verificationType);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const res = await apiFetch(`/student-verification?${query.toString()}`);
  return handleResponse(res);
}

export async function fetchStudentVerification(id: string): Promise<any> {
  const res = await apiFetch(`/student-verification/${encodeURIComponent(id)}`);
  return handleResponse(res);
}

export async function submitStudentVerification(payload: {
  studentId: string;
  verificationType: string;
  documentNumber?: string | null;
  documentType?: string | null;
  issuingAuthority?: string | null;
  expiryDate?: string | null;
}): Promise<any> {
  const res = await apiFetch("/student-verification", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function reviewStudentVerification(id: string, payload: {
  status: string;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
}): Promise<any> {
  const res = await apiFetch(`/student-verification/${encodeURIComponent(id)}/review`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function fetchStudentVerificationHistory(id: string): Promise<any[]> {
  const res = await apiFetch(`/student-verification/${encodeURIComponent(id)}/history`);
  return handleResponse(res);
}

export async function fetchStudentVerificationDashboard(): Promise<any> {
  const res = await apiFetch("/student-verification/dashboard");
  return handleResponse(res);
}
