import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Badge } from "../../ui/Badge";

export interface CourseHeaderProps {
  code: string;
  name: string;
  /** e.g. "Bachelor of Information Technology" */
  program?: string | null;
  semester?: number | null;
  academicYear?: string | null;
  /** Section codes the caller may address, e.g. ["A2"] */
  sections?: string[];
  credits?: number | null;
  /** Breadcrumb / back control above the title. */
  leading?: React.ReactNode;
  /** Right-side page actions (export, settings). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Global course header: the context every module shares.
 *
 * Rendered once per course workspace, above the tab bar, so
 * a module never repeats the course title. The active tab is
 * the only thing that changes below it.
 */
export const CourseHeader: React.FC<CourseHeaderProps> = ({
  code,
  name,
  program,
  semester,
  academicYear,
  sections,
  credits,
  leading,
  actions,
  className = "",
}) => {
  return (
    <header className={`cos-page-header ${className}`}>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="cos-eyebrow">
          {code}
          {program ? ` · ${program}` : ""}
        </p>
        <h1 className="cos-page-title truncate">{name}</h1>
        <p className="cos-page-subtitle">
          {sections && sections.length > 0
            ? `Section${sections.length === 1 ? "" : "s"} ${sections.join(", ")}`
            : "All sections"}
          {semester ? ` · Semester ${semester}` : ""}
          {academicYear ? ` · ${academicYear}` : ""}
          {credits != null ? ` · ${credits} credit${credits === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
};

/** Count badge shown beside a tab label. */
export const CountBadge: React.FC<{ value: number }> = ({ value }) => (
  <span
    className="inline-flex min-w-5 items-center justify-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    aria-label={`${value} items`}
  >
    {value}
  </span>
);

export default CourseHeader;
