import React from "react";
import {
  faArrowRotateRight,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { EmptyState } from "../../ui/EmptyState";
import { Skeleton } from "../../ui/Skeleton";

export interface ModuleErrorStateProps {
  /** What the module is, e.g. "course materials". */
  subject: string;
  /** The server's or network's own message. */
  message: string;
  onRetry: () => void;
  className?: string;
}

/**
 * Error state for an API-dependent module.
 *
 * Never a blank screen and never a silent failure: it says what
 * could not be loaded, reassures that existing data is intact,
 * and offers exactly one recovery path — retry.
 */
export const ModuleErrorState: React.FC<ModuleErrorStateProps> = ({
  subject,
  message,
  onRetry,
  className = "",
}) => (
  <EmptyState
    icon={faTriangleExclamation}
    title={`Unable to load ${subject}`}
    description={`${message} Nothing has been replaced — retry once the connection is restored.`}
    actionLabel="Try again"
    actionIcon={faArrowRotateRight}
    onAction={onRetry}
    className={className}
  />
);

export interface ModuleSkeletonProps {
  /** Approximate row count for the list skeleton. */
  rows?: number;
  className?: string;
}

/** Page-level skeleton that resembles the final layout. */
export const ModuleSkeleton: React.FC<ModuleSkeletonProps> = ({
  rows = 5,
  className = "",
}) => (
  <div
    className={`space-y-3 ${className}`}
    role="status"
    aria-label="Loading"
  >
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-9 w-full" />
    {Array.from({ length: rows }).map((_, index) => (
      <Skeleton key={index} className="h-12 w-full" />
    ))}
  </div>
);
