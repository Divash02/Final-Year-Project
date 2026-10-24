import { CalendarEventType } from "../../lib/theme";

export interface ScheduleEvent {
  id: string;
  title: string;
  /** 0 = Sunday ... 6 = Saturday. */
  dayIndex: number;
  /** Minutes since local midnight. */
  startMinute: number;
  endMinute: number;
  type: CalendarEventType;
  location?: string;
  course?: string;
  section?: string;
  instructor?: string;
  status?: string;
}

export interface PositionedEvent extends ScheduleEvent {
  /** Percentage offsets within the day column. */
  topPercent: number;
  heightPercent: number;
  /** Overlap lane, so simultaneous events sit side by side. */
  lane: number;
  laneCount: number;
}

export const DEFAULT_CALENDAR_START_HOUR = 6;
export const DEFAULT_CALENDAR_END_HOUR = 22;

const MINIMUM_EVENT_HEIGHT_PERCENT = 3.5;

/**
 * Lays out one day column.
 *
 * Overlapping events are grouped into clusters; each cluster is split into
 * lanes so simultaneous sessions stay readable instead of stacking on top of
 * each other. Positions are derived from the real start/end minutes only.
 */
export function layoutDayEvents(
  events: ScheduleEvent[],
  startHour: number,
  endHour: number,
): PositionedEvent[] {
  const windowMinutes = Math.max(1, (endHour - startHour) * 60);
  const windowStart = startHour * 60;

  const sorted = [...events].sort((a, b) =>
    a.startMinute === b.startMinute
      ? b.endMinute - a.endMinute
      : a.startMinute - b.startMinute,
  );

  const positioned: PositionedEvent[] = [];
  let cluster: PositionedEvent[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneCount = cluster.reduce(
      (max, item) => Math.max(max, item.lane + 1),
      1,
    );
    cluster.forEach((item) => {
      item.laneCount = laneCount;
    });
    positioned.push(...cluster);
    cluster = [];
    clusterEnd = -Infinity;
  };

  sorted.forEach((event) => {
    const start = Math.max(event.startMinute, windowStart);
    const end = Math.min(Math.max(event.endMinute, event.startMinute + 15), windowStart + windowMinutes);

    if (cluster.length > 0 && start >= clusterEnd) {
      flush();
    }

    const laneEnds = cluster.map((item) =>
      item.startMinute + (item.endMinute - item.startMinute),
    );
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) lane = cluster.length;

    const heightPercent = Math.max(
      MINIMUM_EVENT_HEIGHT_PERCENT,
      ((end - start) / windowMinutes) * 100,
    );

    cluster.push({
      ...event,
      startMinute: start,
      endMinute: end,
      topPercent: ((start - windowStart) / windowMinutes) * 100,
      heightPercent,
      lane,
      laneCount: 1,
    });

    clusterEnd = Math.max(clusterEnd, end);
  });

  flush();

  return positioned;
}

/** Groups positioned events by day index for rendering. */
export function groupEventsByDay(
  events: ScheduleEvent[],
  startHour: number,
  endHour: number,
): PositionedEvent[][] {
  const days: PositionedEvent[][] = Array.from({ length: 7 }, () => []);
  events.forEach((event) => {
    if (event.dayIndex < 0 || event.dayIndex > 6) return;
    days[event.dayIndex].push(...layoutDayEvents([event], startHour, endHour));
  });
  return days.map((day) =>
    layoutDayEvents(day.map(({ lane, laneCount, ...rest }) => rest), startHour, endHour),
  );
}