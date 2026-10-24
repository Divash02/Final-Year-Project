import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon: IconDefinition;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: IconDefinition;
  secondaryText?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Empty and loading states. CollegeOS never fabricates records to fill a view,
 * so this component carries most of the "no data yet" experience.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  secondaryText,
  loading = false,
  className = "",
}) => (
  <div
    className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-8 py-12 text-center ${className}`}
  >
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
      <FontAwesomeIcon icon={icon} className="text-2xl" aria-hidden="true" />
    </div>

    <h3 className="text-base font-semibold text-slate-900">
      {loading ? "Loading records" : title}
    </h3>

    <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
      {loading ? "Retrieving data from the CollegeOS database." : description}
    </p>

    {!loading && actionLabel && onAction && (
      <Button
        variant="secondary"
        icon={actionIcon}
        onClick={onAction}
        className="mt-5"
      >
        {actionLabel}
      </Button>
    )}

    {secondaryText && !loading && (
      <p className="mt-4 text-xs text-slate-400">{secondaryText}</p>
    )}
  </div>
);

export default EmptyState;