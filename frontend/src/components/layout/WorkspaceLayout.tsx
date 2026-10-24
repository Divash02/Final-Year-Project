import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export interface WorkspaceLayoutProps {
  /** Optional 240px navigation rail. Usually the role-aware app sidebar. */
  sidebar?: React.ReactNode;
  /** Optional 320px collection pane (folders, conversations, requests). */
  listPane?: React.ReactNode;
  /** Main canvas content. */
  children: React.ReactNode;
  /** Optional 48px icon rail. Hidden below `xl`. */
  rightRail?: React.ReactNode;
  /** Page title shown in the canvas toolbar. */
  title?: string;
  /** Font Awesome icon for the canvas title. */
  icon?: IconDefinition;
  /** Canvas toolbar content (actions, filters, tabs). */
  toolbar?: React.ReactNode;
  /** Sub-bar rendered under the toolbar (e.g. mail action bar). */
  secondaryToolbar?: React.ReactNode;
  /**
   * On small screens the list pane stacks above the canvas instead of sitting
   * side by side, so nothing is hidden behind a horizontal scroll.
   */
  className?: string;
}

/**
 * Reusable workspace frame:
 *
 *   | Sidebar 240px | List pane 320px | Main canvas flex-1 | Rail 48px |
 *
 * Used by College Mail, Messages and any other collection-based module so the
 * layout is defined once. Below `lg` the panes stack; the right rail is hidden
 * below `xl` because it is supporting context, not primary interaction.
 */
export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  sidebar,
  listPane,
  children,
  rightRail,
  title,
  icon: Icon,
  toolbar,
  secondaryToolbar,
  className = "",
}) => (
  <div className={`flex min-h-full w-full bg-[var(--color-surface)] ${className}`}>
    {sidebar}

    {listPane && (
      <div className="w-full shrink-0 border-b border-slate-200 bg-white lg:w-80 lg:border-b-0 lg:border-r xl:w-80">
        {listPane}
      </div>
    )}

    <div className="flex min-w-0 flex-1 flex-col bg-white">
      {(title || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          {title && (
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900">
              {Icon && (
              <FontAwesomeIcon
                icon={Icon}
                className="shrink-0 text-[var(--color-primary)]"
                aria-hidden="true"
              />
            )}
              <span className="truncate">{title}</span>
            </h1>
          )}
          {toolbar && (
            <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          )}
        </div>
      )}

      {secondaryToolbar}

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>

    {rightRail && (
      <div className="hidden w-12 shrink-0 flex-col items-center gap-1 border-l border-slate-200 bg-slate-50 py-3 xl:flex">
        {rightRail}
      </div>
    )}
  </div>
);

export default WorkspaceLayout;