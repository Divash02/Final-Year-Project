import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export interface CardProps {
  children: React.ReactNode;
  /** Card heading. Use for grouping related information only. */
  title?: string;
  subtitle?: string;
  /** Optional leading Font Awesome icon rendered next to the title. */
  icon?: IconDefinition;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Set false for tables that manage their own horizontal padding. */
  padding?: boolean;
}

/**
 * Grouping surface for related information. Use deliberately: not every section
 * of a page needs a card.
 */
export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  icon: Icon,
  headerAction,
  footer,
  className = "",
  bodyClassName = "",
  padding = true,
}) => {
  const hasHeader = Boolean(title || subtitle || headerAction);

  return (
    <section className={`cos-card ${className}`}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2.5 text-lg font-semibold text-slate-900">
                {Icon && (
                  <FontAwesomeIcon
                    icon={Icon}
                    className="shrink-0 text-[var(--color-primary)]"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">{title}</span>
              </h2>
            )}
            {subtitle && <p className="cos-page-subtitle">{subtitle}</p>}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </header>
      )}

      <div className={padding ? `cos-card-body ${bodyClassName}` : bodyClassName}>
        {children}
      </div>

      {footer && (
        <footer className="border-t border-[var(--color-border)] bg-slate-50 px-5 py-3.5 text-sm text-slate-600">
          {footer}
        </footer>
      )}
    </section>
  );
};

export default Card;