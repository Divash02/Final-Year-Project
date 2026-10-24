import type { Mark } from "../../services/attendanceApi";

export type { Mark };

export const MARKS: { code: Mark; label: string; full: string }[] = [
  { code: "P", label: "P", full: "Present" },
  { code: "A", label: "A", full: "Absent" },
  { code: "L", label: "L", full: "Late" },
  { code: "B", label: "B", full: "Bunk" },
];

export const MARK_TO_STATUS: { [K in Mark]: string } = {
  P: "Present",
  A: "Absent",
  L: "Late",
  B: "Bunk",
};

export const STATUS_TO_MARK: Record<string, Mark> = {
  Present: "P",
  Absent: "A",
  Late: "L",
  Bunk: "B",
};

/**
 * Attendance status presentation, built from the CollegeOS
 * design tokens (`--color-attendance-*`) so every surface —
 * summary, cards, history, corrections — reads status the
 * same way. Colour is never the only carrier: every status
 * keeps an explicit label.
 */
interface StatusStyle {
  /** Dot / indicator fill. */
  dot: string;
  /** Text colour. */
  text: string;
  /** Pill / badge surface. */
  chip: string;
  /** Card border (2px) reflecting the live status. */
  border: string;
  /** Segmented control, selected state. */
  controlActive: string;
  /** Segmented control, unselected state. */
  controlIdle: string;
}

const STATUS_STYLE_BY_MARK: Record<Mark, StatusStyle> = {
  P: {
    dot: "bg-[var(--color-attendance-present)]",
    text: "text-[var(--color-attendance-present)]",
    chip: "border-[var(--color-attendance-present)] bg-[var(--color-attendance-present-soft)] text-[var(--color-attendance-present)]",
    border: "border-[var(--color-attendance-present)]",
    controlActive:
      "border-[var(--color-attendance-present)] bg-[var(--color-attendance-present)] text-white",
    controlIdle:
      "border-slate-300 bg-white text-slate-600 hover:border-[var(--color-attendance-present)] hover:text-[var(--color-attendance-present)]",
  },
  A: {
    dot: "bg-[var(--color-attendance-absent)]",
    text: "text-[var(--color-attendance-absent)]",
    chip: "border-[var(--color-attendance-absent)] bg-[var(--color-attendance-absent-soft)] text-[var(--color-attendance-absent)]",
    border: "border-[var(--color-attendance-absent)]",
    controlActive:
      "border-[var(--color-attendance-absent)] bg-[var(--color-attendance-absent)] text-white",
    controlIdle:
      "border-slate-300 bg-white text-slate-600 hover:border-[var(--color-attendance-absent)] hover:text-[var(--color-attendance-absent)]",
  },
  L: {
    dot: "bg-[var(--color-attendance-late)]",
    text: "text-[var(--color-attendance-late)]",
    chip: "border-[var(--color-attendance-late)] bg-[var(--color-attendance-late-soft)] text-[var(--color-attendance-late)]",
    border: "border-[var(--color-attendance-late)]",
    controlActive:
      "border-[var(--color-attendance-late)] bg-[var(--color-attendance-late)] text-white",
    controlIdle:
      "border-slate-300 bg-white text-slate-600 hover:border-[var(--color-attendance-late)] hover:text-[var(--color-attendance-late)]",
  },
  B: {
    dot: "bg-[var(--color-attendance-bunk)]",
    text: "text-[var(--color-attendance-bunk)]",
    chip: "border-[var(--color-attendance-bunk)] bg-[var(--color-attendance-bunk-soft)] text-[var(--color-attendance-bunk)]",
    border: "border-[var(--color-attendance-bunk)]",
    controlActive:
      "border-[var(--color-attendance-bunk)] bg-[var(--color-attendance-bunk)] text-white",
    controlIdle:
      "border-slate-300 bg-white text-slate-600 hover:border-[var(--color-attendance-bunk)] hover:text-[var(--color-attendance-bunk)]",
  },
};

/** Styles keyed by full status name, including the unmarked state. */
export const STATUS_STYLES: Record<string, StatusStyle> = {
  Present: STATUS_STYLE_BY_MARK.P,
  Absent: STATUS_STYLE_BY_MARK.A,
  Late: STATUS_STYLE_BY_MARK.L,
  Bunk: STATUS_STYLE_BY_MARK.B,
  Unmarked: {
    dot: "bg-[var(--color-attendance-unmarked)]",
    text: "text-[var(--color-attendance-unmarked)]",
    chip: "border-[var(--color-attendance-unmarked-border)] bg-[var(--color-attendance-unmarked-soft)] text-[var(--color-attendance-unmarked)]",
    border: "border-dashed border-[var(--color-attendance-unmarked-border)]",
    controlActive:
      "border-slate-300 bg-white text-slate-600",
    controlIdle:
      "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
  },
};

/** Legacy shape kept for the correction dialog and history badges. */
export const MARK_STYLES: Record<Mark, { active: string; idle: string; dot: string }> = {
  P: {
    active: STATUS_STYLE_BY_MARK.P.controlActive,
    idle: STATUS_STYLE_BY_MARK.P.chip,
    dot: STATUS_STYLE_BY_MARK.P.dot,
  },
  A: {
    active: STATUS_STYLE_BY_MARK.A.controlActive,
    idle: STATUS_STYLE_BY_MARK.A.chip,
    dot: STATUS_STYLE_BY_MARK.A.dot,
  },
  L: {
    active: STATUS_STYLE_BY_MARK.L.controlActive,
    idle: STATUS_STYLE_BY_MARK.L.chip,
    dot: STATUS_STYLE_BY_MARK.L.dot,
  },
  B: {
    active: STATUS_STYLE_BY_MARK.B.controlActive,
    idle: STATUS_STYLE_BY_MARK.B.chip,
    dot: STATUS_STYLE_BY_MARK.B.dot,
  },
};

/** Status style for a live mark, or the unmarked style when unset. */
export function statusStyleFor(mark: Mark | undefined): StatusStyle {
  if (!mark) return STATUS_STYLES.Unmarked;
  return STATUS_STYLES[MARK_TO_STATUS[mark]] ?? STATUS_STYLES.Unmarked;
}
