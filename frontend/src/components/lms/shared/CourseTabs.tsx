import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { CountBadge } from "./CourseHeader";

export interface CourseTab {
  id: string;
  label: string;
  icon?: IconDefinition;
  /** Optional count rendered as a badge. */
  count?: number;
  /** Hides the tab while true (permission-aware UI). */
  hidden?: boolean;
}

export interface CourseTabsProps {
  tabs: CourseTab[];
  active: string;
  onChange: (tabId: string) => void;
  /** Accessible name for the tab list. */
  label: string;
  className?: string;
}

/**
 * The course tab bar. One visual language for every module,
 * with the active tab underlined in the institutional colour
 * and counts kept next to their labels.
 */
export const CourseTabs: React.FC<CourseTabsProps> = ({
  tabs,
  active,
  onChange,
  label,
  className = "",
}) => {
  const visible = tabs.filter((tab) => !tab.hidden);

  return (
    <nav
      aria-label={label}
      className={`flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 ${className}`}
    >
      {visible.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "border-[var(--color-primary)] text-slate-900 dark:text-slate-100"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {tab.icon && (
              <FontAwesomeIcon
                icon={tab.icon}
                className="h-4 w-4"
                aria-hidden="true"
              />
            )}
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <CountBadge value={tab.count} />
            )}
          </button>
        );
      })}
    </nav>
  );
};

export default CourseTabs;
