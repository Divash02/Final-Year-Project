import { apiRequest } from "./apiClient";

export async function listConnectSessions(params: { type?: string; status?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.status) qs.set("status", params.status);
  const q = qs.toString();
  return apiRequest(`/connect/sessions${q ? `?${q}` : ""}`);
}

export async function getConnectSession(id: string) {
  return apiRequest(`/connect/sessions/${id}`);
}

export async function listConnectCourses(params: Record<string, string | number | undefined> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.set(k, String(v));
  }
  const q = qs.toString();
  return apiRequest(`/connect/courses${q ? `?${q}` : ""}`);
}

export async function searchConnectCourses(params: { q?: string; courseName?: string; courseCode?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.set(k, String(v));
  }
  const q = qs.toString();
  return apiRequest(`/connect/courses/search${q ? `?${q}` : ""}`);
}

export async function resolveConnectCourseIdentity(payload: { courseName: string; courseCode: string }) {
  return apiRequest("/connect/courses/resolve-identity", { method: "POST", body: JSON.stringify(payload) });
}

export async function resolveConnectCourseOfferings(payload: { courseId?: string; courseName?: string; courseCode?: string }) {
  return apiRequest("/connect/courses/offerings", { method: "POST", body: JSON.stringify(payload) });
}

export async function listConnectCourseSections(payload: { courseId: string; program?: string; academicYear?: string; semester?: string | number; batch?: string }) {
  return apiRequest("/connect/classes/sections", { method: "POST", body: JSON.stringify(payload) });
}

export async function listConnectCourseTeachers(courseId: string, params: Record<string, string | number | undefined> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.set(k, String(v));
  }
  const q = qs.toString();
  return apiRequest(`/connect/courses/${encodeURIComponent(courseId)}/teachers${q ? `?${q}` : ""}`);
}

export async function createConnectClass(payload: any) {
  return apiRequest("/connect/classes", { method: "POST", body: JSON.stringify(payload) });
}

export async function createConnectMeeting(payload: any) {
  return apiRequest("/connect/meetings", { method: "POST", body: JSON.stringify(payload) });
}

export async function resolveConnectClassTarget(payload: any) {
  return apiRequest("/connect/classes/resolve", { method: "POST", body: JSON.stringify(payload) });
}

export async function listConnectStaff(q = "") {
  return apiRequest(`/connect/staff${q ? `?q=${encodeURIComponent(q)}` : ""}`);
}

export async function regenerateConnectCredentials(id: string) {
  return apiRequest(`/connect/sessions/${id}/credentials/regenerate`, { method: "POST" });
}

export async function getConnectCredentials(id: string) {
  return apiRequest(`/connect/sessions/${id}/credentials`);
}

export async function getConnectConfig() {
  return apiRequest(`/connect/config`);
}

export async function joinConnectSession(id: string, payload: any = {}) {
  return apiRequest(`/connect/sessions/${id}/join`, { method: "POST", body: JSON.stringify(payload) });
}

export async function leaveConnectSession(id: string) {
  return apiRequest(`/connect/sessions/${id}/leave`, { method: "POST" });
}

export async function getConnectLiveKitToken(id: string, payload: any = {}) {
  return apiRequest(`/connect/sessions/${id}/livekit/token`, { method: "POST", body: JSON.stringify(payload) });
}

export async function startConnectSession(id: string) {
  return apiRequest(`/connect/sessions/${id}/start`, { method: "POST" });
}

export async function getConnectBoard(id: string) {
  return apiRequest(`/connect/sessions/${id}/board`);
}
export async function sendConnectBoardStroke(id: string, payload: any) {
  return apiRequest(`/connect/sessions/${id}/board/stroke`, { method: "POST", body: JSON.stringify(payload) });
}
export async function clearConnectBoard(id: string, payload: any = {}) {
  return apiRequest(`/connect/sessions/${id}/board/clear`, { method: "POST", body: JSON.stringify(payload) });
}
export async function manageConnectBoardPage(id: string, payload: any) {
  return apiRequest(`/connect/sessions/${id}/board/page`, { method: "POST", body: JSON.stringify(payload) });
}
export async function setConnectBoardPermission(id: string, payload: any) {
  return apiRequest(`/connect/sessions/${id}/board/permission`, { method: "POST", body: JSON.stringify(payload) });
}
export async function endConnectSession(id: string) {
  return apiRequest(`/connect/sessions/${id}/end`, { method: "POST" });
}

export async function cancelConnectSession(id: string) {
  return apiRequest(`/connect/sessions/${id}/cancel`, { method: "POST" });
}

export async function setConnectAdmissionPolicy(id: string, policy: string) {
  return apiRequest(`/connect/sessions/${id}/admission-policy`, { method: "POST", body: JSON.stringify({ policy }) });
}

export async function requestConnectAdmission(id: string) {
  return apiRequest(`/connect/sessions/${id}/admission-request`, { method: "POST", body: JSON.stringify({}) });
}

export async function getConnectWaitingRoom(id: string) {
  return apiRequest(`/connect/sessions/${id}/waiting-room`);
}

export async function decideConnectAdmission(id: string, requestId: string, decision: "approve" | "reject") {
  return apiRequest(`/connect/sessions/${id}/waiting-room/${encodeURIComponent(requestId)}/${decision}`, { method: "POST" });
}
