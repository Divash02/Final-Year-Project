import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../ui/ToastContainer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAdd,
  faArchive,
  faBan,
  faCalendarDays,
  faChevronLeft,
  faChevronRight,
  faEdit,
  faEye,
  faLocationDot,
  faPlay,
  faRefresh,
  faSearch,
  faShare,
  faStop,
  faUpload,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { Modal } from "../ui/Modal";
import { PageHeader } from "../ui/PageHeader";
import { Input, SelectField } from "../ui/Input";
import {
  fetchTimetableFilters,
  fetchTimetableSessions,
  checkTimetableConflicts,
  createTimetableSession,
  updateTimetableSession,
  archiveTimetableSession,
  cancelTimetableSession,
  publishTimetableSession,
  unpublishTimetableSession,
  startTimetableSession,
  completeTimetableSession,
  DAYS,
} from "../../services/adminTimetableApi";
import type {
  SessionType,
  ConflictResponse,
  TimetableFilters,
  TimetableSession,
  CreateSessionPayload,
} from "../../services/adminTimetableApi";
import { sessionTypeLabel, formatSessionTime, roomLabel } from "./timetableTypes";

const TIMETABLE_VIEWS = ["week", "day", "sessions"] as const;
const TIMETABLE_VIEW_LABELS: Record<string, string> = {
  week: "Week",
  day: "Day",
  sessions: "Sessions",
};

const DAY_LABEL_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_SLOT_INTERVAL = 30;
const WEEK_START_HOUR = 7;
const WEEK_END_HOUR = 20;
const SLOT_HEIGHT_PX = 30;
const TIME_AXIS_WIDTH_PX = 72;
const DAY_COL_MIN_WIDTH_PX = 148;

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimeLabel(value: string): string {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

type TimetableCardTone = {
  background: string;
  border: string;
  accent: string;
  text: string;
  muted: string;
};

function timetableCardTone(session: TimetableSession): TimetableCardTone {
  if (session.status === "IN_PROGRESS") {
    return {
      background: "rgba(180, 83, 9, 0.08)",
      border: "#FCD34D",
      accent: "#D97706",
      text: "#92400E",
      muted: "#78350F",
    };
  }
  if (session.status === "COMPLETED") {
    return {
      background: "rgba(21, 128, 61, 0.07)",
      border: "#86EFAC",
      accent: "#15803D",
      text: "#166534",
      muted: "#14532D",
    };
  }
  if (session.status === "CANCELLED") {
    return {
      background: "rgba(185, 28, 28, 0.06)",
      border: "#FECACA",
      accent: "#B91C1C",
      text: "#991B1B",
      muted: "#7F1D1D",
    };
  }
  if (session.sessionType === "LAB") {
    return {
      background: "rgba(29, 78, 216, 0.07)",
      border: "#BFDBFE",
      accent: "#1D4ED8",
      text: "#1E3A8A",
      muted: "#1E40AF",
    };
  }
  if (session.sessionType === "EXAM") {
    return {
      background: "rgba(185, 28, 28, 0.06)",
      border: "#FECACA",
      accent: "#DC2626",
      text: "#991B1B",
      muted: "#7F1D1D",
    };
  }
  return {
    background: "rgba(15, 118, 110, 0.08)",
    border: "#99F6E4",
    accent: "var(--color-primary, #0F766E)",
    text: "var(--color-primary-strong, #115E59)",
    muted: "#334155",
  };
}

function layoutTimedSessions<T extends { id: string; startTime: string; endTime: string }>(
  sessions: T[],
): Array<T & { lane: number; laneCount: number }> {
  const sorted = [...sessions].sort((a, b) => {
    const start = toMinutes(a.startTime) - toMinutes(b.startTime);
    if (start !== 0) return start;
    return toMinutes(b.endTime) - toMinutes(a.endTime);
  });
  const positioned: Array<T & { lane: number; laneCount: number }> = [];
  let cluster: Array<T & { lane: number; laneCount: number }> = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const laneCount = cluster.reduce((max, item) => Math.max(max, item.lane + 1), 1);
    cluster.forEach((item) => {
      item.laneCount = laneCount;
      positioned.push(item);
    });
    cluster = [];
    clusterEnd = -Infinity;
  };

  sorted.forEach((session) => {
    const start = toMinutes(session.startTime);
    const end = Math.max(toMinutes(session.endTime), start + 15);
    if (cluster.length && start >= clusterEnd) flush();
    const laneEnds = cluster.map((item) => toMinutes(item.endTime));
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) lane = cluster.length;
    cluster.push({ ...session, lane, laneCount: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  });
  flush();
  return positioned;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return fallback;
}

export const TimetableWorkspaceView: React.FC = () => {
  const toast = useToast();
  const showError = (m: string) => toast.showToast(m, "error");
  const [view, setView] = useState<"week" | "day" | "sessions">("week");

  const [filtersResponse, setFiltersResponse] = useState<{ filters: TimetableFilters } | null>(null);
  const [sessions, setSessions] = useState<TimetableSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [weekAnchor, setWeekAnchor] = useState<string>("");
  const [dayAnchor, setDayAnchor] = useState<string>("");

  const [selectedSession, setSelectedSession] = useState<TimetableSession | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await fetchTimetableFilters();
        if (active) {
          setFiltersResponse(result);
          const defaultYear = result.filters.defaultAcademicYear || result.filters.academicYears[0] || "";
          if (defaultYear) {
            setActiveFilters((prev) => ({ ...prev, academicYear: defaultYear }));
          }
        }
      } catch {
        if (active) showError("Could not load timetable filter options.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchTimetableSessions({
        academicYear: activeFilters.academicYear,
        program: activeFilters.program,
        batch: activeFilters.batch,
        semester: activeFilters.semester ? Number(activeFilters.semester) : undefined,
        section: activeFilters.section,
        courseId: activeFilters.courseId,
        room: activeFilters.room,
        teacherId: activeFilters.teacher,
        day: activeFilters.day,
        from: activeFilters.from,
        to: activeFilters.to,
        includeArchived: activeFilters.includeArchived === "true",
      });
      setSessions(result.timetable);
    } catch (err) {
      showError(errorMessage(err, "Could not load timetable sessions."));
    } finally {
      setLoading(false);
    }
  }, [activeFilters]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const updateFilter = (key: string, value: string) => {
    setActiveFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "day" && !value) delete next.day;
      return next;
    });
  };

  const resetFilters = () => {
    const defaultYear = filtersResponse?.filters.defaultAcademicYear || "";
    setActiveFilters(defaultYear ? { academicYear: defaultYear } : {});
    setView("week");
    setWeekAnchor("");
    setDayAnchor("");
  };

  const openCreate = () => {
    setFormMode("create");
    setFormOpen(true);
  };

  const openEdit = (session: TimetableSession) => {
    setFormMode("edit");
    setSelectedSession(session);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setSelectedSession(null);
  };

  const closeDrawer = () => setSelectedSession(null);

  const handlePublish = async (session: TimetableSession) => {
    try {
      await publishTimetableSession(session.id, {});
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} has been published.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      showError(errorMessage(err, "Could not publish this session."));
    }
  };

  const handleUnpublish = async (session: TimetableSession) => {
    try {
      await unpublishTimetableSession(session.id);
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} has been unpublished.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      showError(errorMessage(err, "Could not unpublish this session."));
    }
  };

  const handleStart = async (session: TimetableSession) => {
    try {
      await startTimetableSession(session.id);
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} is now in progress.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      showError(errorMessage(err, "Could not start this session."));
    }
  };

  const handleComplete = async (session: TimetableSession) => {
    try {
      await completeTimetableSession(session.id);
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} has been completed.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      showError(errorMessage(err, "Could not complete this session."));
    }
  };

  const handleCancel = async (session: TimetableSession, reason: string) => {
    try {
      await cancelTimetableSession(session.id, reason);
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} has been cancelled.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      showError(errorMessage(err, "Could not cancel this session."));
    }
  };

  const handleArchive = async (session: TimetableSession) => {
    try {
      await archiveTimetableSession(session.id);
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} has been archived.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      showError(errorMessage(err, "Could not archive this session."));
    }
  };

  const filters: TimetableFilters | null = filtersResponse?.filters ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const weekSessions = useMemo(() => {
    let list = [...sessions];
    if (weekAnchor) {
      const start = new Date(weekAnchor);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      list = list.filter((s) => {
        if (s.date) return s.date >= startStr && s.date <= endStr;
        return true;
      });
    } else {
      const todayObj = new Date(today);
      const start = new Date(todayObj);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      list = list.filter((s) => {
        if (s.date) return s.date >= startStr && s.date <= endStr;
        return true;
      });
    }
    return list;
  }, [sessions, weekAnchor, today]);

  const daySessions = useMemo(() => {
    const anchorDate = dayAnchor || today;
    return sessions.filter((s) => {
      if (s.date) return s.date === anchorDate;
      const dayIndex = DAYS.indexOf(anchorDate);
      if (dayIndex === -1) return false;
      return s.dayIndex === dayIndex || s.scheduledDay === DAYS[dayIndex];
    });
  }, [sessions, dayAnchor, today]);

  const weekGridSessions = useMemo(() => {
    return weekSessions.filter((s) => {
      if (s.date) {
        const d = new Date(s.date);
        const start = weekAnchor ? new Date(weekAnchor) : new Date(today);
        start.setDate(start.getDate() - start.getDay());
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return d >= start && d <= end;
      }
      return true;
    });
  }, [weekSessions, weekAnchor, today]);

  return (
    <section className="cos-page">
      <PageHeader
        eyebrow="Academic"
        title="Timetable & Sessions"
        icon={faCalendarDays}
        description="Create, schedule and monitor academic sessions. The timetable is validated against teacher, room and cohort conflicts on the server."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 p-0.5" role="tablist" aria-label="View">
              {TIMETABLE_VIEWS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={view === option}
                  onClick={() => setView(option)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    view === option
                      ? "bg-[var(--color-primary)] text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {TIMETABLE_VIEW_LABELS[option]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="cos-icon-btn"
              aria-label="Reset filters"
            >
              <FontAwesomeIcon icon={faRefresh} />
            </button>
            <Button icon={faAdd} onClick={openCreate} disabled={!filters}>
              Add session
            </Button>
          </div>
        }
      />

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

      <TimetableFilterBar
        filters={filters}
        active={activeFilters}
        onFilterChange={updateFilter}
        onReset={resetFilters}
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : view === "week" ? (
        <TimetableWeekView
          sessions={weekGridSessions}
          weekAnchor={weekAnchor || today}
          onSetAnchor={setWeekAnchor}
          onSelect={setSelectedSession}
          onEdit={openEdit}
        />
      ) : view === "day" ? (
        <TimetableDayView
          sessions={daySessions}
          dayAnchor={dayAnchor || today}
          onSetAnchor={setDayAnchor}
          onSelect={setSelectedSession}
          onEdit={openEdit}
        />
      ) : (
        <TimetableSessionsView
          sessions={sessions}
          onSelect={setSelectedSession}
          onEdit={openEdit}
        />
      )}

      {formOpen && filters && (
        <TimetableFormDrawer
          mode={formMode}
          session={formMode === "edit" ? selectedSession : null}
          isOpen={formOpen}
          filters={filters}
          onClose={closeForm}
          onSaved={async () => {
            closeForm();
            await loadSessions();
            setNotice(
              formMode === "create" ? "Session created." : "Session updated.",
            );
          }}
        />
      )}

      {selectedSession && (
        <SessionDetailDrawer
          session={selectedSession}
          onClose={closeDrawer}
          onEdit={() => openEdit(selectedSession)}
          onPublish={handlePublish}
          onUnpublish={handleUnpublish}
          onStart={handleStart}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onArchive={handleArchive}
          onLoad={() => loadSessions()}
        />
      )}
    </section>
  );
};

const TimetableFilterBar: React.FC<{
  filters: TimetableFilters | null;
  active: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onReset: () => void;
}> = ({ filters, active, onFilterChange, onReset }) => {
  if (!filters) return null;

  const courses = filters.courses;
  const teachers = filters.teachers;
  const semesters = filters.semesters;
  const sections = filters.sectionCodes;
  const programs = filters.programs;
  const batches = filters.batchYears;
  const years = filters.academicYears;

  return (
    <section className="cos-card min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 className="cos-section-title">Filters</h2>
        {Object.keys(active).length > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {years.length > 0 && (
          <SelectFilter
            label="Academic year"
            value={active.academicYear}
            options={years}
            onChange={(v) => onFilterChange("academicYear", v)}
          />
        )}
        {programs.length > 0 && (
          <SelectFilter
            label="Programme"
            value={active.program}
            options={programs}
            onChange={(v) => onFilterChange("program", v)}
          />
        )}
        {semesters.length > 0 && (
          <SelectFilter
            label="Semester"
            value={active.semester}
            options={semesters.map(String)}
            onChange={(v) => onFilterChange("semester", v)}
          />
        )}
        {batches.length > 0 && (
          <SelectFilter
            label="Batch"
            value={active.batch}
            options={batches}
            onChange={(v) => onFilterChange("batch", v)}
          />
        )}
        {sections.length > 0 && (
          <SelectFilter
            label="Section"
            value={active.section}
            options={sections}
            onChange={(v) => onFilterChange("section", v)}
          />
        )}
        {courses.length > 0 && (
          <SelectFilter
            label="Course"
            value={active.courseId}
            options={courses.map((c) => c.id)}
            optionLabels={courses.map((c) => `${c.code} · ${c.name}`)}
            onChange={(v) => onFilterChange("courseId", v)}
          />
        )}
        {teachers.length > 0 && (
          <SelectFilter
            label="Teacher"
            value={active.teacher}
            options={teachers.map((t) => t.id)}
            optionLabels={teachers.map((t) => t.name)}
            onChange={(v) => onFilterChange("teacher", v)}
          />
        )}
        <SelectFilter
          label="Day"
          value={active.day}
          options={["", ...DAYS]}
          optionLabels={["All days", ...DAYS]}
          onChange={(v) => onFilterChange("day", v)}
        />
      </div>
    </section>
  );
};

const SelectFilter: React.FC<{
  label: string;
  value: string;
  options: string[];
  optionLabels?: string[];
  onChange: (value: string) => void;
}> = ({ label, value, options, optionLabels, onChange }) => (
  <label className="cos-label block min-w-0">
    {label}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cos-input mt-1.5 w-full cursor-pointer"
    >
      <option value="">All</option>
      {options.map((opt, i) => (
        <option key={opt} value={opt}>
          {optionLabels?.[i] || opt}
        </option>
      ))}
    </select>
  </label>
);

﻿const TimetableWeekView: React.FC<{
  sessions: TimetableSession[];
  weekAnchor: string;
  onSetAnchor: (value: string) => void;
  onSelect: (session: TimetableSession) => void;
  onEdit: (session: TimetableSession) => void;
}> = ({ sessions, weekAnchor, onSetAnchor, onSelect }) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekDates = useMemo(() => {
    const start = new Date(`${weekAnchor}T00:00:00`);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [weekAnchor]);

  const timeSlots = useMemo(() => {
    const slots: Array<{ minutes: number; label: string; hour: boolean }> = [];
    for (let h = WEEK_START_HOUR; h <= WEEK_END_HOUR; h += 1) {
      for (let m = 0; m < 60; m += TIME_SLOT_INTERVAL) {
        if (h === WEEK_END_HOUR && m > 0) break;
        slots.push({
          minutes: h * 60 + m,
          label: formatTimeLabel(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`),
          hour: m === 0,
        });
      }
    }
    return slots;
  }, []);

  const sessionsByDay = useMemo(() => {
    const map: Record<string, TimetableSession[]> = {};
    weekDates.forEach((d) => {
      map[d] = [];
    });
    sessions.forEach((s) => {
      if (s.date) {
        if (map[s.date]) map[s.date].push(s);
        return;
      }
      if (s.dayIndex !== null && s.dayIndex >= 0 && s.dayIndex <= 6) {
        const date = new Date(`${weekAnchor}T00:00:00`);
        const offset = date.getDay() - s.dayIndex;
        date.setDate(date.getDate() - offset);
        const dateStr = date.toISOString().slice(0, 10);
        if (map[dateStr]) map[dateStr].push(s);
      }
    });
    return map;
  }, [sessions, weekDates, weekAnchor]);

  const bodyHeight = timeSlots.length * SLOT_HEIGHT_PX;
  const gridMinWidth = TIME_AXIS_WIDTH_PX + DAY_COL_MIN_WIDTH_PX * 7;
  const windowStart = WEEK_START_HOUR * 60;

  const shiftWeek = (days: number) => {
    const d = new Date(`${weekAnchor}T00:00:00`);
    d.setDate(d.getDate() + days);
    onSetAnchor(d.toISOString().slice(0, 10));
  };

  return (
    <Card padding={false} className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="cos-eyebrow">Weekly schedule</p>
          <h3 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
            Week of {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" icon={faChevronLeft} onClick={() => shiftWeek(-7)} aria-label="Previous week" />
          <Button size="sm" variant="secondary" onClick={() => onSetAnchor(today)} aria-label="Jump to current week">
            Today
          </Button>
          <Button size="sm" variant="ghost" icon={faChevronRight} onClick={() => shiftWeek(7)} aria-label="Next week" />
        </div>
      </div>

      <div className="overflow-auto bg-slate-50/40" style={{ maxHeight: "min(68vh, 860px)" }}>
        <div style={{ minWidth: gridMinWidth }}>
          <div
            className="sticky top-0 z-20 grid border-b border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]"
            style={{ gridTemplateColumns: `${TIME_AXIS_WIDTH_PX}px repeat(7, minmax(${DAY_COL_MIN_WIDTH_PX}px, 1fr))` }}
          >
            <div className="sticky left-0 z-30 border-r border-slate-200 bg-white px-2 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Time
            </div>
            {weekDates.map((date) => {
              const isToday = date === today;
              const dateObj = new Date(`${date}T00:00:00`);
              return (
                <div
                  key={date}
                  className={`border-r border-slate-200 px-2 py-2.5 text-center last:border-r-0 ${isToday ? "bg-teal-50/70" : "bg-white"}`}
                >
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${isToday ? "text-[var(--color-primary-strong,#115E59)]" : "text-slate-500"}`}>
                    {DAY_LABEL_SHORT[dateObj.getDay()]}
                  </p>
                  <div className="mt-0.5 flex items-center justify-center gap-1.5">
                    <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-semibold ${isToday ? "bg-[var(--color-primary)] text-white" : "text-slate-800"}`}>
                      {dateObj.getDate()}
                    </span>
                    {isToday && <span className="text-[11px] font-medium text-[var(--color-primary-strong,#115E59)]">Today</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `${TIME_AXIS_WIDTH_PX}px repeat(7, minmax(${DAY_COL_MIN_WIDTH_PX}px, 1fr))`,
              height: bodyHeight,
            }}
          >
            <div className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50/95">
              {timeSlots.map((slot) => (
                <div
                  key={slot.minutes}
                  className={`relative border-b ${slot.hour ? "border-slate-200" : "border-slate-100"}`}
                  style={{ height: SLOT_HEIGHT_PX }}
                >
                  {slot.hour && (
                    <span className="absolute -top-2 right-2 bg-slate-50/95 px-1 text-[11px] font-medium text-slate-500">
                      {slot.label}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {weekDates.map((date) => {
              const isToday = date === today;
              const positioned = layoutTimedSessions(sessionsByDay[date] || []);
              return (
                <div
                  key={date}
                  className={`relative border-r border-slate-200 last:border-r-0 ${isToday ? "bg-teal-50/20" : "bg-white"}`}
                  style={{ height: bodyHeight }}
                >
                  {timeSlots.map((slot) => (
                    <div
                      key={`${date}-${slot.minutes}`}
                      className={`border-b ${slot.hour ? "border-slate-200/90" : "border-slate-100"}`}
                      style={{ height: SLOT_HEIGHT_PX }}
                      aria-hidden="true"
                    />
                  ))}

                  {positioned.map((session) => {
                    const start = Math.max(toMinutes(session.startTime), windowStart);
                    const end = Math.min(toMinutes(session.endTime), WEEK_END_HOUR * 60);
                    const top = Math.max(0, ((start - windowStart) / TIME_SLOT_INTERVAL) * SLOT_HEIGHT_PX);
                    const height = Math.max(SLOT_HEIGHT_PX * 1.35, ((Math.max(end, start + 15) - start) / TIME_SLOT_INTERVAL) * SLOT_HEIGHT_PX);
                    const tone = timetableCardTone(session);
                    const statusInfo = STATUS_BADGE[session.status];
                    const laneWidth = 100 / session.laneCount;
                    const compact = height < 82;
                    const location = roomLabel(session.room, session.building);
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => onSelect(session)}
                        className="absolute overflow-hidden rounded-xl border text-left shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition hover:z-20 hover:shadow-md focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
                        style={{
                          top: top + 2,
                          height: Math.max(34, height - 4),
                          left: `calc(${session.lane * laneWidth}% + 4px)`,
                          width: `calc(${laneWidth}% - 8px)`,
                          background: tone.background,
                          borderColor: tone.border,
                          borderLeftWidth: 4,
                          borderLeftColor: tone.accent,
                          color: tone.text,
                        }}
                        aria-label={`${session.courseCode || "Session"}, ${formatTimeLabel(session.startTime)} to ${formatTimeLabel(session.endTime)}, ${location}, ${statusInfo.label}`}
                        title={`${session.courseCode || "Session"}\n${formatTimeLabel(session.startTime)} – ${formatTimeLabel(session.endTime)}\n${location}\n${statusInfo.label}`}
                      >
                        <div className={`flex h-full flex-col ${compact ? "gap-0.5 p-1.5" : "gap-1 p-2"}`}>
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="min-w-0 truncate text-[13px] font-semibold leading-4 text-slate-900">
                              {session.courseCode || "Session"}
                            </span>
                            <Badge variant={statusInfo.variant} size="sm" hideDot className="shrink-0 !px-1.5 !py-0 !text-[10px]">
                              {compact ? statusInfo.label.replace("In Progress", "Live") : statusInfo.label}
                            </Badge>
                          </div>
                          <div className="min-w-0 text-[11px] font-medium leading-4" style={{ color: tone.muted }}>
                            {formatTimeLabel(session.startTime)} – {formatTimeLabel(session.endTime)}
                          </div>
                          {!compact && (
                            <div className="mt-auto flex min-w-0 items-start gap-1 text-[11px] leading-4 text-slate-600">
                              <FontAwesomeIcon icon={faLocationDot} className="mt-0.5 shrink-0 text-[10px] text-slate-400" aria-hidden="true" />
                              <span className="min-w-0 truncate">{location}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {!positioned.length && (
                    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-slate-300"> </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
};

const TimetableDayView: React.FC<{
  sessions: TimetableSession[];
  dayAnchor: string;
  onSetAnchor: (value: string) => void;
  onSelect: (session: TimetableSession) => void;
  onEdit: (session: TimetableSession) => void;
}> = ({ sessions, dayAnchor, onSetAnchor, onSelect }) => {
  const today = new Date().toISOString().slice(0, 10);
  const timeSlots = useMemo(() => {
    const slots: Array<{ minutes: number; label: string; hour: boolean }> = [];
    for (let h = WEEK_START_HOUR; h <= WEEK_END_HOUR; h += 1) {
      for (let m = 0; m < 60; m += TIME_SLOT_INTERVAL) {
        if (h === WEEK_END_HOUR && m > 0) break;
        slots.push({
          minutes: h * 60 + m,
          label: formatTimeLabel(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`),
          hour: m === 0,
        });
      }
    }
    return slots;
  }, []);

  const positioned = useMemo(() => layoutTimedSessions(sessions), [sessions]);
  const bodyHeight = timeSlots.length * SLOT_HEIGHT_PX;
  const windowStart = WEEK_START_HOUR * 60;
  const isToday = dayAnchor === today;
  const shiftDay = (days: number) => {
    const d = new Date(`${dayAnchor}T00:00:00`);
    d.setDate(d.getDate() + days);
    onSetAnchor(d.toISOString().slice(0, 10));
  };

  return (
    <Card padding={false} className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="cos-eyebrow">Daily schedule</p>
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
              {new Date(`${dayAnchor}T00:00:00`).toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </h3>
            {isToday && <Badge variant="primary" size="sm">Today</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" icon={faChevronLeft} onClick={() => shiftDay(-1)} aria-label="Previous day" />
          <Button size="sm" variant="secondary" onClick={() => onSetAnchor(today)}>Today</Button>
          <Button size="sm" variant="ghost" icon={faChevronRight} onClick={() => shiftDay(1)} aria-label="Next day" />
        </div>
      </div>

      <div className="overflow-auto bg-slate-50/40" style={{ maxHeight: "min(68vh, 860px)" }}>
        <div style={{ minWidth: 520 }}>
          <div
            className="sticky top-0 z-20 grid border-b border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]"
            style={{ gridTemplateColumns: `${TIME_AXIS_WIDTH_PX}px minmax(420px, 1fr)` }}
          >
            <div className="sticky left-0 z-30 border-r border-slate-200 bg-white px-2 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Time</div>
            <div className={`px-4 py-2.5 ${isToday ? "bg-teal-50/70" : "bg-white"}`}>
              <p className="text-sm font-semibold text-slate-900">{sessions.length} class{sessions.length === 1 ? "" : "es"}</p>
              <p className="text-xs text-slate-500">Scheduled for this day</p>
            </div>
          </div>

          <div className="relative grid" style={{ gridTemplateColumns: `${TIME_AXIS_WIDTH_PX}px minmax(420px, 1fr)`, height: bodyHeight }}>
            <div className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50/95">
              {timeSlots.map((slot) => (
                <div key={slot.minutes} className={`relative border-b ${slot.hour ? "border-slate-200" : "border-slate-100"}`} style={{ height: SLOT_HEIGHT_PX }}>
                  {slot.hour && <span className="absolute -top-2 right-2 bg-slate-50/95 px-1 text-[11px] font-medium text-slate-500">{slot.label}</span>}
                </div>
              ))}
            </div>

            <div className={`relative ${isToday ? "bg-teal-50/20" : "bg-white"}`} style={{ height: bodyHeight }}>
              {timeSlots.map((slot) => (
                <div key={`day-${slot.minutes}`} className={`border-b ${slot.hour ? "border-slate-200/90" : "border-slate-100"}`} style={{ height: SLOT_HEIGHT_PX }} aria-hidden="true" />
              ))}

              {positioned.map((session) => {
                const start = Math.max(toMinutes(session.startTime), windowStart);
                const end = Math.min(toMinutes(session.endTime), WEEK_END_HOUR * 60);
                const top = Math.max(0, ((start - windowStart) / TIME_SLOT_INTERVAL) * SLOT_HEIGHT_PX);
                const height = Math.max(SLOT_HEIGHT_PX * 1.8, ((Math.max(end, start + 15) - start) / TIME_SLOT_INTERVAL) * SLOT_HEIGHT_PX);
                const tone = timetableCardTone(session);
                const statusInfo = STATUS_BADGE[session.status];
                const laneWidth = 100 / session.laneCount;
                const location = roomLabel(session.room, session.building);
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onSelect(session)}
                    className="absolute overflow-hidden rounded-xl border p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition hover:z-20 hover:shadow-md focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
                    style={{
                      top: top + 3,
                      height: Math.max(56, height - 6),
                      left: `calc(${session.lane * laneWidth}% + 8px)`,
                      width: `calc(${laneWidth}% - 16px)`,
                      background: tone.background,
                      borderColor: tone.border,
                      borderLeftWidth: 4,
                      borderLeftColor: tone.accent,
                      color: tone.text,
                    }}
                    aria-label={`${session.courseCode || "Session"}, ${formatTimeLabel(session.startTime)} to ${formatTimeLabel(session.endTime)}, ${location}, ${statusInfo.label}`}
                  >
                    <div className="flex h-full min-w-0 flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{session.courseCode || "Session"}</span>
                        <Badge variant={statusInfo.variant} size="sm" hideDot className="shrink-0">{statusInfo.label}</Badge>
                      </div>
                      <div className="text-xs font-medium" style={{ color: tone.muted }}>
                        {formatTimeLabel(session.startTime)} – {formatTimeLabel(session.endTime)}
                      </div>
                      <div className="mt-auto flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                        <FontAwesomeIcon icon={faLocationDot} className="shrink-0 text-[11px] text-slate-400" aria-hidden="true" />
                        <span className="truncate">{location}</span>
                        <span className="text-slate-300">·</span>
                        <span className="truncate">Section {session.sectionCode} · {sessionTypeLabel(session.sessionType)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

const TimetableSessionsView: React.FC<{
  sessions: TimetableSession[];
  onSelect: (session: TimetableSession) => void;
  onEdit: (session: TimetableSession) => void;
}> = ({ sessions, onSelect, onEdit }) => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) =>
        (s.courseCode || "").toLowerCase().includes(q) ||
        (s.courseName || "").toLowerCase().includes(q) ||
        s.sectionCode.toLowerCase().includes(q) ||
        (s.room || "").toLowerCase().includes(q) ||
        (s.facultyName || "").toLowerCase().includes(q),
    );
  }, [sessions, search]);

  if (sessions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={faCalendarDays}
          title="No sessions found"
          description="No timetable sessions match the current filters. Adjust your criteria or add a new session."
          actionLabel="Add session"
          actionIcon={faAdd}
          onAction={() => {
            const event = new Event("open-create-timetable");
            window.dispatchEvent(event);
          }}
        />
      </Card>
    );
  }

  return (
    <Card className="min-w-0 overflow-x-auto">
      <div className="border-b border-slate-200 px-5 py-3">
        <div className="relative min-w-0">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="cos-input h-9 pl-9"
          />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-5 py-2.5 text-left">Course & Section</th>
            <th className="px-5 py-2.5 text-left">Faculty</th>
            <th className="px-5 py-2.5 text-left">Day & Time</th>
            <th className="px-5 py-2.5 text-left">Location</th>
            <th className="px-5 py-2.5 text-left">Status</th>
            <th className="px-5 py-2.5 text-left">Lifecycle</th>
            <th className="px-5 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filtered.map((session) => {
            const statusInfo = STATUS_BADGE[session.status];
            return (
              <tr key={session.id}>
                <td className="px-5 py-2.5">
                  <button
                    type="button"
                    onClick={() => onSelect(session)}
                    className="text-left font-medium text-slate-900 hover:text-[var(--color-primary)]"
                  >
                    <div>
                      <span className="font-semibold">{session.courseCode || "—"}</span>
                      {session.courseName && (
                        <span className="text-slate-500"> · {session.courseName}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Sec {session.sectionCode} · {sessionTypeLabel(session.sessionType)}
                    </p>
                  </button>
                </td>
                <td className="px-5 py-2.5 text-slate-600">{session.facultyName || "—"}</td>
                <td className="px-5 py-2.5 text-slate-600">
                  {session.scheduledDay || "—"} · {formatSessionTime(session.startTime, session.endTime)}
                  {session.date && <span> · {formatDate(session.date)}</span>}
                </td>
                <td className="px-5 py-2.5 text-slate-600">
                  {roomLabel(session.room, session.building)}
                </td>
                <td className="px-5 py-2.5">
                  <Badge variant={statusInfo.variant} size="sm">
                    {statusInfo.label}
                  </Badge>
                </td>
                <td className="px-5 py-2.5">
                  {LIFECYCLE_BADGE[session.lifecycleState].variant === "success" ? (
                    <Badge variant="success" size="sm">
                      {LIFECYCLE_BADGE[session.lifecycleState].label}
                    </Badge>
                  ) : (
                    <Badge variant={LIFECYCLE_BADGE[session.lifecycleState].variant as "neutral" | "info" | "warning"} size="sm">
                      {LIFECYCLE_BADGE[session.lifecycleState].label}
                    </Badge>
                  )}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onSelect(session)}
                    className="cos-icon-btn"
                    aria-label="View details"
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
};

const SessionDetailDrawer: React.FC<{
  session: TimetableSession;
  onClose: () => void;
  onEdit: () => void;
  onPublish: (session: TimetableSession) => Promise<void>;
  onUnpublish: (session: TimetableSession) => Promise<void>;
  onStart: (session: TimetableSession) => Promise<void>;
  onComplete: (session: TimetableSession) => Promise<void>;
  onCancel: (session: TimetableSession, reason: string) => Promise<void>;
  onArchive: (session: TimetableSession) => Promise<void>;
  onLoad: () => void;
}> = ({ session, onClose, onEdit, onPublish, onUnpublish, onStart, onComplete, onCancel, onArchive }) => {
  const [cancelReason, setCancelReason] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const statusInfo = STATUS_BADGE[session.status];
  const lifecycleInfo = LIFECYCLE_BADGE[session.lifecycleState];
  const canManage = session.status !== "COMPLETED";

  const runAction = async (action: () => Promise<void>, id: string) => {
    setActionBusy(id);
    try {
      await action();
    } finally {
      setActionBusy(null);
      setCancelReason("");
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-stretch justify-end bg-slate-950/50 backdrop-blur-sm">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-drawer-title"
        className="cos-rise relative flex w-full max-w-lg flex-col overflow-hidden rounded-l-lg border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="cos-eyebrow">Session</p>
            <h2 id="session-drawer-title" className="truncate text-xl font-bold text-slate-900">
              {session.courseCode || "Session"}
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">
              Section {session.sectionCode} · {sessionTypeLabel(session.sessionType)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="cos-icon-btn"
              aria-label="Edit session"
            >
              <FontAwesomeIcon icon={faEdit} />
            </button>
            <button type="button" onClick={onClose} className="cos-icon-btn" aria-label="Close">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Fact label="Course" value={`${session.courseCode || "—"}${session.courseName ? ` · ${session.courseName}` : ""}`} />
            <Fact label="Section" value={`Section ${session.sectionCode}`} />
            <Fact label="Faculty" value={session.facultyName || "—"} />
            <Fact label="Programme" value={session.program || "—"} />
            <Fact label="Batch" value={session.batch || "—"} />
            <Fact
              label="When"
              value={`${session.scheduledDay || "—"} · ${formatSessionTime(session.startTime, session.endTime)}`}
            />
            {session.date && <Fact label="Date override" value={formatDate(session.date)} />}
            <Fact label="Room" value={roomLabel(session.room, session.building)} />
            <Fact
              label="Academic year"
              value={session.academicYear || "—"}
            />
            <Fact label="Version" value={String(session.version)} />
            <Fact
              label="Status"
              value={
                <Badge variant={statusInfo.variant} size="sm">
                  {statusInfo.label}
                </Badge>
              }
            />
            <Fact
              label="Lifecycle"
              value={
                <Badge variant={lifecycleInfo.variant as "success" | "neutral" | "info" | "warning"} size="sm">
                  {lifecycleInfo.label}
                </Badge>
              }
            />
            {session.attendanceSessionId && (
              <Fact
                label="Attendance"
                value={
                  session.attendanceStatus === "OPEN" ? "Register open" : "Register closed"
                }
              />
            )}
          </dl>

          {session.notes && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Notes
              </p>
              <p className="mt-1.5 text-sm text-slate-600">{session.notes}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button
            icon={faEdit}
            variant="secondary"
            onClick={onEdit}
          >
            Edit
          </Button>
          {session.lifecycleState === "PUBLISHED" ? (
            <Button
              icon={faShare}
              variant="secondary"
              disabled={actionBusy === "unpublish"}
              isLoading={actionBusy === "unpublish"}
              onClick={() => runAction(() => onUnpublish(session), "unpublish")}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              icon={faUpload}
              variant="secondary"
              disabled={actionBusy === "publish" || session.status === "CANCELLED"}
              isLoading={actionBusy === "publish"}
              onClick={() => runAction(() => onPublish(session), "publish")}
            >
              Publish
            </Button>
          )}

          {session.status === "SCHEDULED" && (
            <Button
              icon={faPlay}
              variant="secondary"
              disabled={actionBusy === "start"}
              isLoading={actionBusy === "start"}
              onClick={() => runAction(() => onStart(session), "start")}
            >
              Start
            </Button>
          )}

          {session.status === "IN_PROGRESS" && (
            <Button
              icon={faStop}
              variant="secondary"
              disabled={actionBusy === "complete"}
              isLoading={actionBusy === "complete"}
              onClick={() => runAction(() => onComplete(session), "complete")}
            >
              Complete
            </Button>
          )}

          {session.status !== "CANCELLED" && !session.archived && (
            <details className="relative">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900">
                <FontAwesomeIcon icon={faBan} />
                Cancel
              </summary>
              <div className="absolute bottom-full right-0 z-10 mb-2 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                <p className="mb-2 text-xs text-slate-500">
                  Cancel this session. It stays in the record for institutional history.
                </p>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason for cancellation..."
                  className="cos-input mb-2 resize-y text-xs"
                />
                <button
                  type="button"
                  className="cos-btn cos-btn-danger w-full"
                  disabled={!cancelReason.trim() || actionBusy === "cancel"}
                  onClick={() => runAction(() => onCancel(session, cancelReason), "cancel")}
                >
                  {actionBusy === "cancel" ? "Cancelling…" : "Confirm cancel"}
                </button>
              </div>
            </details>
          )}

          {!session.archived && (
            <Button
              icon={faArchive}
              variant="secondary"
              disabled={actionBusy === "archive"}
              isLoading={actionBusy === "archive"}
              onClick={() => runAction(() => onArchive(session), "archive")}
            >
              Archive
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-slate-900">{value}</dd>
    </div>
  );
}

const TimetableFormDrawer: React.FC<{
  mode: "create" | "edit";
  session: TimetableSession | null;
  isOpen: boolean;
  filters: TimetableFilters;
  onClose: () => void;
  onSaved: () => void;
}> = ({ mode, session, isOpen, filters, onClose, onSaved }) => {
  const [formData, setFormData] = useState<Partial<CreateSessionPayload>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictResponse | null>(null);

  const isCreate = mode === "create";

  useEffect(() => {
    if (session) {
      setFormData({
        course: session.courseId,
        facultyUser: session.facultyUserId,
        program: session.program || undefined,
        batch: session.batch || undefined,
        semester: session.semester || undefined,
        sectionCode: session.sectionCode,
        room: session.room || undefined,
        building: session.building || undefined,
        date: session.date || undefined,
        scheduledDay: session.scheduledDay,
        startTime: session.startTime,
        endTime: session.endTime,
        sessionType: session.sessionType as SessionType,
        notes: session.notes || "",
      });
    } else {
      const defaultYear = filters.defaultAcademicYear;
      setFormData({
        academicYear: defaultYear,
        scheduledDay: "Monday",
        sessionType: "REGULAR_CLASS",
        startTime: "09:00",
        endTime: "10:30",
      });
    }
  }, [session, filters.defaultAcademicYear]);

  const checkConflicts = async () => {
    if (!formData.startTime || !formData.endTime || !formData.scheduledDay) {
      setFormError("");
      return;
    }
    try {
      const result = await checkTimetableConflicts({
        course: formData.course,
        facultyUser: formData.facultyUser,
        sectionCode: formData.sectionCode,
        semester: formData.semester,
        batch: formData.batch,
        program: formData.program,
        scheduledDay: formData.scheduledDay,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        room: formData.room,
        id: isCreate ? undefined : session?.id,
      });
      setConflicts(result);
      setFormError("");
    } catch (err) {
      setFormError(errorMessage(err, "Could not check for conflicts."));
    }
  };

  const runSave = async () => {
    if (!formData.course || !formData.sectionCode || !formData.facultyUser) {
      setFormError("Course, section and faculty are required.");
      return;
    }
    if (!formData.startTime || !formData.endTime) {
      setFormError("Start and end times are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload: CreateSessionPayload = {
        course: formData.course,
        facultyUser: formData.facultyUser,
        program: formData.program || undefined,
        batch: formData.batch || undefined,
        semester: formData.semester || 1,
        sectionCode: formData.sectionCode,
        room: formData.room || undefined,
        building: formData.building || undefined,
        date: formData.date || undefined,
        scheduledDay: formData.scheduledDay || "Monday",
        academicYear: formData.academicYear || filters.defaultAcademicYear,
        startTime: formData.startTime,
        endTime: formData.endTime,
        sessionType: (formData.sessionType as SessionType) || "REGULAR_CLASS",
        notes: formData.notes || "",
      };

      if (isCreate) {
        await createTimetableSession(payload);
      } else if (session) {
        await updateTimetableSession(session.id, { ...payload, reason });
      }
      onSaved();
    } catch (err) {
      setFormError(errorMessage(err, isCreate ? "Could not create session." : "Could not update session."));
    } finally {
      setSaving(false);
    }
  };

  const [formError, setFormError] = useState("");

  const courses = filters.courses;
  const teachers = filters.teachers;
  const programs = filters.programs;
  const batches = filters.batchYears;
  const semesters = filters.semesters;
  const sections = filters.sectionCodes;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isCreate ? "Add timetable session" : `Edit: ${session?.courseCode || "Session"}`}
      subtitle={isCreate ? "Create a new recurring or dated session." : "Update the session details."}
      maxWidth="2xl"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={saving}
            disabled={saving}
            onClick={runSave}
          >
            {saving ? "Saving…" : isCreate ? "Create session" : "Save changes"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {formError && <Alert variant="error" onDismiss={() => setFormError("")}>{formError}</Alert>}
        {conflicts && (
          <Alert variant={conflicts.hasConflicts ? "error" : "success"} onDismiss={() => setConflicts(null)}>
            {conflicts.message || (conflicts.hasConflicts ? "Conflicts detected." : "No conflicts detected.")}
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Course *"
            value={formData.course || ""}
            onChange={(e) => setFormData((f) => ({ ...f, course: e.target.value }))}
          >
            <option value="">Select a course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Faculty *"
            value={formData.facultyUser || ""}
            onChange={(e) => setFormData((f) => ({ ...f, facultyUser: e.target.value }))}
          >
            <option value="">Select faculty</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Programme"
            value={formData.program || ""}
            onChange={(e) => setFormData((f) => ({ ...f, program: e.target.value || undefined }))}
          >
            <option value="">All programmes</option>
            {programs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Batch"
            value={formData.batch || ""}
            onChange={(e) => setFormData((f) => ({ ...f, batch: e.target.value || undefined }))}
          >
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Semester"
            value={formData.semester ? String(formData.semester) : ""}
            onChange={(e) => setFormData((f) => ({ ...f, semester: e.target.value ? Number(e.target.value) : undefined }))}
          >
            <option value="">All semesters</option>
            {semesters.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Section *"
            value={formData.sectionCode || ""}
            onChange={(e) => setFormData((f) => ({ ...f, sectionCode: e.target.value }))}
          >
            <option value="">Select a section</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Scheduled day"
            value={formData.scheduledDay || ""}
            onChange={(e) => setFormData((f) => ({ ...f, scheduledDay: e.target.value }))}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectField>
          <Input
            label="Date override"
            type="date"
            value={formData.date || ""}
            onChange={(e) => setFormData((f) => ({ ...f, date: e.target.value || undefined }))}
          />

          <Input
            label="Start time *"
            type="time"
            value={formData.startTime || ""}
            onChange={(e) => setFormData((f) => ({ ...f, startTime: e.target.value }))}
          />
          <Input
            label="End time *"
            type="time"
            value={formData.endTime || ""}
            onChange={(e) => setFormData((f) => ({ ...f, endTime: e.target.value }))}
          />

          <Input
            label="Room"
            value={formData.room || ""}
            onChange={(e) => setFormData((f) => ({ ...f, room: e.target.value || undefined }))}
            placeholder="e.g. R-204"
          />
          <Input
            label="Building"
            value={formData.building || ""}
            onChange={(e) => setFormData((f) => ({ ...f, building: e.target.value || undefined }))}
            placeholder="e.g. Science Block"
          />

          <SelectField
            label="Session type"
            value={formData.sessionType || "REGULAR_CLASS"}
            onChange={(e) => setFormData((f) => ({ ...f, sessionType: e.target.value as SessionType }))}
          >
            {filters.sessionTypes.map((t) => (
              <option key={t} value={t}>
                {sessionTypeLabel(t)}
              </option>
            ))}
          </SelectField>
          <Input
            label="Academic year"
            value={formData.academicYear || ""}
            onChange={(e) => setFormData((f) => ({ ...f, academicYear: e.target.value }))}
            helperText="Defaults to the institution's current year"
          />
        </div>

        <div>
          <label className="cos-label" htmlFor="session-notes">
            Notes
          </label>
          <textarea
            id="session-notes"
            rows={3}
            maxLength={1000}
            value={formData.notes || ""}
            onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Internal notes visible to staff..."
            className="cos-input resize-y"
          />
        </div>

        {!isCreate && (
          <div>
            <label className="cos-label" htmlFor="edit-reason">
              Change reason
            </label>
            <textarea
              id="edit-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this changing?..."
              className="cos-input resize-y"
            />
          </div>
        )}

        <div>
          <Button
            size="sm"
            variant="secondary"
            icon={faSearch}
            onClick={checkConflicts}
          >
            Check conflicts
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const STATUS_BADGE = {
  SCHEDULED: { variant: "info" as "info", label: "Scheduled" },
  IN_PROGRESS: { variant: "warning" as "warning", label: "In Progress" },
  COMPLETED: { variant: "success" as "success", label: "Completed" },
  CANCELLED: { variant: "danger" as "danger", label: "Cancelled" },
};

const LIFECYCLE_BADGE = {
  DRAFT: { variant: "neutral" as "neutral", label: "Draft" },
  APPROVED: { variant: "info" as "info", label: "Approved" },
  PUBLISHED: { variant: "success" as "success", label: "Published" },
};


