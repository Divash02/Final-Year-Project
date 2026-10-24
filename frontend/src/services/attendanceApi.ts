import { apiRequest } from "./apiClient";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Mark = "P" | "A" | "L" | "B";

export interface ContextCourse {
  id: string;
  code: string;
  name: string;
  semester?: number;
  sectionCodes: string[];
}

export interface AttendanceContext {
  mode: "assigned" | "institution";
  courses: ContextCourse[];
  sections: string[];
  allSections: string[];
  batches: string[];
  academicYears: string[];
  classTypes: string[];
  statuses: string[];
}

export interface RosterStudent {
  studentMongoId: string;
  studentUserId: string | null;
  studentId: string;
  rollNumber: string;
  name: string;
  firstName: string;
  lastName: string;
  section: string;
  batch: string;
  program: string;
  avatarUrl: string | null;
  status?: string | null;
  recordId?: string | null;
  markedAt?: string | null;
  remarks?: string;
  corrections?: CorrectionEntry[];
}

export interface CorrectionEntry {
  from: string | null;
  to: string;
  changedByName: string;
  reason: string;
  changedAt: string;
}

export interface SessionSummary {
  Present: number;
  Absent: number;
  Late: number;
  Bunk: number;
  Excused: number;
  Unmarked: number;
}

export interface AttendanceSessionView {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  sectionCodes: string[];
  academicYear: string | null;
  batches: string[];
  semester: number;
  classType: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  topic: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  summary?: SessionSummary | null;
  facultyName?: string | null;
}

export interface QrCredential {
  sessionId: string;
  qrToken: string;
  qrExpiresAt: string;
  qrTtlSeconds: number;
}

export interface MyAttendanceRecord {
  id: string;
  date: string;
  status: string;
  courseCode: string;
  courseName: string;
  section: string;
  classType: string;
  markedAt: string;
  /** Backend fields returned by `GET /api/attendance` for a student caller. */
  sessionId?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  studentAvatar?: string | null;
  courseId?: string | null;
  session?: string | null;
  remarks?: string;
}

/** Marks that count towards a student's attendance percentage (mirrors the backend). */
export const ATTENDING_STATUSES = ["Present", "Late"];

export interface SessionDetailResponse {
  session: AttendanceSessionView;
  students: RosterStudent[];
  summary: SessionSummary;
  markedCount: number;
  totalCount: number;
}

export interface SaveRegisterResponse {
  savedCount: number;
  clearedCount: number;
  records: Array<{
    studentId: string;
    studentMongoId: string;
    studentName: string;
    avatarUrl: string | null;
    section: string;
    status: string;
    remarks: string;
    previousStatus: string | null;
  }>;
  clearedRecords: Array<{
    studentId: string;
    studentMongoId: string;
    studentName: string;
    section: string;
    status: string;
  }>;
  rejected: Array<{ studentId: string; error: string }>;
}

export interface CorrectionResponse {
  success: boolean;
  status: string;
  previousStatus?: string;
  unchanged?: boolean;
}

export interface StudentSummaryResponse {
  student: {
    studentMongoId: string;
    studentId: string;
    name: string;
    section: string;
    batch: string;
    program: string;
    semester: number | null;
    avatarUrl: string | null;
    attendancePercentage: number;
  };
  currentStatus: string | null;
  recentAttendance: Array<{
    date: string;
    status: string;
    section: string;
    classType: string;
    courseCode: string;
    courseName: string;
  }>;
}

/* ------------------------------------------------------------------ */
/* Thin typed wrappers over apiRequest                                 */
/* ------------------------------------------------------------------ */

function json(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

export function fetchAttendanceContext(): Promise<AttendanceContext> {
  return apiRequest<AttendanceContext>("/attendance/context");
}

export function fetchSessions(): Promise<{ sessions: AttendanceSessionView[] }> {
  return apiRequest<{ sessions: AttendanceSessionView[] }>("/attendance/sessions?limit=25");
}

export function fetchSessionDetail(id: string): Promise<SessionDetailResponse> {
  return apiRequest<SessionDetailResponse>(`/attendance/sessions/${encodeURIComponent(id)}`);
}

/** Per-student profile and recent attendance within a session's scope. */
export function fetchStudentSummary(
  sessionId: string,
  studentMongoId: string,
): Promise<StudentSummaryResponse> {
  return apiRequest<StudentSummaryResponse>(
    `/attendance/sessions/${encodeURIComponent(sessionId)}/students/${encodeURIComponent(studentMongoId)}/summary`,
  );
}

export function fetchRoster(params: {
  courseId?: string;
  section?: string[];
  batch?: string;
  academicYear?: string;
  classType?: string;
}): Promise<{ roster: RosterStudent[] }> {
  const url = new URL("/attendance/roster", window.location.origin);
  url.pathname = "/attendance/roster";
  if (params.courseId) url.searchParams.set("courseId", params.courseId);
  if (params.section?.length) url.searchParams.set("section", params.section.join(","));
  if (params.batch) url.searchParams.set("batch", params.batch);
  if (params.academicYear) url.searchParams.set("academicYear", params.academicYear);
  if (params.classType) url.searchParams.set("classType", params.classType);
  return apiRequest<{ roster: RosterStudent[] }>(url.pathname + url.search);
}

export function fetchMyAttendance(): Promise<{ attendance: MyAttendanceRecord[] }> {
  return apiRequest<{ attendance: MyAttendanceRecord[] }>("/attendance");
}

export function createAttendanceSession(payload: {
  courseId: string;
  sectionCodes: string[];
  academicYear?: string;
  batch?: string;
  semester?: number;
  classType?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  topic?: string;
}): Promise<{ sessionId: string; session: AttendanceSessionView; alreadyOpen?: boolean }> {
  return apiRequest<{ sessionId: string; session: AttendanceSessionView; alreadyOpen?: boolean }>(
    "/attendance/sessions",
    json(payload),
  );
}

export function saveRegisterApi(
  sessionId: string,
  records: Array<{ studentId: string; status: string; remarks?: string }>,
): Promise<SaveRegisterResponse> {
  return apiRequest<SaveRegisterResponse>(
    `/attendance/sessions/${encodeURIComponent(sessionId)}/records`,
    json({ records }),
  );
}

export function closeSession(sessionId: string): Promise<{ success: boolean; markedCount: number }> {
  return apiRequest<{ success: boolean; markedCount: number }>(
    `/attendance/sessions/${encodeURIComponent(sessionId)}/close`,
    { method: "POST" },
  );
}

export function correctAttendance(
  recordId: string,
  status: string,
  reason: string,
): Promise<CorrectionResponse> {
  return apiRequest<CorrectionResponse>(
    `/attendance/records/${encodeURIComponent(recordId)}`,
    json({ status, reason }),
  );
}

export function requestQrToken(sessionId: string): Promise<QrCredential> {
  return apiRequest<QrCredential>(
    `/attendance/sessions/${encodeURIComponent(sessionId)}/qr`,
    { method: "POST" },
  );
}

export function checkInWithQr(token: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>("/attendance/check-in", json({ token }));
}

/* ------------------------------------------------------------------ */
/* Attendance records (staff reporting workspace)                      */
/* ------------------------------------------------------------------ */

export interface StaffAttendanceRecord {
  id: string;
  sessionId: string | null;
  studentId: string | null;
  studentName: string | null;
  studentMongoId: string | null;
  studentAvatar: string | null;
  courseId: string;
  courseCode: string;
  courseName: string;
  section: string;
  classType: string;
  date: string;
  session: string | null;
  status: string;
  markedBy: string | null;
  markedAt: string;
  remarks: string;
}

export interface AttendanceRecordsResponse {
  attendance: StaffAttendanceRecord[];
}

export interface AttendanceRecordHistoryEntry {
  from: string;
  to: string;
  changedByName: string;
  reason: string;
  changedAt: string | null;
}

export interface AttendanceRecordHistoryResponse {
  recordId: string;
  studentId: string | null;
  currentStatus: string | null;
  history: AttendanceRecordHistoryEntry[];
}

export function fetchAttendanceRecords(filters: {
  date?: string;
  sessionId?: string;
  courseId?: string;
  section?: string;
}): Promise<AttendanceRecordsResponse> {
  const params = new URLSearchParams();
  if (filters.date) params.set("date", filters.date);
  if (filters.sessionId && /^[0-9a-fA-F]{24}$/.test(filters.sessionId)) {
    params.set("sessionId", filters.sessionId);
  }
  if (filters.courseId) params.set("courseId", filters.courseId);
  if (filters.section) params.set("section", filters.section);
  return apiRequest<AttendanceRecordsResponse>(`/attendance${params.toString() ? `?${params.toString()}` : ""}`);
}

export function fetchAttendanceRecordHistory(recordId: string): Promise<AttendanceRecordHistoryResponse> {
  return apiRequest(`/attendance/records/${encodeURIComponent(recordId)}/history`);
}
