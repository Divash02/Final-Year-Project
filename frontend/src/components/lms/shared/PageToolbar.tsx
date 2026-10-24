import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { SearchInput } from "./SearchInput";

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: IconDefinition;
  onClick: () => void;
  /** Primary action renders as the strong button. */
  primary?: boolean;
  disabled?: boolean;
  /** Hides the control while true (permission-aware UI). */
  hidden?: boolean;
}

export interface PageToolbarProps {
  /** Search state, when the module supports it. */
  search?: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    placeholder?: string;
    loading?: boolean;
  };
  /** Filter / sort / view controls rendered between search and actions. */
  filters?: React.ReactNode;
  /** Toolbar actions. The primary one renders right-aligned and strong. */
  actions?: ToolbarAction[];
  className?: string;
}

/**
 * The module toolbar: [Search] [Filters] … [Primary action].
 *
 * Layout contract: search and filters sit left, actions right,
 * and exactly one action is strong. Wraps on small screens
 * instead of shrinking below usable density.
 */
export const PageToolbar: React.FC<PageToolbarProps> = ({
  search,
  filters,
  actions = [],
  className = "",
}) => {
  const visible = actions.filter((action) => !action.hidden);
  const primary = visible.find((action) => action.primary);
  const rest = visible.filter((action) => action !== primary);

  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-b border-slate-200 px-1 py-3 dark:border-slate-800 ${className}`}
      role="toolbar"
      aria-label="Module toolbar"
    >
      {search && (
        <SearchInput
          value={search.value}
          onChange={search.onChange}
          label={search.label}
          placeholder={search.placeholder}
          loading={search.loading}
          className="w-full sm:w-64"
        />
      )}

      {filters && (
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
      )}

      <div className="ms-auto flex flex-wrap items-center gap-2">
        {rest.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className="cos-btn cos-btn-secondary h-9 px-3 text-xs disabled:opacity-50"
          >
            {action.icon && (
              <FontAwesomeIcon
                icon={action.icon}
                className="text-sm"
                aria-hidden="true"
              />
            )}
            <span>{action.label}</span>
          </button>
        ))}
        {primary && (
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled}
            className="cos-btn cos-btn-primary h-9 px-3.5 text-xs disabled:opacity-50"
          >
            {primary.icon && (
              <FontAwesomeIcon
                icon={primary.icon}
                className="text-sm"
                aria-hidden="true"
              />
            )}
            <span>{primary.label}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default PageToolbar;
