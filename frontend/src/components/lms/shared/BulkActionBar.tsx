import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

export interface BulkActionBarProps {
  /** Number of selected records. */
  selected: number;
  /** Available bulk operations. Hidden ones are not rendered. */
  actions: {
    id: string;
    label: string;
    onClick: () => void;
    /** Not offered while true (e.g. delete on protected records). */
    hidden?: boolean;
    disabled?: boolean;
    danger?: boolean;
  }[];
  onClear: () => void;
  className?: string;
}

/**
 * Contextual bulk bar. Appears only while records are selected,
 * so bulk controls never occupy screen space by default.
 */
export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selected,
  actions,
  onClear,
  className = "",
}) => {
  if (selected === 0) return null;
  const visible = actions.filter((action) => !action.hidden);

  return (
    <div
      role="region"
      aria-label={`${selected} selected`}
      className={`sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      <span className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">
        {selected} selected
      </span>
      <span className="h-4 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
      {visible.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className={[
            "cos-btn h-8 px-2.5 text-xs disabled:opacity-50",
            action.danger
              ? "cos-btn-danger"
              : "cos-btn-secondary",
          ].join(" ")}
        >
          {action.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <FontAwesomeIcon icon={faXmark} className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default BulkActionBar;
