import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAdd,
  faArchive,
  faBan,
  faCalendarDays,
  faEdit,
  faEllipsisV,
  faEye,
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

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return fallback;
}

export const TimetableWorkspaceView: React.FC = () => {
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
        if (active) setError("Could not load timetable filter options.");
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
      setError(errorMessage(err, "Could not load timetable sessions."));
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
      setError(errorMessage(err, "Could not publish this session."));
    }
  };

  const handleUnpublish = async (session: TimetableSession) => {
    try {
      await unpublishTimetableSession(session.id);
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} has been unpublished.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      setError(errorMessage(err, "Could not unpublish this session."));
    }
  };

  const handleStart = async (session: TimetableSession) => {
    try {
      await startTimetableSession(session.id);
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} is now in progress.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      setError(errorMessage(err, "Could not start this session."));
    }
  };

  const handleComplete = async (session: TimetableSession) => {
    try {
      await completeTimetableSession(session.id);
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} has been completed.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      setError(errorMessage(err, "Could not complete this session."));
    }
  };

  const handleCancel = async (session: TimetableSession, reason: string) => {
    try {
      await cancelTimetableSession(session.id, reason);
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} has been cancelled.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      setError(errorMessage(err, "Could not cancel this session."));
    }
  };

  const handleArchive = async (session: TimetableSession) => {
    try {
      await archiveTimetableSession(session.id);
      setNotice(`"${session.courseCode}" for section ${session.sectionCode} has been archived.`);
      await loadSessions();
      closeDrawer();
    } catch (err) {
      setError(errorMessage(err, "Could not archive this session."));
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
}> = ({ filters, active, onFilterChange }) => {
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
            onClick={() => {}}
            className="text-xs text-slate-500 underline"
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

const TimetableWeekView: React.FC<{
  sessions: TimetableSession[];
  weekAnchor: string;
  onSetAnchor: (value: string) => void;
  onSelect: (session: TimetableSession) => void;
  onEdit: (session: TimetableSession) => void;
}> = ({ sessions, weekAnchor, onSetAnchor, onSelect, onEdit }) => {
  const start = new Date(weekAnchor);
  start.setDate(start.getDate() - start.getDay());
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const today = new Date().toISOString().slice(0, 10);
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let h = WEEK_START_HOUR; h <= WEEK_END_HOUR; h += 1) {
      for (let m = 0; m < 60; m += TIME_SLOT_INTERVAL) {
        if (h === WEEK_END_HOUR && m > 0) break;
        slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
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
        const idx = weekDates.indexOf(s.date);
        if (idx >= 0) {
          map[weekDates[idx]] = [...(map[weekDates[idx]] || []), s];
        }
      } else if (s.dayIndex !== null && DAYS[s.dayIndex]) {
        const date = new Date(weekAnchor);
        const dayOffset = date.getDay() - s.dayIndex;
        date.setDate(date.getDate() - dayOffset);
        const dateStr = date.toISOString().slice(0, 10);
        if (weekDates.includes(dateStr)) {
          map[dateStr] = [...(map[dateStr] || []), s];
        }
      }
    });
    return map;
  }, [sessions, weekDates, weekAnchor]);

  return (
    <Card className="min-w-0 overflow-x-auto">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Week of {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <button
            onClick={() => {
              const d = new Date(weekAnchor);
              d.setDate(d.getDate() - 7);
              onSetAnchor(d.toISOString().slice(0, 10));
            }}
            className="cos-icon-btn"
            aria-label="Previous week"
          >
            <FontAwesomeIcon icon={faEllipsisV} className="rotate-90" />
          </button>
          <button
            onClick={() => onSetAnchor(today)}
            className="cos-icon-btn"
            aria-label="This week"
          >
            Today
          </button>
          <button
            onClick={() => {
              const d = new Date(weekAnchor);
              d.setDate(d.getDate() + 7);
              onSetAnchor(d.toISOString().slice(0, 10));
            }}
            className="cos-icon-btn"
            aria-label="Next week"
          >
            <FontAwesomeIcon icon={faEllipsisV} className="-rotate-90" />
          </button>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "100px 1fr" }}>
        <div className="border-r border-slate-200 bg-slate-50">
          {timeSlots.map((slot) => (
            <div
              key={slot}
              className="border-b border-slate-100 px-2 py-1 text-[10px] font-medium text-slate-400"
            >
              {slot}
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
          {weekDates.map((date) => {
            const isToday = date === today;
            const dayName = DAY_LABEL_SHORT[new Date(date).getDay()] || "";
            const daySessions = sessionsByDay[date] || [];
            return (
              <div key={date} className="border-b border-slate-200 last:border-b-0">
                <div
                  className={`flex items-center justify-center gap-1 py-2 text-xs font-medium ${
                    isToday ? "text-[var(--color-primary)]" : "text-slate-500"
                  }`}
                >
                  <span>{dayName}</span>
                  <span>{new Date(date).getDate()}</span>
                </div>
                <div className="relative min-h-[200px]">
                  {daySessions.map((session) => {
                    const start = toMinutes(session.startTime);
                    const end = toMinutes(session.endTime);
                    const span = end - start;
                    const topOffset = start - toMinutes(`${WEEK_START_HOUR}:00`);
                    const marginTop = (topOffset / TIME_SLOT_INTERVAL) * 0.5;
                    const height = Math.max(1, span / TIME_SLOT_INTERVAL) * 0.5;
                    const statusInfo = STATUS_BADGE[session.status];
                    return (
                      <div
                        key={session.id}
                        className="absolute inset-x-1 cursor-pointer rounded-md border border-slate-200 bg-white p-1.5 text-xs shadow-sm transition hover:border-slate-300"
                        style={{ marginTop: `${marginTop}rem`, height: `auto`, minHeight: `${height}rem` }}
                        onClick={() => onSelect(session)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-900">
                            {session.courseCode}
                          </span>
                          <Badge variant={statusInfo.variant} size="sm" hideDot>
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-slate-600">
                          {session.startTime}–{session.endTime}
                        </p>
                        {session.room && (
                          <p className="truncate text-slate-500">
                            {roomLabel(session.room, session.building)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
}> = ({ sessions, dayAnchor, onSetAnchor, onSelect, onEdit }) => {
  const [hour, minute] = [
    Number(dayAnchor.slice(8, 10)),
    Number(dayAnchor.slice(10, 12)) || 0,
  ];
  const display = new Date(dayAnchor);
  if (Number.isNaN(display.getTime())) {
    display.setTime(new Date().getTime());
  }

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let h = WEEK_START_HOUR; h <= WEEK_END_HOUR; h += 1) {
      for (let m = 0; m < 60; m += TIME_SLOT_INTERVAL) {
        if (h === WEEK_END_HOUR && m > 0) break;
        slots.push(h * 60 + m);
      }
    }
    return slots;
  }, []);

  const sorted = useMemo(() => {
    return [...sessions].sort(
      (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime),
    );
  }, [sessions]);

  return (
    <Card className="min-w-0 overflow-x-auto">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {new Date(dayAnchor).toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <button
            onClick={() => {
              const d = new Date(dayAnchor);
              d.setDate(d.getDate() - 1);
              onSetAnchor(d.toISOString().slice(0, 10));
            }}
            className="cos-icon-btn"
            aria-label="Previous day"
          >
            <FontAwesomeIcon icon={faEllipsisV} className="rotate-90" />
          </button>
          <button
            onClick={() => onSetAnchor(new Date().toISOString().slice(0, 10))}
            className="cos-icon-btn text-xs"
          >
            Today
          </button>
          <button
            onClick={() => {
              const d = new Date(dayAnchor);
              d.setDate(d.getDate() + 1);
              onSetAnchor(d.toISOString().slice(0, 10));
            }}
            className="cos-icon-btn"
            aria-label="Next day"
          >
            <FontAwesomeIcon icon={faEllipsisV} className="-rotate-90" />
          </button>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "100px 1fr" }}>
        <div className="border-r border-slate-200 bg-slate-50">
          {timeSlots.map((minutes) => (
            <div
              key={minutes}
              className="border-b border-slate-100 px-2 py-1 text-[10px] font-medium text-slate-400"
            >
              {`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`}
            </div>
          ))}
        </div>
        <div className="relative min-h-[400px]">
          {sorted.map((session) => {
            const start = toMinutes(session.startTime);
            const end = toMinutes(session.endTime);
            const top = ((start - toMinutes(`${WEEK_START_HOUR}:00`)) / TIME_SLOT_INTERVAL) * 0.5;
            const height = Math.max(1, ((end - start) / TIME_SLOT_INTERVAL)) * 0.5;
            const statusInfo = STATUS_BADGE[session.status];
            return (
              <div
                key={session.id}
                className="absolute inset-x-2 cursor-pointer rounded-md border border-slate-200 bg-white p-2 text-xs shadow-sm transition hover:border-slate-300"
                style={{ marginTop: `${top}rem`, height: `auto`, minHeight: `${height}rem` }}
                onClick={() => onSelect(session)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">
                    {session.courseCode}
                  </span>
                  <Badge variant={statusInfo.variant} size="sm" hideDot>
                    {statusInfo.label}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-slate-600">
                  {session.startTime}–{session.endTime} · {roomLabel(session.room, session.building)}
                </p>
                <p className="truncate text-slate-500">
                  Section {session.sectionCode} · {sessionTypeLabel(session.sessionType)}
                </p>
              </div>
            );
          })}
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


