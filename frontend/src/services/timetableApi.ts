import { apiRequest } from "./apiClient";

/**
 * Faculty My Timetable — the teacher's own schedule.
 *
 * Every function here is a thin, typed call onto an endpoint that already existed.
 * The view is a reader of the academic office's published timetable, not a second
 * schedule: there is no client-side cache of "my classes" that could disagree with
 * the record the registrar published and the conflict engine validates.
 */

export type MyTimetableView = "today" | "week" | "month";

/** How a class session is being delivered. Mirrors `TIMETABLE_SESSION_STATUSES`. */
export type MyClassStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

/** One teaching session declared against a class. */
export interface MyClassTeachingRecord {
  id: string;
  taughtOn: string;
  materialId: string;
  materialTitle: string | null;
  materialVersion: number;
  fromUnit: number;
  toUnit: number;
  totalUnits: number | null;
  unitLabel: "slide" | "page" | "section";
  topic: string;
  nextStartUnit: number | null;
  sectionCode: string | null;
  sessionName: string;
}

/**
 * What the teacher has declared they covered in one class.
 *
 * A list rather than a single position, because one class is normally taught from
 * more than one material. `recordCount: 0` means nothing has been recorded yet,
 * which is a fact about the record — not evidence that the class did not happen.
 */
export interface MyClassTeaching {
  recordCount: number;
  materialsTouched: number;
  lastTaughtOn: string | null;
  records: MyClassTeachingRecord[];
}

/** One field edit on a class, as recorded when the academic office saved it. */
export interface TimetableChangeEntry {
  field: string;
  from: string | null;
  to: string | null;
  changedBy: string | null;
  changedByName: string;
  reason: string;
  changedAt: string;
  /** Whether the affected teacher was actually told. */
  notifiedFaculty: string | null;
  notifiedAt: string | null;
}

/**
 * One class in the caller's own timetable.
 *
 * Every field is a fact about a real `Timetable` record: the course it belongs to,
 * the cohort it is delivered to, the teacher who holds it, where and when it runs,
 * its lifecycle, whether an attendance register is attached, and what the teacher
 * has recorded teaching in it.
 */
export interface MyClassEntry {
  id: string;
  courseId: string;
  courseCode: string | null;
  courseName: string | null;
  program: string | null;
  semester: number | null;
  sectionCode: string;
  batch: string | null;
  academicYear: string | null;
  room: string | null;
  building: string | null;
  scheduledDay: string;
  dayIndex: number | null;
  date: string | null;
  startTime: string;
  endTime: string;
  sessionType: string;
  status: MyClassStatus;
  notes: string;
  facultyUserId: string;
  facultyName: string | null;
  studentCount: number;
  attendanceSessionId: string | null;
  attendanceStatus: "OPEN" | "CLOSED" | null;
  attendanceRecorded: boolean;
  classTopic: string | null;
  teaching: MyClassTeaching;
  changes: TimetableChangeEntry[];
  createdAt: string | null;
  updatedAt: string | null;
  /** The date this occurrence falls on, resolved for a recurring weekday. */
  occurrenceDate: string;
}

/** One side of a clash, in enough detail to recognise the class. */
export interface MyConflictSide {
  id: string;
  courseCode: string | null;
  courseName: string | null;
  sectionCode: string;
  startTime: string;
  endTime: string;
  room: string | null;
  building: string | null;
  facultyName: string | null;
  sessionType: string;
}

export type MyConflictKind = "TEACHER_CONFLICT" | "ROOM_CONFLICT" | "SECTION_CONFLICT";

export interface MyConflict {
  id: string;
  type: MyConflictKind;
  day: string;
  first: MyConflictSide;
  second: MyConflictSide;
}

export interface MyTimetableDay {
  date: string;
  dayName: string | null;
  isToday: boolean;
  entries: MyClassEntry[];
}

export interface MyTimetableResponse {
  timezone: string;
  today: string;
  view: MyTimetableView;
  /** TEACHER for faculty, STUDENT for an enrolled student. Read-only for display. */
  perspective: "TEACHER" | "STUDENT";
  window: { start: string; end: string };
  days: MyTimetableDay[];
  entries: MyClassEntry[];
  conflicts: {
    teacher: MyConflict[];
    room: MyConflict[];
    cohort: MyConflict[];
    total: number;
  };
  conflictCount: number;
  /** False when the academic office has published nothing for this caller. */
  published: boolean;
  changes: (TimetableChangeEntry & {
    sessionId: string;
    courseCode: string | null;
    courseName: string | null;
    sectionCode: string;
    startTime: string;
    endTime: string;
    room: string | null;
  })[];
}

/**
 * The caller's own timetable for one window.
 *
 * `anchor` is an institution-local `YYYY-MM-DD`, not a UTC instant: the server
 * resolves "today" in the institution's timezone, and a browser sending its own
 * local date would be a day out for anyone outside it.
 */
export function fetchMyTimetable(
  view: MyTimetableView,
  anchor?: string | null,
): Promise<MyTimetableResponse> {
  const params = new URLSearchParams({ view });
  if (anchor) params.set("anchor", anchor);
  return apiRequest<MyTimetableResponse>(`/my-timetable?${params.toString()}`);
}

/** The change history for the caller's own schedule, newest first. */
export function fetchMyTimetableChanges(): Promise<{
  changes: MyTimetableResponse["changes"];
  count: number;
  timezone: string;
}> {
  return apiRequest("/my-timetable/changes");
}

/**
 * Opens a class: the session becomes in progress and is connected to the
 * attendance register for the same course, section, date and time.
 *
 * This is the existing connected flow, not a second one — it is the only path that
 * produces an `attendanceSessionId` a teaching record can be attached to. An
 * already-open register for the same class is reused rather than duplicated, so
 * pressing this twice does not create two registers.
 */
export function startClassSession(sessionId: string): Promise<{
  session: { id: string; status: MyClassStatus; attendanceSessionId: string | null };
  attendanceSessionId: string;
}> {
  return apiRequest(`/timetable/${sessionId}/start`, { method: "POST" });
}

/** Closes a class session. Does not close the attendance register; that is separate. */
export function completeClassSession(sessionId: string): Promise<{
  session: { id: string; status: MyClassStatus };
}> {
  return apiRequest(`/timetable/${sessionId}/complete`, { method: "POST" });
}

/**
 * Reports a clash to the roles that can resolve it.
 *
 * Deliberately a report and not a fix: moving a class moves it for real students,
 * so that stays with the academic office. Only a teacher holding one of the two
 * classes may file the report, and the server checks that.
 */
export function reportTimetableConflict(input: {
  sessionId: string;
  otherSessionId?: string | null;
  note?: string;
}): Promise<{ success: boolean; recipients: number; message: string }> {
  return apiRequest("/my-timetable/conflicts/report", {
    method: "POST",
    body: JSON.stringify({
      sessionId: input.sessionId,
      otherSessionId: input.otherSessionId || null,
      note: input.note || "",
    }),
  });
}

/** A material belonging to the class's course, for the teaching-progress action. */
export interface MyClassMaterial {
  id: string;
  title: string;
  weekId: string | null;
  weekNumber: number | null;
  version: number;
}

/** Week detail read for the materials action, with the week's own materials. */
export interface MyClassWeek {
  id: string;
  weekNumber: number;
  title: string;
  materials: MyClassMaterial[];
}

/**
 * A notice from the centralised CollegeOS notification feed.
 *
 * Read from `/api/notifications` rather than a timetable-specific table, because
 * that is where every other CollegeOS message already goes: an academic office that
 * learned about a cancelled class through one channel and a clash through another
 * would be a channel problem to debug at the worst possible moment.
 */
export interface TimetableNotice {
  id: string;
  title: string;
  message: string;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  read: boolean;
  actionUrl: string | null;
  created_at: string;
}

/**
 * The caller's own notices, newest first.
 *
 * The endpoint is not filtered by category — it has no such parameter — so the
 * caller receives its own notifications and picks out the timetable ones. That is
 * safe because the endpoint is already scoped to the session user, and a
 * `timetable` category is a free-form string on the server rather than an enum that
 * would need a migration to extend.
 */
export function fetchTimetableNotices(): Promise<{
  notifications: TimetableNotice[];
  unreadCount: number;
}> {
  return apiRequest("/notifications");
}

/** Marks one notice read, so the unread count reflects what has been looked at. */
export function markNoticeRead(noticeId: string): Promise<{ success: boolean }> {
  return apiRequest(`/notifications/${noticeId}/read`, { method: "PATCH" });
}

/** The timetable notice categories this view shows. */
export const TIMETABLE_NOTICE_CATEGORIES = ["timetable", "timetable_conflict"];
