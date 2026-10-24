import React from "react";
import type { RosterStudent } from "../../services/attendanceApi";
import { resolveAssetUrl } from "../../services/apiClient";
import {
  MARK_TO_STATUS,
  statusStyleFor,
  type Mark,
} from "./attendanceConstants";
import StudentContextMenu from "./StudentContextMenu";

interface StudentAttendanceCardProps {
  student: RosterStudent;
  /** Live mark from the register's single source of truth. */
  mark: Mark | undefined;
  remark: string;
  /** Present/Absent toggle is only available on an open session with mark permission. */
  canMark: boolean;
  canCorrect: boolean;
  onMark: (studentMongoId: string, mark: Mark) => void;
  onClear: (studentMongoId: string) => void;
  onRemarkChange: (studentMongoId: string, remark: string) => void;
  onCorrect: (student: RosterStudent) => void;
  onViewStudent: (student: RosterStudent) => void;
}

/**
 * One student on the register.
 *
 * The card itself is the primary interaction: activating it toggles
 * Present ↔ Absent (an unmarked student becomes Present). Late and
 * Bunk are explicit choices in the overflow menu, never a permanent
 * four-state control. The border, the status indicator and the
 * summary all read the same live mark, so the card can never
 * disagree with the register state.
 */
const StudentAttendanceCard: React.FC<StudentAttendanceCardProps> = ({
  student,
  mark,
  remark,
  canMark,
  canCorrect,
  onMark,
  onClear,
  onRemarkChange,
  onCorrect,
  onViewStudent,
}) => {
  const initials = `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase();
  const avatarSrc = resolveAssetUrl(student.avatarUrl);
  const statusLabel = mark ? MARK_TO_STATUS[mark] : "Unmarked";
  const nextLabel = mark === "P" ? "Absent" : "Present";
  const styles = statusStyleFor(mark);
  const remarkId = `attendance-remark-${student.studentMongoId}`;
  const interactive = canMark;
  const cardLabel = interactive
    ? `${student.name}, student ID ${student.studentId}, current status ${statusLabel}. Activate to mark ${nextLabel}.`
    : `${student.name}, student ID ${student.studentId}, status ${statusLabel}.`;

  /**
   * Card activation: Present ↔ Absent. Any event that originated
   * inside a nested control (overflow menu, remark field, links)
   * is ignored so the separate interactions never toggle the mark.
   */
  const activate = (event: React.MouseEvent | React.KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "button, a, input, textarea, select, label, [role='menu'], [role='menuitem'], [role='dialog']",
      )
    ) {
      return;
    }
    if (event.type === "keydown") {
      const key = (event as React.KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") {
        return;
      }
      event.preventDefault();
    }
    if (!canMark) {
      return;
    }
    onMark(student.studentMongoId, mark === "P" ? "A" : "P");
  };

  return (
    <li
      role="button"
      tabIndex={interactive ? 0 : -1}
      onClick={activate}
      onKeyDown={activate}
      aria-label={cardLabel}
      aria-pressed={interactive ? mark === "P" : undefined}
      className={`flex min-w-0 flex-col gap-3 rounded-lg border-2 border-solid bg-white p-4 transition-colors duration-150 ${
        styles.border
      } ${interactive ? "cursor-pointer" : "cursor-default"}`}
    >
      {/* Identity: photo, name, section, student ID, overflow menu */}
      <div className="flex items-start gap-3.5">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-[var(--color-primary-soft)] text-lg font-semibold text-[var(--color-primary-strong)]`}
        >
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <span aria-hidden="true">{initials || "?"}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-base font-semibold leading-tight text-slate-900">
            {student.name}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span>Sec {student.section}</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono">{student.studentId}</span>
          </p>
        </div>
        <StudentContextMenu
          student={student}
          currentMark={mark}
          canMark={canMark}
          canCorrect={canCorrect}
          onMark={onMark}
          onClear={onClear}
          onCorrect={onCorrect}
          onViewStudent={onViewStudent}
        />
      </div>

      {/* Live status: a single compact indicator, never a control group */}
      <div className="flex items-center gap-2 pl-[4.875rem]">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${styles.chip}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      {/* Teacher remark */}
      <div>
        <label
          htmlFor={remarkId}
          className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-slate-500"
        >
          Remark
        </label>
        <input
          id={remarkId}
          type="text"
          value={remark}
          onChange={(event) =>
            onRemarkChange(student.studentMongoId, event.target.value)
          }
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder="Remark"
          disabled={!canMark}
          maxLength={300}
          className="cos-input h-9 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        />
      </div>
    </li>
  );
};

export default StudentAttendanceCard;
