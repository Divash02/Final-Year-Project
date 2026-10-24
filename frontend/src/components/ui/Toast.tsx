import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faCircleExclamation,
  faCircleCheck,
  faCircleInfo,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

export type ToastVariant = "success" | "info" | "warning" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  detail?: string;
  duration?: number | null;
  action?: ToastAction;
  createdAt: number;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const ICONS: Record<ToastVariant, IconDefinition> = {
  error: faCircleExclamation,
  success: faCircleCheck,
  info: faCircleInfo,
  warning: faTriangleExclamation,
};

/**
 * Single floating toast. Purely presentational — the parent ToastProvider
 * owns the timer lifecycle, so this component never schedules or clears a
 * timeout itself. That keeps hover-pause and replace-reset behaviour
 * consistent across all toasts.
 */
export const Toast: React.FC<ToastProps> = ({
  toast,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
}) => {
  const { id, variant, message, detail, action } = toast;

  return (
    <div
      id={`cos-toast-${id}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={[
        "cos-toast",
        `cos-toast-${variant}`,
        "cos-toast-visible",
      ].join(" ")}
    >
      <FontAwesomeIcon
        icon={ICONS[variant]}
        className="cos-toast-icon"
        aria-hidden="true"
      />
      <div className="cos-toast-body">
        <p className="cos-toast-message">{message}</p>
        {detail && <p className="cos-toast-detail">{detail}</p>}
        {action && (
          <button
            type="button"
            className="cos-toast-action"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        className="cos-toast-close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(id)}
      >
        <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
      </button>
    </div>
  );
};

export default Toast;