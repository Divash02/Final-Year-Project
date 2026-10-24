import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { CALENDAR_EVENT_TYPE_STYLES } from "../../lib/theme";
import { formatMinutesAsTime } from "../../lib/institutionTime";
import { PositionedEvent } from "./calendarLayout";

export interface CalendarEventProps {
  event: PositionedEvent;
  onSelect?: (event: PositionedEvent) => void;
  /** "compact" drops secondary lines; "full" shows course, room and instructor. */
  density?: "compact" | "full";
}

/**
 * A single scheduled block. Position and size come from the real start/end
 * times, and colours come from the shared event-type tokens so the palette stays
 * subtle and readable.
 */
export const CalendarEventBlock: React.FC<CalendarEventProps> = ({
  event,
  onSelect,
  density = "full",
}) => {
  const style = CALENDAR_EVENT_TYPE_STYLES[event.type];
  const laneWidth = 100 / event.laneCount;
  const isTall = event.heightPercent >= 8;

  const label = [
    event.title,
    event.course,
    event.section ? `Section ${event.section}` : null,
    formatMinutesAsTime(event.startMinute),
    formatMinutesAsTime(event.endMinute),
    event.location,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event)}
      aria-label={label}
      title={label}
      className="cos-calendar-event absolute focus-visible:z-20 hover:z-20"
      style={{
        top: `${event.topPercent}%`,
        height: `${event.heightPercent}%`,
        left: `calc(${event.lane * laneWidth}% + 2px)`,
        width: `calc(${laneWidth}% - 4px)`,
        background: style.background,
        borderColor: style.border,
        color: style.text,
      }}
    >
      <span className="block truncate font-semibold">{event.title}</span>

      {isTall && density === "full" && event.course && (
        <span className="mt-0.5 block truncate opacity-90">
          {event.course}
          {event.section ? ` · ${event.section}` : ""}
        </span>
      )}

      {isTall && density === "full" && event.location && (
        <span className="mt-0.5 flex items-center gap-1 truncate opacity-80">
          <FontAwesomeIcon icon={faLocationDot} className="text-[0.6rem]" aria-hidden="true" />
          {event.location}
        </span>
      )}

      {event.heightPercent >= 12 && (
        <span className="mt-0.5 block text-[0.6875rem] opacity-80">
          {formatMinutesAsTime(event.startMinute)} –{" "}
          {formatMinutesAsTime(event.endMinute)}
        </span>
      )}
    </button>
  );
};

export default CalendarEventBlock;