import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarXmark } from "@fortawesome/free-solid-svg-icons";
import {
  formatDateKeyHeading,
  formatMinutesAsTime,
  getInstitutionDateParts,
  DEFAULT_INSTITUTION_TIME_ZONE,
} from "../../lib/institutionTime";
import { CALENDAR_EVENT_TYPE_STYLES } from "../../lib/theme";
import {
  CalendarEventBlock,
} from "./CalendarEvent";
import { CurrentTimeIndicator } from "./CurrentTimeIndicator";
import {
  DEFAULT_CALENDAR_END_HOUR,
  DEFAULT_CALENDAR_START_HOUR,
  PositionedEvent,
  ScheduleEvent,
  layoutDayEvents,
} from "./calendarLayout";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export interface WeekCalendarProps {
  /** Seven Sunday-first institution-local date keys, e.g. "2026-10-04". */
  dateKeys: string[];
  events: ScheduleEvent[];
  timeZone?: string;
  startHour?: number;
  endHour?: number;
  onSelectEvent?: (event: PositionedEvent) => void;
  className?: string;
}

const HOUR_HEIGHT_PX = 56;

function buildHourMarks(startHour: number, endHour: number): number[] {
  return Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
}

/**
 * Reusable weekly calendar.
 *
 * Seven day columns with a time axis; every block is absolutely positioned from
 * its real start and end minutes. Overlapping events are packed into lanes.
 * Below `md` the grid is replaced by a per-day agenda so the phone layout stays
 * legible instead of shrinking a seven-column table.
 */
export const WeekCalendar: React.FC<WeekCalendarProps> = ({
  dateKeys,
  events,
  timeZone = DEFAULT_INSTITUTION_TIME_ZONE,
  startHour = DEFAULT_CALENDAR_START_HOUR,
  endHour = DEFAULT_CALENDAR_END_HOUR,
  onSelectEvent,
  className = "",
}) => {
  const isCompact = useMediaQuery("(max-width: 767px)");
  const todayKey = useMemo(
    () => getInstitutionDateParts(new Date(), timeZone).dateKey,
    [timeZone],
  );

  const eventsByDay = useMemo(
    () =>
      Array.from({ length: 7 }, (_, dayIndex) =>
        layoutDayEvents(
          events.filter((event) => event.dayIndex === dayIndex),
          startHour,
          endHour,
        ),
      ),
    [events, startHour, endHour],
  );

  const hours = buildHourMarks(startHour, endHour);
  const bodyHeight = (endHour - startHour) * HOUR_HEIGHT_PX;

  if (isCompact) {
    return (
      <div className={`space-y-5 p-4 ${className}`}>
        {dateKeys.map((dateKey, dayIndex) => {
          const dayEvents = eventsByDay[dayIndex];
          const heading = formatDateKeyHeading(dateKey);
          const isToday = dateKey === todayKey;

          return (
            <section key={dateKey} aria-label={dateKey}>
              <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-slate-900">
                <span>{heading.weekday}</span>
                <span className="text-slate-500">
                  {heading.day} {heading.month}
                </span>
                {isToday && (
                  <span className="rounded-md bg-[var(--color-primary-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-primary-strong)]">
                    Today
                  </span>
                )}
              </h3>

              {dayEvents.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3.5 py-3 text-sm text-slate-400">
                  No sessions
                </p>
              ) : (
                <ul className="space-y-2">
                  {dayEvents.map((event) => (
                    <li key={event.id}>
                      <AgendaEvent event={event} onSelect={onSelectEvent} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      {/* Day headers */}
      <div className="sticky top-0 z-30 flex border-b border-slate-200 bg-white">
        <div className="w-16 shrink-0 border-r border-slate-200" aria-hidden="true" />
        {dateKeys.map((dateKey, dayIndex) => {
          const heading = formatDateKeyHeading(dateKey);
          const isToday = dateKey === todayKey;

          return (
            <div
              key={dateKey}
              className={`min-w-0 flex-1 border-r border-slate-200 px-2 py-3 text-center last:border-r-0 ${
                isToday ? "bg-[var(--color-primary-soft)]/50" : ""
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
                {heading.weekday}
              </p>
              <p
                className={`mt-0.5 text-base font-semibold ${
                  isToday
                    ? "text-[var(--color-primary-strong)]"
                    : "text-slate-900"
                }`}
              >
                {heading.day} {heading.month}
              </p>
              {isToday && (
                <span className="sr-only">(today)</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative flex" style={{ height: bodyHeight }}>
          {/* Time axis */}
          <div className="w-16 shrink-0 border-r border-slate-200 bg-white">
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative border-b border-slate-100 pr-2 text-right"
                style={{ height: HOUR_HEIGHT_PX }}
              >
                <span className="absolute -top-2 right-2 text-xs font-medium text-slate-500">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="relative flex min-w-0 flex-1">
            {hours.map((hour) => (
              <div
                key={hour}
                className="pointer-events-none absolute inset-x-0 border-b border-slate-100"
                style={{ top: `${((hour - startHour) / (endHour - startHour)) * 100}%` }}
                aria-hidden="true"
              />
            ))}

            {dateKeys.map((dateKey, dayIndex) => (
              <div
                key={dateKey}
                className={`relative min-w-0 flex-1 border-r border-slate-200 last:border-r-0 ${
                  dateKey === todayKey ? "bg-[var(--color-primary-soft)]/20" : ""
                }`}
              >
                {eventsByDay[dayIndex].map((event) => (
                  <CalendarEventBlock
                    key={event.id}
                    event={event}
                    onSelect={onSelectEvent}
                  />
                ))}
              </div>
            ))}

            <CurrentTimeIndicator
              timeZone={timeZone}
              startHour={startHour}
              endHour={endHour}
              showLabel={dateKeys.includes(todayKey)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const AgendaEvent: React.FC<{
  event: PositionedEvent;
  onSelect?: (event: PositionedEvent) => void;
}> = ({ event, onSelect }) => {
  const style = CALENDAR_EVENT_TYPE_STYLES[event.type];

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event)}
      className="w-full rounded-xl border border-l-[3px] px-3.5 py-3 text-left"
      style={{ background: style.background, borderColor: style.border }}
    >
      <span className="block text-sm font-semibold" style={{ color: style.text }}>
        {event.title}
      </span>
      <span className="mt-0.5 block text-sm text-slate-600">
        {formatMinutesAsTime(event.startMinute)} –{" "}
        {formatMinutesAsTime(event.endMinute)}
        {event.location ? ` · ${event.location}` : ""}
      </span>
      {(event.course || event.instructor) && (
        <span className="mt-0.5 block text-xs text-slate-500">
          {[event.course, event.section ? `Section ${event.section}` : null, event.instructor]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
    </button>
  );
};

export const WeekCalendarEmpty: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
    <FontAwesomeIcon
      icon={faCalendarXmark}
      className="text-3xl text-slate-300"
      aria-hidden="true"
    />
    <p className="text-sm text-slate-500">{message}</p>
  </div>
);

export default WeekCalendar;