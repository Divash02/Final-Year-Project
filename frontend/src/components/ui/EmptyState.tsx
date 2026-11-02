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
    className={`flex flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white px-8 py-10 text-center ${className}`}
  >
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
      <FontAwesomeIcon icon={icon} className="text-xl" aria-hidden="true" />
    </div>

    <h3 className="text-sm font-semibold text-black">
      {loading ? "Loading records" : title}
    </h3>

    <p className="mt-1.5 max-w-md text-xs leading-relaxed text-neutral-700">
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