import { apiRequest } from "./apiClient";

export type TimetableStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type LifecycleState = "DRAFT" | "APPROVED" | "PUBLISHED";
export type SessionType =
  | "REGULAR_CLASS"
  | "LAB"
  | "TUTORIAL"
  | "EXAM"
  | "WORKSHOP"
  | "SEMINAR"
  | "OTHER";

export interface CourseOption {
  id: string;
  code: string;
  name: string;
}

export interface RoomOption {
  label: string;
  name: string | null;
  capacity: number | null;
}

export interface TeacherOption {
  id: string;
  name: string;
}

export interface TimetableFilters {
  academicYears: string[];
  defaultAcademicYear: string;
  programs: string[];
  batchYears: string[];
  semesters: number[];
  sectionCodes: string[];
  sessionTypes: string[];
  statuses: string[];
  days: string[];
  courses: CourseOption[];
  rooms: RoomOption[];
  teachers: TeacherOption[];
}

export interface TimetableFiltersResponse {
  filters: TimetableFilters;
}

export interface ConflictSide {
  id: string;
  scheduledDay: string;
  date: string | null;
  startTime: string;
  endTime: string;
  room: string | null;
  sectionCode: string;
  label: string;
}

export interface ConflictSet {
  teacher: ConflictSide[];
  room: ConflictSide[];
  cohort: ConflictSide[];
}

export interface ConflictResponse {
  conflicts: ConflictSet;
  hasConflicts: boolean;
  message: string | null;
}

export interface CohortStudent {
  studentId: string;
  name: string;
  section: string;
}

export interface CohortResponse {
  cohort: CohortStudent[];
}

export interface TimetableSession {
  id: string;
  _id: string;
  courseId: string;
  courseCode: string | null;
  courseName: string | null;
  facultyUserId: string;
  facultyName: string | null;
  program: string | null;
  batch: string | null;
  semester: number | null;
  sectionCode: string;
  room: string | null;
  building: string | null;
  date: string | null;
  scheduledDay: string;
  dayIndex: number | null;
  academicYear: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  status: TimetableStatus;
  lifecycleState: LifecycleState;
  version: number;
  publishedAt: string | null;
  publishedBy: string | null;
  approvedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishReason: string | null;
  notes: string;
  attendanceSessionId: string | null;
  attendanceStatus: "OPEN" | "CLOSED" | null;
  archived: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TimetableListResponse {
  timetable: TimetableSession[];
}

export interface TimetableSessionResponse {
  session: TimetableSession;
}

export interface CreateSessionPayload {
  course: string;
  facultyUser: string;
  program?: string;
  batch?: string;
  semester: number;
  sectionCode: string;
  room?: string;
  building?: string;
  date?: string;
  scheduledDay: string;
  academicYear?: string;
  startTime: string;
  endTime: string;
  sessionType?: SessionType;
  notes?: string;
}

export interface ConflictCheckPayload {
  course?: string;
  facultyUser?: string;
  sectionCode?: string;
  semester?: number;
  batch?: string;
  program?: string;
  scheduledDay?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  room?: string;
  id?: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export { DAYS };

function buildParams(filters: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

export function fetchTimetableFilters(): Promise<TimetableFiltersResponse> {
  return apiRequest<TimetableFiltersResponse>("/timetable/filters");
}

export function fetchTimetableSessions(filters: {
  academicYear?: string;
  program?: string;
  batch?: string;
  semester?: number;
  section?: string;
  courseId?: string;
  room?: string;
  teacherId?: string;
  day?: string;
  from?: string;
  to?: string;
  includeArchived?: boolean;
}): Promise<TimetableListResponse> {
  const params = buildParams({
    academicYear: filters.academicYear,
    program: filters.program,
    batch: filters.batch,
    semester: filters.semester,
    section: filters.section,
    courseId: filters.courseId,
    room: filters.room,
    teacherId: filters.teacherId,
    day: filters.day,
    from: filters.from,
    to: filters.to,
    includeArchived: filters.includeArchived ? "true" : undefined,
  });
  return apiRequest<TimetableListResponse>(`/timetable${params ? `?${params}` : ""}`);
}

export function fetchTimetableSession(id: string): Promise<TimetableSessionResponse> {
  return apiRequest<TimetableSessionResponse>(`/timetable/${encodeURIComponent(id)}`);
}

export function checkTimetableConflicts(payload: ConflictCheckPayload): Promise<ConflictResponse> {
  return apiRequest<ConflictResponse>("/timetable/check-conflicts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createTimetableSession(payload: CreateSessionPayload): Promise<TimetableSessionResponse> {
  return apiRequest<TimetableSessionResponse>("/timetable", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTimetableSession(
  id: string,
  payload: Partial<CreateSessionPayload> & { reason?: string },
): Promise<{ session: TimetableSession; changes?: unknown[]; notified?: string[] }> {
  return apiRequest(`/timetable/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function archiveTimetableSession(id: string): Promise<{ success: boolean; session: TimetableSession }> {
  return apiRequest(`/timetable/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function cancelTimetableSession(
  id: string,
  reason?: string,
): Promise<{ success: boolean; session: TimetableSession; changes?: unknown[]; notified?: string[] }> {
  return apiRequest(`/timetable/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || "" }),
  });
}

export interface PublishPayload {
  reason?: string;
}

export function publishTimetableSession(
  id: string,
  payload: PublishPayload = {},
): Promise<TimetableSessionResponse> {
  return apiRequest(`/timetable/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function unpublishTimetableSession(id: string): Promise<TimetableSessionResponse> {
  return apiRequest(`/timetable/${encodeURIComponent(id)}/unpublish`, {
    method: "POST",
  });
}

export function versionTimetableSession(
  id: string,
  payload: Partial<CreateSessionPayload> & {
    effectiveFrom?: string;
    effectiveTo?: string;
    reason?: string;
  },
): Promise<{ session: TimetableSession; previousVersion: number }> {
  return apiRequest(`/timetable/${encodeURIComponent(id)}/version`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function startTimetableSession(id: string): Promise<{
  session: TimetableSession;
  attendanceSessionId: string;
}> {
  return apiRequest(`/timetable/${encodeURIComponent(id)}/start`, { method: "POST" });
}

export function completeTimetableSession(id: string): Promise<{
  success: boolean;
  session: TimetableSession;
}> {
  return apiRequest(`/timetable/${encodeURIComponent(id)}/complete`, { method: "POST" });
}

export function fetchTimetableCohort(id: string): Promise<CohortResponse> {
  return apiRequest(`/timetable/${encodeURIComponent(id)}/cohort`);
}
