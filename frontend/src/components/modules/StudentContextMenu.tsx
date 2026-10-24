import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import type { RosterStudent } from "../../services/attendanceApi";
import { MARKS, MARK_STYLES, type Mark } from "./attendanceConstants";

interface StudentContextMenuProps {
  student: RosterStudent;
  currentMark: Mark | undefined;
  canMark: boolean;
  canCorrect: boolean;
  onMark: (studentMongoId: string, mark: Mark) => void;
  onClear: (studentMongoId: string) => void;
  onCorrect: (student: RosterStudent) => void;
  onViewStudent: (student: RosterStudent) => void;
}

/**
 * Per-student overflow menu. This is a separate interaction
 * zone: every handler stops propagation so opening the menu
 * or choosing an action never triggers the card's
 * Present ↔ Absent activation.
 */
const StudentContextMenu: React.FC<StudentContextMenuProps> = ({
  student,
  currentMark,
  canMark,
  canCorrect,
  onMark,
  onClear,
  onCorrect,
  onViewStudent,
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleAction = useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, []);

  const hasActions =
    canMark || canCorrect || Boolean(onViewStudent);
  if (!hasActions) return null;

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-50";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((previous) => !previous);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className="cos-icon-btn h-8 w-8 shrink-0"
        aria-label={`More options for ${student.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FontAwesomeIcon icon={faEllipsisVertical} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-52 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {canMark && (
            <>
              {MARKS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleAction(() =>
                      onMark(student.studentMongoId, option.code as Mark),
                    );
                  }}
                  className={itemClass}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${MARK_STYLES[option.code].dot}`}
                    aria-hidden="true"
                  />
                  Mark {option.full}
                </button>
              ))}
              {currentMark && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleAction(() => onClear(student.studentMongoId));
                  }}
                  className={itemClass}
                >
                  Clear status
                </button>
              )}
              <div className="my-1 border-t border-slate-100" aria-hidden="true" />
            </>
          )}
          {onViewStudent && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  handleAction(() => onViewStudent(student));
                }}
                className={itemClass}
              >
                View student
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  handleAction(() => onViewStudent(student));
                }}
                className={itemClass}
              >
                View attendance history
              </button>
              {canCorrect && (
                <div className="my-1 border-t border-slate-100" aria-hidden="true" />
              )}
            </>
          )}
          {canCorrect && (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                handleAction(() => onCorrect(student));
              }}
              className={itemClass}
            >
              Correct attendance…
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentContextMenu;
