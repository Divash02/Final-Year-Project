import type { TimetableStatus, LifecycleState } from "../../services/adminTimetableApi";

export { type TimetableStatus, type LifecycleState };

export const SESSION_TYPE_LABELS: Record<string, string> = {
  REGULAR_CLASS: "Lecture",
  LAB: "Lab",
  TUTORIAL: "Tutorial",
  EXAM: "Exam",
  WORKSHOP: "Workshop",
  SEMINAR: "Seminar",
  OTHER: "Other",
};

export const LIFECYCLE_BADGE: Record<LifecycleState, { variant: "success" | "warning" | "info" | "neutral"; label: string }> = {
  DRAFT: { variant: "neutral", label: "Draft" },
  APPROVED: { variant: "info", label: "Approved" },
  PUBLISHED: { variant: "success", label: "Published" },
};

export const STATUS_BADGE: Record<TimetableStatus, { variant: "success" | "warning" | "danger" | "info" | "neutral"; label: string }> = {
  SCHEDULED: { variant: "info", label: "Scheduled" },
  IN_PROGRESS: { variant: "warning", label: "In Progress" },
  COMPLETED: { variant: "success", label: "Completed" },
  CANCELLED: { variant: "danger", label: "Cancelled" },
};

export function sessionTypeLabel(type: string): string {
  return SESSION_TYPE_LABELS[type] || type;
}

export function formatSessionTime(start?: string | null, end?: string | null): string {
  if (!start && !end) return "—";
  return `${start || "—"} – ${end || "—"}`;
}

export function roomLabel(room?: string | null, building?: string | null): string {
  if (!room && !building) return "Not allocated";
  if (room && building) return `${building} · ${room}`;
  return room || building || "Not allocated";
}
