import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faCalendarDays,
  faChevronLeft,
  faChevronRight,
  faArrowsRotate,
  faGraduationCap,
  faClipboardCheck,
  faCircleInfo,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import {
  CalendarEventType,
  CALENDAR_EVENT_TYPE_LABELS,
  CALENDAR_EVENT_TYPE_STYLES,
} from "../../lib/theme";
import {
  formatDateKeyLong,
  getInstitutionDateParts,
  getInstitutionWeekDateKeys,
  parseScheduleTime,
  resolveInstitutionTimeZone,
  DEFAULT_INSTITUTION_TIME_ZONE,
} from "../../lib/institutionTime";
import { WorkspaceLayout } from "../layout/WorkspaceLayout";
import { ListPane } from "../layout/ListPane";
import { WeekCalendar, WeekCalendarEmpty } from "../calendar/WeekCalendar";
import { PositionedEvent, ScheduleEvent } from "../calendar/calendarLayout";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Alert } from "../ui/Alert";

interface TimetableRow {
  id: string;
  course_code: string;
  course_name: string;
  faculty_name: string;
  section_code: string;
  scheduled_day: string;
  start_time: string;
  end_time: string;
  room: string;
  class_type: string;
}

interface ExamCalendarRow {
  id: string;
  title: string;
  courseCode: string;
  courseName: string;
  examDate: string;
  startTime: string;
  endTime: string;
  room: string;
  status: string;
}

const DAY_INDEX_BY_NAME: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const CLASS_TYPE_TO_EVENT_TYPE: Record<string, CalendarEventType> = {
  LECTURE: "lecture",
  LAB: "lab",
  TUTORIAL: "tutorial",
};

const WEEK_EVENT_TYPES: CalendarEventType[] = [
  "lecture",
  "lab",
  "tutorial",
  "exam",
];

export const AcademicCalendarView: React.FC = () => {
  const { currentTenant, currentUser } = useCollegeOS();
  const timeZone = resolveInstitutionTimeZone(
    currentTenant.config.timezone || DEFAULT_INSTITUTION_TIME_ZONE,
  );
  const canViewExams = Boolean(
    currentUser?.permissions?.some((permission) =>
      ["exam.view", "exams.view"].includes(permission),
    ),
  );

  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [timetable, setTimetable] = useState<TimetableRow[]>([]);
  const [exams, setExams] = useState<ExamCalendarRow[]>([]);
  const [visibleTypes, setVisibleTypes] = useState<Set<CalendarEventType>>(
    () => new Set(WEEK_EVENT_TYPES),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<PositionedEvent | null>(null);

  const dateKeys = useMemo(
    () => getInstitutionWeekDateKeys(weekAnchor, timeZone),
    [weekAnchor, timeZone],
  );
  const dayIndexByDateKey = useMemo(
    () => new Map(dateKeys.map((key, index) => [key, index])),
    [dateKeys],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    const requests: Promise<{ timetable: TimetableRow[] } | { events: ExamCalendarRow[] }>[] = [
      apiRequest<{ timetable: TimetableRow[] }>("/timetable"),
    ];
    if (canViewExams) {
      requests.push(
        apiRequest<{ events: ExamCalendarRow[] }>("/exams/calendar"),
      );
    }

    try {
      const results = await Promise.allSettled(requests);
      const timetableResult = results[0];
      if (timetableResult.status === "fulfilled") {
        const value = timetableResult.value as { timetable: TimetableRow[] };
        setTimetable(value.timetable ?? []);
      } else {
        setError(
          timetableResult.reason instanceof Error
            ? timetableResult.reason.message
            : "Could not load the timetable.",
        );
      }

      if (canViewExams && results[1]?.status === "fulfilled") {
        setExams(
          (results[1].value as { events: ExamCalendarRow[] }).events ?? [],
        );
      }
    } finally {
      setLoading(false);
    }
  }, [canViewExams]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const events = useMemo<ScheduleEvent[]>(() => {
    const classEvents = timetable
      .map((row): ScheduleEvent | null => {
        const dayIndex = DAY_INDEX_BY_NAME[(row.scheduled_day || "").toLowerCase()];
        const startMinute = parseScheduleTime(row.start_time);
        const endMinute = parseScheduleTime(row.end_time);
        if (dayIndex === undefined || startMinute === null || endMinute === null) {
          return null;
        }
        return {
          id: `tt-${row.id}`,
          title: `${row.course_code} ${row.class_type.toLowerCase()}`,
          dayIndex,
          startMinute,
          endMinute,
          type: CLASS_TYPE_TO_EVENT_TYPE[row.class_type] ?? "lecture",
          location: row.room,
          course: `${row.course_code} · ${row.course_name}`,
          section: row.section_code,
          instructor: row.faculty_name,
        };
      })
      .filter((event): event is ScheduleEvent => event !== null);

    const examEvents = exams
      .map((row): ScheduleEvent | null => {
        const dayIndex = dayIndexByDateKey.get(row.examDate);
        const startMinute = parseScheduleTime(row.startTime);
        const endMinute = parseScheduleTime(row.endTime);
        if (dayIndex === undefined || startMinute === null || endMinute === null) {
          return null;
        }
        return {
          id: `exam-${row.id}`,
          title: row.title,
          dayIndex,
          startMinute,
          endMinute,
          type: "exam",
          location: row.room,
          course: `${row.courseCode} · ${row.courseName}`,
          status: row.status,
        };
      })
      .filter((event): event is ScheduleEvent => event !== null);

    return [...classEvents, ...examEvents].filter((event) =>
      visibleTypes.has(event.type),
    );
  }, [timetable, exams, dayIndexByDateKey, visibleTypes]);

  const weekLabel = `${formatDateKeyLong(dateKeys[0])} – ${formatDateKeyLong(
    dateKeys[6],
  )}`;

  const shiftWeek = (weeks: number) => {
    setWeekAnchor((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + weeks * 7);
      return next;
    });
    setSelectedEvent(null);
  };

  const toggleType = (type: CalendarEventType) => {
    setVisibleTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <WorkspaceLayout
      title="Academic Calendar"
      icon={faCalendarDays}
      toolbar={
        <>
          <div className="flex items-center gap-1.5">
            <IconButton
              icon={faChevronLeft}
              label="Previous week"
              variant="secondary"
              onClick={() => shiftWeek(-1)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setWeekAnchor(new Date());
                setSelectedEvent(null);
              }}
            >
              Today
            </Button>
            <IconButton
              icon={faChevronRight}
              label="Next week"
              variant="secondary"
              onClick={() => shiftWeek(1)}
            />
          </div>
          <p className="order-first w-full text-sm font-medium text-slate-700 lg:order-none lg:w-auto">
            {weekLabel}
          </p>
          <IconButton
            icon={faArrowsRotate}
            label="Refresh calendar data"
            variant="secondary"
            onClick={() => void loadData()}
            disabled={loading}
          />
        </>
      }
      listPane={
        <ListPane
          label="Calendar filters"
          heading="Event types"
          toolbar={
            <div className="flex flex-wrap gap-1.5">
              {WEEK_EVENT_TYPES.map((type) => {
                const isActive = visibleTypes.has(type);
                const style = CALENDAR_EVENT_TYPE_STYLES[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    aria-pressed={isActive}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? "border-slate-300 bg-white text-slate-900"
                        : "border-transparent bg-slate-100 text-slate-500"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: style.border }}
                      aria-hidden="true"
                    />
                    {CALENDAR_EVENT_TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          }
          footer={`${events.length} scheduled item${events.length === 1 ? "" : "s"} this week`}
        >
          <div className="space-y-5 p-4">
            <section>
              <h3 className="cos-eyebrow mb-2">Weekly timetable</h3>
              <p className="flex items-start gap-2 text-sm text-slate-500">
                <FontAwesomeIcon
                  icon={faGraduationCap}
                  className="mt-0.5 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                <span>
                  {timetable.length > 0
                    ? `${timetable.length} recurring class slot${timetable.length === 1 ? "" : "s"} from the timetable.`
                    : "No recurring class slots have been published."}
                </span>
              </p>
            </section>

            {canViewExams && (
              <section>
                <h3 className="cos-eyebrow mb-2">Examinations</h3>
                <p className="flex items-start gap-2 text-sm text-slate-500">
                  <FontAwesomeIcon
                    icon={faClipboardCheck}
                    className="mt-0.5 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                  <span>
                    {exams.length > 0
                      ? `${exams.length} examination${exams.length === 1 ? "" : "s"} in the published calendar.`
                      : "No examinations are scheduled."}
                  </span>
                </p>
              </section>
            )}

            <section>
              <h3 className="cos-eyebrow mb-2">Institution time</h3>
              <p className="text-sm text-slate-500">
                Events and the current-time line are shown in{" "}
                <span className="font-medium text-slate-700">{timeZone}</span> (
                UTC+05:45).
              </p>
            </section>
          </div>
        </ListPane>
      }
      rightRail={
        <div className="flex w-full flex-col items-center gap-1">
          <CalendarRailAction
            icon={faCircleInfo}
            label="Selected event"
            disabled={!selectedEvent}
          />
        </div>
      }
    >
      {error && (
        <div className="px-5 pt-4">
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}
      {notice && (
        <div className="px-5 pt-4">
          <Alert variant="info" onDismiss={() => setNotice("")}>
            {notice}
          </Alert>
        </div>
      )}

      {selectedEvent && (
        <div className="px-5 pt-4">
          <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        </div>
      )}

      {loading ? (
        <WeekCalendarEmpty message="Loading timetable and examination records..." />
      ) : events.length === 0 ? (
        <WeekCalendarEmpty message="No scheduled items match the selected filters for this week. Change the filters or move to another week." />
      ) : (
        <WeekCalendar
          dateKeys={dateKeys}
          events={events}
          timeZone={timeZone}
          onSelectEvent={setSelectedEvent}
        />
      )}
    </WorkspaceLayout>
  );
};

const CalendarRailAction: React.FC<{
  icon: IconDefinition;
  label: string;
  disabled?: boolean;
}> = ({ icon, label, disabled }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    disabled={disabled}
    className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
  >
    <FontAwesomeIcon icon={icon} className="text-base" aria-hidden="true" />
  </button>
);

const EventDetail: React.FC<{
  event: PositionedEvent;
  onClose: () => void;
}> = ({ event, onClose }) => {
  const style = CALENDAR_EVENT_TYPE_STYLES[event.type];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span
            className="inline-flex items-center gap-2 rounded-md border px-2 py-0.5 text-xs font-medium"
            style={{
              background: style.background,
              borderColor: style.border,
              color: style.text,
            }}
          >
            {CALENDAR_EVENT_TYPE_LABELS[event.type]}
          </span>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">
            {event.title}
          </h2>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {[
          ["Course", event.course],
          ["Section", event.section],
          ["Instructor", event.instructor],
          ["Location", event.location],
          ["Status", event.status],
        ]
          .filter(([, value]) => Boolean(value))
          .map(([label, value]) => (
            <div key={label as string} className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
              <dd className="min-w-0 break-words font-medium text-slate-800">
                {value}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  );
};

export default AcademicCalendarView;
