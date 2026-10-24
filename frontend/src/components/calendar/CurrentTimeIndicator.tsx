import React, { useEffect, useState } from "react";
import { formatInstitutionTime, getInstitutionDateParts } from "../../lib/institutionTime";

export interface CurrentTimeIndicatorProps {
  /** Institution timezone, e.g. "Asia/Kathmandu" (UTC+05:45). */
  timeZone: string;
  startHour: number;
  endHour: number;
  /** Refresh interval in milliseconds. */
  refreshMs?: number;
  /** Hides the numeric label when space is tight. */
  showLabel?: boolean;
}

/**
 * Dynamic current-time line.
 *
 * Reads the browser clock and converts it into the institution's timezone, then
 * positions the line as a percentage of the visible day. It re-renders on an
 * interval so it always reflects real time rather than a fixed placeholder.
 */
export const CurrentTimeIndicator: React.FC<CurrentTimeIndicatorProps> = ({
  timeZone,
  startHour,
  endHour,
  refreshMs = 30_000,
  showLabel = true,
}) => {
  const [parts, setParts] = useState(() =>
    getInstitutionDateParts(new Date(), timeZone),
  );

  useEffect(() => {
    setParts(getInstitutionDateParts(new Date(), timeZone));
    const timer = window.setInterval(
      () => setParts(getInstitutionDateParts(new Date(), timeZone)),
      refreshMs,
    );
    return () => window.clearInterval(timer);
  }, [timeZone, refreshMs]);

  const windowMinutes = Math.max(1, (endHour - startHour) * 60);
  const offset = parts.minutesSinceMidnight - startHour * 60;

  if (offset < 0 || offset > windowMinutes) return null;

  const topPercent = (offset / windowMinutes) * 100;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20"
      style={{ top: `${topPercent}%` }}
      role="presentation"
    >
      <div className="relative border-t-2 border-red-500">
        <span className="absolute -left-1 -top-[7px] h-2.5 w-2.5 rounded-full bg-red-500" />
        {showLabel && (
          <span className="absolute -top-3 left-2 rounded-md bg-red-500 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-white">
            {formatInstitutionTime(parts)}
          </span>
        )}
      </div>
    </div>
  );
};

export default CurrentTimeIndicator;