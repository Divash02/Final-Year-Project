import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArchive,
  faCalendarCheck,
  faCircleCheck,
  faCircleDot,
  faClock,
  faEye,
  faEyeLowVision,
  faLock,
  faUnlock,
} from "@fortawesome/free-solid-svg-icons";
import { Badge } from "../../ui/Badge";

export type SemanticStatus =
  | "draft"
  | "published"
  | "scheduled"
  | "archived"
  | "hidden"
  | "open"
  | "closed"
  | "completed"
  | "late"
  | "pending"
  | "graded"
  | "active"
  | "archived-week";

/**
 * Semantic status badge.
 *
 * One mapping from the platform's academic states to the
 * design system's status language, so "Draft" reads identically
 * in the planner, the materials shelf, the quiz list and the
 * announcement composer. Text always accompanies the dot.
 */
export const StatusBadge: React.FC<{
  status: SemanticStatus;
  /** Overrides the label, e.g. a localised state. */
  label?: string;
  className?: string;
}> = ({ status, label, className }) => {
  const config = STATUS[status];
  return (
    <Badge
      variant={config.variant}
      size="sm"
      hideDot={false}
      className={className}
    >
      <FontAwesomeIcon
        icon={config.icon}
        className="h-3 w-3"
        aria-hidden="true"
      />
      {label ?? config.label}
    </Badge>
  );
};

const STATUS: Record<
  SemanticStatus,
    { label: string; variant: "neutral" | "success" | "info" | "warning" | "danger" | "primary" | "accent"; icon: typeof faCircleDot }
> = {
  draft: { label: "Draft", variant: "neutral", icon: faCircleDot },
  published: { label: "Published", variant: "success", icon: faCircleCheck },
  scheduled: { label: "Scheduled", variant: "info", icon: faCalendarCheck },
  archived: { label: "Archived", variant: "neutral", icon: faArchive },
  "archived-week": { label: "Archived", variant: "neutral", icon: faArchive },
  hidden: { label: "Hidden", variant: "neutral", icon: faEyeLowVision },
  open: { label: "Open", variant: "success", icon: faUnlock },
  closed: { label: "Closed", variant: "neutral", icon: faLock },
  completed: { label: "Completed", variant: "primary", icon: faCircleCheck },
  late: { label: "Late", variant: "warning", icon: faClock },
  pending: { label: "Pending", variant: "warning", icon: faClock },
  graded: { label: "Graded", variant: "success", icon: faCircleCheck },
  active: { label: "Active", variant: "success", icon: faEye },
};

/** Maps the server's raw status strings to the semantic set. */
export function toSemanticStatus(
  raw: string | null | undefined,
): SemanticStatus {
  const value = (raw || "").toUpperCase();
  switch (value) {
    case "DRAFT":
      return "draft";
    case "PUBLISHED":
    case "RELEASED":
      return "published";
    case "SCHEDULED":
      return "scheduled";
    case "ARCHIVED":
      return "archived";
    case "HIDDEN":
      return "hidden";
    case "OPEN":
      return "open";
    case "CLOSED":
      return "closed";
    case "COMPLETED":
    case "GRADED":
      return "completed";
    case "LATE":
      return "late";
    case "PENDING":
    case "NOT_SUBMITTED":
      return "pending";
    default:
      return "draft";
  }
}

export default StatusBadge;
