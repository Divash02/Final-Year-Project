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

function statusLabel(status?: string) {
  if (!status) return "";
  if (status === "IN_PROGRESS") return "In Progress";
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "SCHEDULED") return "Scheduled";
  return status.replace(/_/g, " ");
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
  const base = CALENDAR_EVENT_TYPE_STYLES[event.type];
  const laneWidth = 100 / event.laneCount;
  const isTall = event.heightPercent >= 7;
  const compact = event.heightPercent < 10 || density === "compact";
  const status = statusLabel(event.status);

  const label = [
    event.title,
    event.course,
    event.section ? `Section ${event.section}` : null,
    formatMinutesAsTime(event.startMinute),
    formatMinutesAsTime(event.endMinute),
    event.location,
    status || null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event)}
      aria-label={label}
      title={label}
      className="cos-calendar-event absolute overflow-hidden focus-visible:z-20 hover:z-20"
      style={{
        top: `calc(${event.topPercent}% + 2px)`,
        height: `calc(${event.heightPercent}% - 4px)`,
        left: `calc(${event.lane * laneWidth}% + 3px)`,
        width: `calc(${laneWidth}% - 6px)`,
        background: base.background,
        borderColor: base.border,
        borderLeftColor: base.border,
        color: base.text,
        boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
      }}
    >
      <div className={`flex h-full min-w-0 flex-col ${compact ? "gap-0.5" : "gap-1"}`}>
        <div className="flex items-start justify-between gap-1">
          <span className="min-w-0 truncate text-[13px] font-semibold leading-4 text-slate-900">
            {event.title}
          </span>
          {status && !compact && (
            <span
              className="shrink-0 rounded-full border px-1.5 py-0 text-[10px] font-medium leading-4"
              style={{ borderColor: base.border, color: base.text, background: "rgba(255,255,255,0.55)" }}
            >
              {status}
            </span>
          )}
        </div>

        <span className="block truncate text-[11px] font-medium leading-4 text-slate-600">
          {formatMinutesAsTime(event.startMinute)} – {formatMinutesAsTime(event.endMinute)}
        </span>

        {isTall && event.course && (
          <span className="block truncate text-[11px] leading-4 text-slate-600">
            {event.course}
            {event.section ? ` · Section ${event.section}` : ""}
          </span>
        )}

        {isTall && event.location && (
          <span className="mt-auto flex min-w-0 items-center gap-1 text-[11px] leading-4 text-slate-600">
            <FontAwesomeIcon icon={faLocationDot} className="shrink-0 text-[10px] text-slate-400" aria-hidden="true" />
            <span className="truncate">{event.location}</span>
          </span>
        )}
      </div>
    </button>
  );
};

export default CalendarEventBlock;