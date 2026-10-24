import type { StaffAttendanceRecord } from "../../services/attendanceApi";

export type { StaffAttendanceRecord };

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  Present: "Present",
  Absent: "Absent",
  Late: "Late",
  Bunk: "Bunk",
  Excused: "Excused",
  Unmarked: "Unmarked",
};

export const ATTENDANCE_STATUS_VARIANTS: Record<string, "success" | "danger" | "warning" | "neutral" | "info"> = {
  Present: "success",
  Absent: "danger",
  Late: "warning",
  Bunk: "neutral",
  Excused: "info",
  Unmarked: "neutral",
};

export function attendanceStatusVariant(status: string): "success" | "danger" | "warning" | "neutral" | "info" {
  return ATTENDANCE_STATUS_VARIANTS[status] || "neutral";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(value?: string | null): string | null {
  if (!value) return null;
  const [hours, minutes] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date
    .toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    .toUpperCase();
}

export type ColumnKey =
  | "student"
  | "studentId"
  | "course"
  | "section"
  | "date"
  | "time"
  | "status"
  | "markedBy"
  | "markedAt"
  | "remarks"
  | "actions";

export const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "student", label: "Student" },
  { key: "studentId", label: "Student ID" },
  { key: "course", label: "Course" },
  { key: "section", label: "Section" },
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "status", label: "Status" },
  { key: "markedBy", label: "Recorded By" },
  { key: "markedAt", label: "Recorded At" },
  { key: "remarks", label: "Remarks" },
  { key: "actions", label: "Actions" },
];


