import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export interface PageHeaderProps {
  title: string;
  /** Small uppercase context label above the title. */
  eyebrow?: string;
  description?: string;
  /** Font Awesome icon shown beside the title. */
  icon?: IconDefinition;
  /** Primary page actions (buttons, filters, tabs). */
  actions?: React.ReactNode;
  /** Breadcrumb or filter row rendered above the title. */
  leading?: React.ReactNode;
  className?: string;
}

/**
 * Standard page heading used by every CollegeOS module so titles, subtitles and
 * action areas share one hierarchy.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  eyebrow,
  description,
  icon,
  actions,
  leading,
  className = "",
}) => (
  <header className={`cos-page-header ${className}`}>
    {leading}
    <div className="min-w-0 flex-1">
      {eyebrow && <p className="cos-eyebrow">{eyebrow}</p>}
      <h1 className="cos-page-title flex items-center gap-3">
        {icon && (
<FontAwesomeIcon
              icon={icon}
              className="shrink-0 text-[var(--color-primary)]"
              aria-hidden="true"
            />
        )}
        <span className="truncate">{title}</span>
      </h1>
      {description && <p className="cos-page-subtitle">{description}</p>}
    </div>
    {actions && (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    )}
  </header>
);

export default PageHeader;