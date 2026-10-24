import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  faArrowLeft,
  faArrowRight,
  faBell,
  faBookOpen,
  faCalendarCheck,
  faCalendarDays,
  faClipboardList,
  faClock,
  faDoorOpen,
  faFilePen,
  faFolderOpen,
  faGraduationCap,
  faHistory,
  faTriangleExclamation,
  faUserCheck,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { CardSkeleton } from "../ui/Skeleton";
import { WorkspaceLayout } from "../layout/WorkspaceLayout";
import { useCollegeOS } from "../../context/CollegeOSContext";
import {
  completeClassSession,
  fetchMyTimetable,
  fetchTimetableNotices,
  markNoticeRead,
  reportTimetableConflict,
  startClassSession,
  TIMETABLE_NOTICE_CATEGORIES,
} from "../../services/timetableApi";
import type {
  MyClassEntry,
  MyConflict,
  MyTimetableResponse,
  MyTimetableView,
  TimetableNotice,
} from "../../services/timetableApi";
import {
  formatDateKeyLong,
  formatDateKeyHeading,
  getInstitutionDateParts,
  getInstitutionMonthGrid,
  isSameInstitutionMonth,
  formatMonthHeading,
  parseScheduleTime,
} from "../../lib/institutionTime";

/**
 * Faculty → Academic → My Timetable.
 *
 * A teacher's day, read from the schedule the academic office published. It shows
 * one class with everything the teacher needs about it in one place: which course,
 * which cohort, who is teaching it, where, when, the class session's own state,
 * whether an attendance register is attached, and what they have already recorded
 * having covered in it.
 *
 * The three views are the same data at three scales — today for the room, the week
 * for planning, the month for the term ahead. Nothing is recomputed here: the
 * window, the conflict detection and the change history all come from the server,
 * so this view cannot disagree with the record the registrar published.
 *
 * Actions hand off to the systems that already own each job. Opening a class
 * connects it to the existing attendance register; taking attendance opens that
 * register rather than rebuilding it; materials, assignments and teaching progress
 * belong to the course workspace and are reached through it.
 */

const VIEWS: { id: MyTimetableView; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export const FacultyMyTimetableView: React.FC = () => {
  const { openCourse, setActiveView, openAttendanceSession } = useCollegeOS();
  const [view, setView] = useState<MyTimetableView>("week");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [data, setData] = useState<MyTimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MyClassEntry | null>(null);
  const [reporting, setReporting] = useState<MyConflict | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [notices, setNotices] = useState<TimetableNotice[]>([]);
  const [noticesFailed, setNoticesFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchMyTimetable(view, anchor));
      setLoadFailed(false);
    } catch (requestError) {
      setLoadFailed(true);
      setError(
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

  /**
   * The caller's timetable notices.
   *
   * Read from the same notification feed the rest of CollegeOS writes to, and kept
   * separate from the schedule: a notice about a class that is not in this window
   * is still worth seeing, and an unreachable feed must not stop the schedule from
   * drawing. It is supporting context and fails on its own terms.
   */
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await fetchTimetableNotices();
        if (!active) return;
        setNotices(
          result.notifications.filter((notice) =>
            TIMETABLE_NOTICE_CATEGORIES.includes(notice.category),
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

  /**
   * Steps the window.
   *
   * The anchor is an institution-local date, never the browser's, and the step
   * matches the scale being viewed: a day for the week, a month for the month. The
   * server resolves which dates that covers, so there is no second window
   * calculation here that could disagree with the one it uses.
   */
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

  const openClass = async (entry: MyClassEntry) => {
    setBusyId(entry.id);
    try {
      // The one connected flow: the session goes in progress and is linked to the
      // attendance register for this exact class. An already-open register is reused,
      // so pressing this twice never leaves a teacher with two registers.
      await startClassSession(entry.id);
      await load();
      setNotice(
        `${entry.courseCode || "Class"} is open. Its attendance register is now attached to this class.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The class could not be opened.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const closeClass = async (entry: MyClassEntry) => {
    setBusyId(entry.id);
    try {
      await completeClassSession(entry.id);
      await load();
      setNotice(`${entry.courseCode || "Class"} marked complete.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The class could not be closed.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const goToAttendance = (entry: MyClassEntry) => {
    // Hands over to the attendance module rather than reimplementing it. The
    // session id is passed so the teacher lands on this class's register and not
    // on whichever one happens to be open.
    openAttendanceSession(entry.attendanceSessionId);
    setActiveView("attendance_sheet");
  };

  const goToMaterials = (entry: MyClassEntry) => openCourse(entry.courseId);
  const goToAssignments = (entry: MyClassEntry) => openCourse(entry.courseId);

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
            description="The academic office's schedule was not returned. Nothing has been shown in its place."
            actionLabel="Retry"
            actionIcon={faArrowLeft}
            onAction={() => void load()}
          />
        ) : data && !data.published ? (
          <Card>
            <EmptyState
              icon={faCalendarDays}
              title="No classes are published for you"
              description="The academic office has not scheduled any classes against your teaching assignments yet. This is the published timetable, not a filtered list — nothing has been left out."
            />
          </Card>
        ) : data ? (
          <>
            <WindowSummary data={data} />

            <NoticePanel
              notices={notices}
              failed={noticesFailed}
              onDismiss={async (notice) => {
                setNotices((current) =>
                  current.map((row) =>
                    row.id === notice.id ? { ...row, read: true } : row,
                  ),
                );
                try {
                  await markNoticeRead(notice.id);
                } catch {
                  // The notice is already hidden locally; the unread count on the
                  // server will catch up on the next load. Failing loudly here would
                  // undo the reading the teacher just did.
                }
              }}
            />

            {data.conflictCount > 0 && (
              <ConflictPanel
                conflicts={[
                  ...data.conflicts.teacher,
                  ...data.conflicts.room,
                  ...data.conflicts.cohort,
                ]}
                onReport={setReporting}
              />
            )}

            {view === "today" && (
              <TodayView
                day={data.days[0] || null}
                busyId={busyId}
                onOpenClass={openClass}
                onCloseClass={closeClass}
                onSelect={setSelected}
                onGoToAttendance={goToAttendance}
              />
            )}

            {view === "week" && (
              <WeekView
                days={data.days}
                today={data.today}
                busyId={busyId}
                onOpenClass={openClass}
                onCloseClass={closeClass}
                onSelect={setSelected}
                onGoToAttendance={goToAttendance}
              />
            )}

            {view === "month" && (
              <MonthView
                data={data}
                onSelect={setSelected}
                onGoToAttendance={goToAttendance}
              />
            )}

            {data.changes.length > 0 && (
              <Card
                title="Recent changes to your classes"
                icon={faHistory}
                subtitle="Recorded when the academic office saved a timetable edit, and whether you were told."
                headerAction={
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowChanges((current) => !current)}
                    aria-expanded={showChanges}
                  >
                    {showChanges ? "Hide" : `Show all ${data.changes.length}`}
                  </Button>
                }
              >
                <ChangeList changes={data.changes.slice(0, 5)} />
                {showChanges && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <ChangeList changes={data.changes} />
                  </div>
                )}
              </Card>
            )}
          </>
        ) : null}
      </div>

      {selected && (
        <ClassDetailModal
          entry={selected}
          busy={busyId === selected.id}
          onClose={() => setSelected(null)}
          onOpenClass={async () => {
            await openClass(selected);
            setSelected(null);
          }}
          onCloseClass={async () => {
            await closeClass(selected);
            setSelected(null);
          }}
          onGoToAttendance={() => {
            goToAttendance(selected);
            setSelected(null);
          }}
          onGoToMaterials={() => {
            goToMaterials(selected);
            setSelected(null);
          }}
          onGoToAssignments={() => {
            goToAssignments(selected);
            setSelected(null);
          }}
        />
      )}

      {reporting && (
        <ReportConflictModal
          conflict={reporting}
          onClose={() => setReporting(null)}
          onReported={(count) => {
            setReporting(null);
            setNotice(
              count > 0
                ? `Reported to ${count} academic administrator(s) who can resolve timetable assignments.`
                : "No academic administrator currently holds timetable resolution rights.",
            );
          }}
          onError={setError}
        />
      )}
    </WorkspaceLayout>
  );
};

/**
 * Notices the academic office's changes have generated for this teacher.
 *
 * These arrive through CollegeOS's own notification feed, so the same message the
 * recipient would see in the navbar also sits next to the schedule it changed. The
 * change trail below is the record; this is the alert.
 */
const NoticePanel: React.FC<{
  notices: TimetableNotice[];
  failed: boolean;
  onDismiss: (notice: TimetableNotice) => void;
}> = ({ notices, failed, onDismiss }) => {
  if (failed) {
    return (
      <Alert variant="warning">
        Timetable notices could not be loaded. The schedule below is unaffected.
      </Alert>
    );
  }

  const unread = notices.filter((notice) => !notice.read);
  if (!notices.length) return null;

  return (
    <Card
      title={unread.length ? `${unread.length} unread notice(s)` : "Notices"}
      icon={faBell}
      subtitle="Changes to your classes, from the academic office."
      headerAction={
        unread.length ? (
          <Badge variant="warning" size="sm">
            {unread.length} new
          </Badge>
        ) : undefined
      }
    >
      <ul className="space-y-2.5">
        {notices.slice(0, 6).map((notice) => (
          <li
            key={notice.id}
            className={`rounded-lg border px-3 py-2.5 ${
              notice.read
                ? "border-slate-200 bg-white"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{notice.title}</p>
              <div className="flex items-center gap-2">
                {notice.priority === "high" || notice.priority === "urgent" ? (
                  <Badge variant="warning" size="sm">
                    Action needed
                  </Badge>
                ) : null}
                {!notice.read && (
                  <Button size="sm" variant="ghost" onClick={() => onDismiss(notice)}>
                    Mark read
                  </Button>
                )}
              </div>
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
  );
};

/** The window being shown, in words, so the three views are self-labelling. */
const WindowSummary: React.FC<{ data: MyTimetableResponse }> = ({ data }) => {
  const label =
    data.view === "month"
      ? formatMonthHeading(data.window.start)
      : data.view === "week"
        ? `${formatDateKeyLong(data.window.start)} – ${formatDateKeyLong(data.window.end)}`
        : formatDateKeyLong(data.window.start);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">
          {data.entries.length} class{data.entries.length === 1 ? "" : "es"} ·{" "}
          {data.timezone}
          {data.perspective === "TEACHER" ? " · your teaching assignments" : ""}
        </p>
      </div>
    </div>
  );
};

/** One class, in a form that fits in a day column. */
const ClassCard: React.FC<{
  entry: MyClassEntry;
  busy: boolean;
  compact?: boolean;
  onOpenClass: (entry: MyClassEntry) => Promise<void>;
  onCloseClass: (entry: MyClassEntry) => Promise<void>;
  onSelect: (entry: MyClassEntry) => void;
  onGoToAttendance: (entry: MyClassEntry) => void;
}> = ({ entry, busy, compact, onOpenClass, onCloseClass, onSelect, onGoToAttendance }) => (
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
      aria-label={`Open ${entry.courseCode} section ${entry.sectionCode}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">
          {entry.startTime}–{entry.endTime}
        </span>
        <ClassStatusBadge status={entry.status} />
      </div>
      <p className="mt-1 truncate text-sm font-medium text-slate-900">
        {entry.courseCode || "Class"}
      </p>
      {!compact && entry.courseName && (
        <p className="truncate text-xs text-slate-500">{entry.courseName}</p>
      )}
      <p className="mt-0.5 truncate text-xs text-slate-500">
        Section {entry.sectionCode}
        {entry.room ? ` · ${roomLabel(entry)}` : ""}
      </p>

      {/* Attendance and teaching progress, stated as two separate facts. */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {entry.attendanceRecorded && (
          <Badge variant={entry.attendanceStatus === "OPEN" ? "warning" : "success"} size="sm">
            {entry.attendanceStatus === "OPEN" ? "Register open" : "Attendance taken"}
          </Badge>
        )}
        {entry.teaching.recordCount > 0 ? (
          <Badge variant="info" size="sm">
            {entry.teaching.recordCount} taught
          </Badge>
        ) : (
          !compact && <Badge variant="neutral" size="sm">Not recorded</Badge>
        )}
      </div>
    </button>

    <div className="mt-2 flex flex-wrap gap-1">
      {entry.status === "IN_PROGRESS" ? (
        <Button
          size="sm"
          variant="ghost"
          icon={faCalendarCheck}
          disabled={busy}
          onClick={() => void onCloseClass(entry)}
        >
          Complete
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          icon={faDoorOpen}
          disabled={busy || entry.status === "COMPLETED"}
          onClick={() => void onOpenClass(entry)}
        >
          Open class
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        icon={faUserCheck}
        disabled={!entry.attendanceRecorded}
        onClick={() => onGoToAttendance(entry)}
        title={
          entry.attendanceRecorded
            ? "Open the attendance register for this class"
            : "Open the class first to attach its attendance register"
        }
      >
        Attendance
      </Button>
    </div>
  </div>
);

const TodayView: React.FC<{
  day: MyTimetableResponse["days"][number] | null;
  busyId: string | null;
  onOpenClass: (entry: MyClassEntry) => Promise<void>;
  onCloseClass: (entry: MyClassEntry) => Promise<void>;
  onSelect: (entry: MyClassEntry) => void;
  onGoToAttendance: (entry: MyClassEntry) => void;
}> = ({ day, busyId, onOpenClass, onCloseClass, onSelect, onGoToAttendance }) => {
  if (!day || day.entries.length === 0) {
    return (
      <Card title="Today" icon={faCalendarDays}>
        <EmptyState
          icon={faCalendarCheck}
          title="No classes today"
          description="Your published timetable has nothing scheduled for today. This is the schedule itself reporting an empty day, not a filter hiding classes."
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
          <ClassCard
            key={entry.id}
            entry={entry}
            busy={busyId === entry.id}
            onOpenClass={onOpenClass}
            onCloseClass={onCloseClass}
            onSelect={onSelect}
            onGoToAttendance={onGoToAttendance}
          />
        ))}
      </div>
    </Card>
  );
};

/**
 * The week, in the order the server sent it.
 *
 * The server's window is Monday-first and the shared `institutionTime` week helper
 * is Sunday-first. Rendering the server's `days` as they arrive avoids choosing
 * between them, and keeps the order the schedule is actually published in.
 */
const WeekView: React.FC<{
  days: MyTimetableResponse["days"];
  today: string;
  busyId: string | null;
  onOpenClass: (entry: MyClassEntry) => Promise<void>;
  onCloseClass: (entry: MyClassEntry) => Promise<void>;
  onSelect: (entry: MyClassEntry) => void;
  onGoToAttendance: (entry: MyClassEntry) => void;
}> = ({ days, today, busyId, onOpenClass, onCloseClass, onSelect, onGoToAttendance }) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {days.map((day) => {
      const heading = formatDateKeyHeading(day.date);
      return (
        <Card
          key={day.date}
          title={heading.weekday}
          subtitle={`${heading.day} ${heading.month}`}
          icon={day.isToday ? faCalendarCheck : faCalendarDays}
          headerAction={
            day.isToday ? (
              <Badge variant="primary" size="sm">
                Today
              </Badge>
            ) : day.date === today ? null : undefined
          }
        >
          {day.entries.length === 0 ? (
            <p className="text-xs text-slate-400">No class</p>
          ) : (
            <div className="space-y-2.5">
              {day.entries.map((entry) => (
                <ClassCard
                  key={entry.id}
                  entry={entry}
                  compact
                  busy={busyId === entry.id}
                  onOpenClass={onOpenClass}
                  onCloseClass={onCloseClass}
                  onSelect={onSelect}
                  onGoToAttendance={onGoToAttendance}
                />
              ))}
            </div>
          )}
        </Card>
      );
    })}
  </div>
);

/**
 * The month.
 *
 * The server sends only the days that have classes, so the grid is built here from
 * the month the server's window is in and those days are looked up by date. Cells
 * from the neighbouring months are drawn so the shape of the month is visible, and
 * are marked as such rather than being filled with a neighbour's teaching.
 */
const MonthView: React.FC<{
  data: MyTimetableResponse;
  onSelect: (entry: MyClassEntry) => void;
  onGoToAttendance: (entry: MyClassEntry) => void;
}> = ({ data, onSelect, onGoToAttendance }) => {
  const byDate = useMemo(() => {
    const map = new Map<string, MyClassEntry[]>();
    for (const day of data.days) map.set(day.date, day.entries);
    return map;
  }, [data.days]);

  const weeks = getInstitutionMonthGrid(data.window.start);
  const headings = formatDateKeyHeading(data.days[0]?.date || data.window.start);

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
                      onDoubleClick={() => onGoToAttendance(entry)}
                      className={`block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium ${
                        entry.status === "COMPLETED"
                          ? "bg-slate-100 text-slate-500"
                          : entry.status === "IN_PROGRESS"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                      }`}
                      title={`${entry.startTime}–${entry.endTime} · ${entry.courseCode} · section ${entry.sectionCode}`}
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
      <p className="mt-2 text-xs text-slate-500">
        Week shown from Sunday. A class opens on its own card — the month grid is for
        seeing the shape of the term, not for marking attendance.
      </p>
      <span className="sr-only">{headings.weekday}</span>
    </Card>
  );
};

/**
 * Everything about one class, and the five actions.
 *
 * The two course-level actions hand over to the course workspace, which already owns
 * materials, assignments and teaching progress. Nothing here reaches around it.
 */
const ClassDetailModal: React.FC<{
  entry: MyClassEntry;
  busy: boolean;
  onClose: () => void;
  onOpenClass: () => Promise<void>;
  onCloseClass: () => Promise<void>;
  onGoToAttendance: () => void;
  onGoToMaterials: () => void;
  onGoToAssignments: () => void;
}> = ({
  entry,
  busy,
  onClose,
  onOpenClass,
  onCloseClass,
  onGoToAttendance,
  onGoToMaterials,
  onGoToAssignments,
}) => (
  <Modal
    isOpen
    onClose={onClose}
    title={`${entry.courseCode || "Class"} · Section ${entry.sectionCode}`}
    subtitle={entry.courseName || undefined}
    maxWidth="lg"
    footer={
      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
    }
  >
    <div className="space-y-5">
      <ClassFacts entry={entry} />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Actions
        </h3>
        <div className="flex flex-wrap gap-2">
          {entry.status === "IN_PROGRESS" ? (
            <Button
              icon={faCalendarCheck}
              disabled={busy}
              onClick={() => void onCloseClass()}
            >
              Complete class
            </Button>
          ) : (
            <Button
              icon={faDoorOpen}
              disabled={busy || entry.status === "COMPLETED"}
              onClick={() => void onOpenClass()}
            >
              Open class
            </Button>
          )}
          <Button
            variant="secondary"
            icon={faUserCheck}
            disabled={!entry.attendanceRecorded}
            onClick={onGoToAttendance}
          >
            Take attendance
          </Button>
          <Button
            variant="secondary"
            icon={faFolderOpen}
            onClick={onGoToMaterials}
          >
            Materials
          </Button>
          <Button
            variant="secondary"
            icon={faFilePen}
            onClick={onGoToAssignments}
          >
            Assignments
          </Button>
        </div>
        {!entry.attendanceRecorded && (
          <p className="mt-2 text-xs text-slate-500">
            Attendance needs this class to be open first. Opening it connects the class
            to the register for this course, section, date and time.
          </p>
        )}
      </div>

      <TeachingProgressBlock entry={entry} />

      {entry.changes.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Changes to this class
          </h3>
          <ChangeList
            changes={entry.changes.map((change) => ({
              ...change,
              sessionId: entry.id,
              courseCode: entry.courseCode,
              courseName: entry.courseName,
              sectionCode: entry.sectionCode,
              startTime: entry.startTime,
              endTime: entry.endTime,
              room: entry.room,
            }))}
          />
        </div>
      )}
    </div>
  </Modal>
);

/** The connections the class has, each read from the record. */
const ClassFacts: React.FC<{ entry: MyClassEntry }> = ({ entry }) => {
  const now = getInstitutionDateParts();
  const start = parseScheduleTime(entry.startTime);
  const end = parseScheduleTime(entry.endTime);
  const running =
    start !== null && end !== null && now.minutesSinceMidnight >= start && now.minutesSinceMidnight < end;

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Fact
        icon={faBookOpen}
        label="Course"
        value={`${entry.courseCode || "—"}${entry.courseName ? ` · ${entry.courseName}` : ""}`}
      />
      <Fact icon={faUsers} label="Section" value={`Section ${entry.sectionCode}`} />
      <Fact icon={faGraduationCap} label="Faculty" value={entry.facultyName || "You"} />
      <Fact
        icon={faDoorOpen}
        label="Room"
        value={entry.room ? roomLabel(entry) : "Not allocated"}
      />
      <Fact
        icon={faClock}
        label="Time"
        value={`${entry.scheduledDay} ${entry.startTime}–${entry.endTime}`}
      />
      <Fact
        icon={faCalendarCheck}
        label="Class session"
        value={
          <span className="flex items-center gap-1.5">
            <ClassStatusBadge status={entry.status} />
            {running && (
              <Badge variant="warning" size="sm">
                Now
              </Badge>
            )}
          </span>
        }
      />
      <Fact
        icon={faUserCheck}
        label="Attendance"
        value={
          entry.attendanceRecorded
            ? entry.attendanceStatus === "OPEN"
              ? "Register open"
              : "Register closed"
            : "Not started"
        }
      />
      <Fact
        icon={faClipboardList}
        label="Cohort size"
        value={entry.studentCount ? `${entry.studentCount} enrolled` : "No enrolment"}
      />
      <Fact
        icon={faGraduationCap}
        label="Teaching progress"
        value={
          entry.teaching.recordCount === 0
            ? "Nothing recorded"
            : `${entry.teaching.recordCount} session${
                entry.teaching.recordCount === 1 ? "" : "s"
              } · ${entry.teaching.materialsTouched} material${
                entry.teaching.materialsTouched === 1 ? "" : "s"
              }`
        }
      />
    </dl>
  );
};

/**
 * What the teacher has recorded covering in this class.
 *
 * These are the teacher's own declarations, linked to this class by the session id
 * the recording form sent. The panel also states plainly what happens next, because
 * a class that was taught and never recorded looks identical to one that was not
 * taught, and only the teacher can resolve that.
 */
const TeachingProgressBlock: React.FC<{ entry: MyClassEntry }> = ({ entry }) => {
  if (entry.teaching.recordCount === 0) {
    return (
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Teaching progress
        </h3>
        <p className="text-sm text-slate-500">
          No teaching session has been recorded against this class. Recording one in
          the course workspace attaches it to this class, its section and its date —
          and it is the only thing that advances what a material's teaching position
          says. Opening a deck does not.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Teaching progress · {entry.teaching.recordCount} recorded
      </h3>
      <ol className="space-y-2">
        {entry.teaching.records.map((record) => (
          <li key={record.id} className="rounded-lg border border-slate-200 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-900">
                {record.materialTitle || "Untitled material"}
              </span>
              <span className="text-xs text-slate-500">{record.taughtOn}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600">
              {record.fromUnit === record.toUnit
                ? `${record.unitLabel} ${record.fromUnit}`
                : `${record.unitLabel}s ${record.fromUnit}–${record.toUnit}`}
              {record.totalUnits ? ` of ${record.totalUnits}` : ""}
              {record.nextStartUnit
                ? ` · next ${record.unitLabel} ${record.nextStartUnit}`
                : ""}
            </p>
            {record.topic && <p className="mt-0.5 text-xs text-slate-500">{record.topic}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
};

/** The change trail, with whether the teacher was actually told. */
const ChangeList: React.FC<{
  changes: MyTimetableResponse["changes"];
}> = ({ changes }) => (
  <ol className="space-y-2.5">
    {changes.map((change, index) => (
      <li key={`${change.sessionId}-${index}`} className="border-l-2 border-slate-200 pl-3">
        <p className="text-sm text-slate-800">
          <span className="font-medium">
            {change.courseCode || `Section ${change.sectionCode}`}
          </span>{" "}
          {change.field}: {change.from} → {change.to}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {formatTimestamp(change.changedAt)}
          {change.changedByName ? ` · by ${change.changedByName}` : ""}
          {change.notifiedAt
            ? " · you were notified"
            : " · no notification sent"}
          {change.reason ? ` · ${change.reason}` : ""}
        </p>
      </li>
    ))}
  </ol>
);

/**
 * Clashes in the caller's own published schedule.
 *
 * Surfaced rather than hidden. The write path already refuses a double-booking
 * unless someone overrides it, so anything here exists because of an override or
 * because a related record moved later — and a teacher who cannot see a clash will
 * teach into it.
 */
const ConflictPanel: React.FC<{
  conflicts: MyConflict[];
  onReport: (conflict: MyConflict) => void;
}> = ({ conflicts, onReport }) => (
  <Card
    title={`${conflicts.length} timetable conflict${conflicts.length === 1 ? "" : "s"}`}
    icon={faTriangleExclamation}
    subtitle="Found in the published timetable. They are shown rather than hidden, and can be reported to the academic office."
  >
    <ul className="space-y-2.5">
      {conflicts.map((conflict) => (
        <li
          key={conflict.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900">
              {conflictKindLabel(conflict.type)} on {conflict.day}
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              {describeSide(conflict.first)} overlaps {describeSide(conflict.second)}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={faTriangleExclamation}
            onClick={() => onReport(conflict)}
          >
            Report
          </Button>
        </li>
      ))}
    </ul>
  </Card>
);

const ReportConflictModal: React.FC<{
  conflict: MyConflict;
  onClose: () => void;
  onReported: (recipients: number) => void;
  onError: (message: string) => void;
}> = ({ conflict, onClose, onReported, onError }) => {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await reportTimetableConflict({
        sessionId: conflict.first.id,
        otherSessionId: conflict.second.id,
        note,
      });
      onReported(result.recipients);
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The conflict could not be reported.",
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Report a timetable conflict"
      subtitle="This sends the clash to the academic office. It does not change the timetable."
      maxWidth="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="timetable-conflict-form" isLoading={saving} loadingLabel="Reporting">
            Report
          </Button>
        </>
      }
    >
      <form id="timetable-conflict-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p>
            <span className="font-medium">{conflictKindLabel(conflict.type)}</span> on{" "}
            {conflict.day}
          </p>
          <p className="mt-1">{describeSide(conflict.first)}</p>
          <p>{describeSide(conflict.second)}</p>
        </div>
        <label className="block text-sm">
          What happened
          <textarea
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional, but it helps the office resolve this faster"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <p className="text-xs text-slate-500">
          Only the roles that can move a real class will be told. Resolving a clash
          moves it for real students, so it is not something this screen can do.
        </p>
      </form>
    </Modal>
  );
};

const Fact: React.FC<{
  icon: typeof faBookOpen;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => (
  <div>
    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
      <FontAwesomeIcon icon={icon} className="text-[10px]" aria-hidden="true" />
      {label}
    </dt>
    <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
  </div>
);

function ClassStatusBadge({ status }: { status: MyClassEntry["status"] }) {
  if (status === "COMPLETED") return <Badge variant="neutral" size="sm">Completed</Badge>;
  if (status === "IN_PROGRESS") return <Badge variant="warning" size="sm">In progress</Badge>;
  if (status === "CANCELLED") return <Badge variant="danger" size="sm">Cancelled</Badge>;
  return <Badge variant="info" size="sm">Scheduled</Badge>;
}

function roomLabel(entry: MyClassEntry) {
  return entry.building ? `${entry.building} · ${entry.room}` : String(entry.room);
}

function conflictKindLabel(type: MyConflict["type"]) {
  if (type === "ROOM_CONFLICT") return "Room double-booked";
  if (type === "SECTION_CONFLICT") return "Cohort booked twice";
  return "Teacher double-booked";
}

function describeSide(side: MyConflict["first"]) {
  return `${side.courseCode || "Class"}${side.courseName ? ` · ${side.courseName}` : ""}, section ${side.sectionCode}, ${side.startTime}–${side.endTime}${side.room ? ` in ${side.room}` : ""}`;
}

function formatTimestamp(value: string | null) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

/** Adds or subtracts whole days from an institution-local date key. */
function shiftDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export default FacultyMyTimetableView;
