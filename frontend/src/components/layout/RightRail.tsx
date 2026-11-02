import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export interface RightRailAction {
  icon: IconDefinition;
  /** Accessible name and tooltip. Always required. */
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Shows an unread/attention marker. */
  active?: boolean;
}

export interface RightRailProps {
  /** Accessible name for the icon rail. */
  label: string;
  actions: RightRailAction[];
  className?: string;
}

/**
 * 48px vertical icon rail for supporting context (details, attachments,
 * activity, related records). Every action has a tooltip and an accessible
 * name; the rail collapses away below `xl`.
 */
export const RightRail: React.FC<RightRailProps> = ({
  label,
  actions,
  className = "",
}) => (
  <nav aria-label={label} className={`flex flex-col items-center gap-1 ${className}`}>
    {actions.map((action) => (
      <button
        key={action.label}
        type="button"
        onClick={action.onClick}
        disabled={action.disabled}
        title={action.label}
        aria-label={action.label}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition ${
          action.disabled
            ? "cursor-not-allowed opacity-40"
            : "hover:bg-slate-100 hover:text-slate-800"
        }`}
      >
        <FontAwesomeIcon icon={action.icon} className="text-base" aria-hidden="true" />
        {action.active && (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
            aria-label="Has new activity"
          />
        )}
      </button>
    ))}
  </nav>
);

export default RightRail;