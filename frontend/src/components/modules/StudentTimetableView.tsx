import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faBell,
  faBookOpen,
  faCalendarDays,
  faChevronLeft,
  faClock,
  faDoorOpen,
  faHistory,
  faTriangleExclamation,
  faUserCheck,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Alert } from "../ui/Alert";
import { CardSkeleton } from "../ui/Skeleton";
import { WorkspaceLayout } from "../layout/WorkspaceLayout";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../ui/ToastContainer";
import {
  fetchMyTimetable,
  fetchTimetableNotices,
  markNoticeRead,
  TIMETABLE_NOTICE_CATEGORIES,
  type MyClassEntry,
  type MyConflict,
  type MyTimetableResponse,
  type MyTimetableView,
  type TimetableNotice,
} from "../../services/timetableApi";
import {
  formatDateKeyLong,
  formatDateKeyHeading,
} from "../../lib/institutionTime";
import { STATUS_BADGE } from "./timetableTypes";
import { roomLabel } from "../modules/timetableTypes";

/**
 * Student → Academic → My Timetable.
 *
 * A read-only view of the schedule the academic office published for the
 * student's enrolled courses. Students cannot open or close classes — they
 * see the published timetable, the attendance status of each class, and any
 * notices the academic office has sent about changes.
 */

const VIEWS: { id: MyTimetableView; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export const StudentTimetableView: React.FC = () => {
  const toast = useToast();
  const showError = (m: string) => toast.showToast(m, "error");
  const [view, setView] = useState<MyTimetableView>("week");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [data, setData] = useState<MyTimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MyClassEntry | null>(null);
  const [notices, setNotices] = useState<TimetableNotice[]>([]);
  const [noticesFailed, setNoticesFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchMyTimetable(view, anchor));
      setLoadFailed(false);
    } catch (requestError) {
      setLoadFailed(true);
      showError(
        requestError instanceof Error
          ? requestError.message
          : "Your timetable could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [view, anchor]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await fetchTimetableNotices();
        if (!active) return;
        setNotices(
          result.notifications.filter((notice) =>
            TIMETABLE_NOTICE_CATEGORIES.includes(notice.category || ""),
          ),
        );
        setNoticesFailed(false);
      } catch {
        if (active) setNoticesFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const step = (direction: -1 | 1) => {
    setNotice("");
    setError("");
    if (view === "today") return;
    const base = data?.window.start || anchor || "";
    if (!base) return;
    if (view === "week") {
      setAnchor(shiftDays(base, direction * 7));
      return;
    }
    const [year, month] = base.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, month - 1 + direction, 1, 12));
    const lastDay = new Date(
      Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0, 12),
    ).getUTCDate();
    const day = Math.min(Number(base.slice(8, 10)) || 1, lastDay);
    setAnchor(
      `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  };

  const [notice, setNotice] = useState("");

  const toolbar = (
    <>
      <div
        className="flex rounded-lg border border-slate-200 p-0.5"
        role="tablist"
        aria-label="Timetable scale"
      >
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={view === option.id}
            onClick={() => {
              setView(option.id);
              setAnchor(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === option.id
                ? "bg-[var(--color-primary)] text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view !== "today" && (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={faArrowLeft}
            onClick={() => step(-1)}
            aria-label="Previous"
          />
          <Button size="sm" variant="ghost" onClick={() => setAnchor(null)}>
            Today
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={faArrowRight}
            onClick={() => step(1)}
            aria-label="Next"
          />
        </div>
      )}
    </>
  );

  return (
    <WorkspaceLayout title="My Timetable" icon={faCalendarDays} toolbar={toolbar}>
      <div className="space-y-4 p-5">
        {error && (
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        )}
        {notice && (
          <Alert variant="success" onDismiss={() => setNotice("")}>
            {notice}
          </Alert>
        )}

        {loading && !data ? (
          <div className="space-y-3" aria-busy="true">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : loadFailed && !data ? (
          <EmptyState
            icon={faTriangleExclamation}
            title="Your timetable could not be loaded"
            description="The published timetable was not returned. Nothing is shown in its place."
            actionLabel="Retry"
            onAction={() => void load()}
          />
        ) : data && !data.published ? (
          <Card>
            <EmptyState
              icon={faCalendarDays}
              title="No classes are published for you"
              description="The academic office has not scheduled any classes against your enrolment yet."
            />
          </Card>
        ) : data ? (
          <>
            <StudentWindowSummary data={data} />

            {data.conflictCount > 0 && (
              <StudentConflictPanel
                conflicts={[
                  ...data.conflicts.teacher,
                  ...data.conflicts.room,
                  ...data.conflicts.cohort,
                ]}
              />
            )}

            {view === "today" && data.days[0] && (
              <StudentTodayView
                day={data.days[0]}
                onSelect={setSelected}
              />
            )}

            {view === "week" && (
              <StudentWeekView days={data.days} today={data.today} onSelect={setSelected} />
            )}

            {view === "month" && (
              <StudentMonthView data={data} onSelect={setSelected} />
            )}
          </>
        ) : null}

        {selected && (
          <StudentClassDetailModal entry={selected} onClose={() => setSelected(null)} />
        )}
      </div>

      {notices.length > 0 && (
        <Card
          title={notices.filter((n) => !n.read).length > 0 ? "Timetable notices" : "Notices"}
          icon={faBell}
          subtitle={notices.filter((n) => !n.read).length > 0 ? "Unread notices from the academic office." : "Recent notices from the academic office."}
        >
          <ul className="space-y-2.5">
            {notices.slice(0, 6).map((notice) => (
              <li
                key={notice.id}
                className={`rounded-lg border px-3 py-2.5 ${
                  notice.read ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{notice.title}</p>
                  {!notice.read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNotices((current) =>
                          current.map((row) =>
                            row.id === notice.id ? { ...row, read: true } : row,
                          ),
                        );
                        void markNoticeRead(notice.id).catch(() => undefined);
                      }}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                  {notice.message}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {formatTimestamp(notice.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </WorkspaceLayout>
  );
};

const StudentWindowSummary: React.FC<{ data: MyTimetableResponse }> = ({ data }) => {
  const label =
    data.view === "week"
      ? `${formatDateKeyLong(data.window.start)} – ${formatDateKeyLong(data.window.end)}`
      : formatDateKeyLong(data.window.start);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">
          {data.entries.length} class{data.entries.length === 1 ? "" : "es"} · {data.timezone}
        </p>
      </div>
    </div>
  );
};

const StudentConflictPanel: React.FC<{ conflicts: MyConflict[] }> = ({ conflicts }) => (
  <Card
    title={`${conflicts.length} timetable conflict${conflicts.length === 1 ? "" : "s"}`}
    icon={faTriangleExclamation}
    subtitle="Found in the published timetable. They are shown rather than hidden."
  >
    <ul className="space-y-2.5">
      {conflicts.map((conflict) => (
        <li
          key={conflict.id}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
        >
          <p className="text-sm font-medium text-amber-900">
            {conflictKindLabel(conflict.type)} on {conflict.day}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            {describeSide(conflict.first)} overlaps {describeSide(conflict.second)}
          </p>
        </li>
      ))}
    </ul>
  </Card>
);

const StudentTodayView: React.FC<{
  day: MyTimetableResponse["days"][number];
  onSelect: (entry: MyClassEntry) => void;
}> = ({ day, onSelect }) => {
  if (day.entries.length === 0) {
    return (
      <Card title="Today" icon={faCalendarDays}>
        <EmptyState
          icon={faCalendarDays}
          title="No classes today"
          description="Your published timetable has nothing scheduled for today."
        />
      </Card>
    );
  }

  return (
    <Card
      title={`Today · ${day.date}`}
      icon={faCalendarDays}
      subtitle={`${day.entries.length} class${day.entries.length === 1 ? "" : "es"}`}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {day.entries.map((entry) => (
          <StudentClassCard
            key={entry.id}
            entry={entry}
            onSelect={onSelect}
            compact={false}
          />
        ))}
      </div>
    </Card>
  );
};

const StudentWeekView: React.FC<{
  days: MyTimetableResponse["days"];
  today: string;
  onSelect: (entry: MyClassEntry) => void;
}> = ({ days, today, onSelect }) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {days.map((day) => {
      const heading = formatDateKeyHeading(day.date);
      return (
        <Card
          key={day.date}
          title={heading.weekday}
          subtitle={`${heading.day} ${heading.month}`}
          icon={day.isToday ? faCalendarDays : faCalendarDays}
          headerAction={
            day.isToday ? (
              <Badge variant="primary" size="sm">
                Today
              </Badge>
            ) : undefined
          }
        >
          {day.entries.length === 0 ? (
            <p className="text-xs text-slate-400">No class</p>
          ) : (
            <div className="space-y-2.5">
              {day.entries.map((entry) => (
                <StudentClassCard
                  key={entry.id}
                  entry={entry}
                  onSelect={onSelect}
                  compact
                />
              ))}
            </div>
          )}
        </Card>
      );
    })}
  </div>
);

const StudentMonthView: React.FC<{
  data: MyTimetableResponse;
  onSelect: (entry: MyClassEntry) => void;
}> = ({ data, onSelect }) => {
  const byDate = useMemo(() => {
    const map = new Map<string, MyClassEntry[]>();
    for (const day of data.days) map.set(day.date, day.entries);
    return map;
  }, [data.days]);

  const weeks = getInstitutionMonthGrid(data.window.start);

  if (!weeks.length) {
    return (
      <Card title="Month" icon={faCalendarDays}>
        <EmptyState
          icon={faCalendarDays}
          title="This month could not be laid out"
          description="The window the server returned is not a month this calendar can draw."
        />
      </Card>
    );
  }

  return (
    <Card title={formatMonthHeading(data.window.start)} icon={faCalendarDays}>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <div
            key={label}
            className="bg-slate-50 px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {label}
          </div>
        ))}
        {weeks.map((week) =>
          week.map((date) => {
            const entries = byDate.get(date) || [];
            const inMonth = isSameInstitutionMonth(date, data.window.start);
            const isToday = date === data.today;
            const day = Number(date.slice(8, 10));
            return (
              <div
                key={date}
                className={`min-h-24 bg-white p-1.5 ${inMonth ? "" : "bg-slate-50/70"}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium ${
                      isToday
                        ? "font-bold text-[var(--color-primary)]"
                        : inMonth
                          ? "text-slate-600"
                          : "text-slate-300"
                    }`}
                  >
                    {day}
                  </span>
                  {isToday && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
                  )}
                </div>
                <div className="mt-1 space-y-1">
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onSelect(entry)}
                      className={`block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium ${
                        entry.status === "COMPLETED"
                          ? "bg-slate-100 text-slate-500"
                          : entry.status === "IN_PROGRESS"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                      }`}
                      title={`${entry.startTime}–${entry.endTime} · ${entry.courseCode || "Class"} · section ${entry.sectionCode}`}
                    >
                      {entry.startTime} {entry.courseCode || "Class"}
                    </button>
                  ))}
                </div>
              </div>
            );
          }),
        )}
      </div>
    </Card>
  );
};

const StudentClassCard: React.FC<{
  entry: MyClassEntry;
  onSelect: (entry: MyClassEntry) => void;
  compact?: boolean;
}> = ({ entry, onSelect, compact }) => (
  <div
    className={`rounded-lg border p-2.5 text-left transition ${
      entry.status === "COMPLETED"
        ? "border-slate-200 bg-slate-50"
        : "border-slate-200 bg-white hover:border-slate-300"
    }`}
  >
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className="w-full text-left"
      aria-label={`Open ${entry.courseCode || "Class"} section ${entry.sectionCode}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">
          {entry.startTime}–{entry.endTime}
        </span>
        {STATUS_BADGE[entry.status]?.variant && (
          <Badge variant={STATUS_BADGE[entry.status]?.variant} size="sm">
            {STATUS_BADGE[entry.status]?.label}
          </Badge>
        )}
      </div>
      <p className="mt-1 truncate text-sm font-medium text-slate-900">
        {entry.courseCode || "Class"}
      </p>
      {!compact && entry.courseName && (
        <p className="truncate text-xs text-slate-500">{entry.courseName}</p>
      )}
      <p className="mt-0.5 truncate text-xs text-slate-500">
        Section {entry.sectionCode}
        {entry.room ? ` · ${roomLabel(entry.room, entry.building)}` : ""}
      </p>
      {entry.attendanceRecorded && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <FontAwesomeIcon
            icon={faUserCheck}
            className="text-[var(--color-attendance-late)]"
            aria-hidden="true"
          />
          <span className="text-slate-600">
            {entry.attendanceStatus === "OPEN" ? "Register open" : "Attendance taken"}
          </span>
        </div>
      )}
    </button>
  </div>
);

const StudentClassDetailModal: React.FC<{
  entry: MyClassEntry;
  onClose: () => void;
}> = ({ entry, onClose }) => (
  <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-class-title"
      className="relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="rotate-180 text-sm" aria-hidden="true" />
      </button>

      <h2 id="student-class-title" className="text-lg font-semibold text-slate-900 mb-4">
        {entry.courseCode || "Class"} · Section {entry.sectionCode}
      </h2>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fact label="Course" value={`${entry.courseCode || "—"}${entry.courseName ? ` · ${entry.courseName}` : ""}`} />
        <Fact label="Section" value={`Section ${entry.sectionCode}`} />
        <Fact label="Faculty" value={entry.facultyName || "—"} />
        <Fact label="Room" value={entry.room ? roomLabel(entry.room, entry.building) : "Not allocated"} />
        <Fact label="Time" value={`${entry.startTime}–${entry.endTime} · ${entry.scheduledDay}`} />
        <Fact
          label="Class session"
          value={
            <span className="flex items-center gap-1.5">
              {STATUS_BADGE[entry.status] && (
                <Badge variant={STATUS_BADGE[entry.status]!.variant} size="sm">
                  {STATUS_BADGE[entry.status]!.label}
                </Badge>
              )}
            </span>
          }
        />
        <Fact
          label="Attendance"
          value={
            entry.attendanceRecorded
              ? entry.attendanceStatus === "OPEN"
                ? "Register open"
                : "Register closed"
              : "Not started"
          }
        />
        <Fact label="Cohort size" value={entry.studentCount ? `${entry.studentCount} enrolled` : "—"} />
      </dl>

      {entry.notes && (
        <p className="mt-4 text-sm text-slate-600">{entry.notes}</p>
      )}

      <div className="mt-5 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  </div>
);

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
  </div>
);

function conflictKindLabel(type: MyConflict["type"]): string {
  if (type === "ROOM_CONFLICT") return "Room double-booked";
  if (type === "SECTION_CONFLICT") return "Cohort booked twice";
  return "Teacher double-booked";
}

function describeSide(side: MyConflict["first"]): string {
  return `${side.courseCode || "Class"}${side.courseName ? ` · ${side.courseName}` : ""}, section ${side.sectionCode}, ${side.startTime}–${side.endTime}${side.room ? ` in ${side.room}` : ""}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

function shiftDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getInstitutionMonthGrid(start: string): string[][] {
  const [year, month] = start.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1, 12));
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const firstDayOfWeek = firstDay.getUTCDay();
  const weeks: string[][] = [];
  let week: string[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    week.push("");
  }
  for (let day = 1; day <= lastDay; day++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    week.push(dateKey);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push("");
    weeks.push(week);
  }
  return weeks;
}

function isSameInstitutionMonth(dateKey: string, reference: string): boolean {
  return dateKey.slice(0, 7) === reference.slice(0, 7);
}

function formatMonthHeading(start: string): string {
  const [year, month] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1, 12));
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
