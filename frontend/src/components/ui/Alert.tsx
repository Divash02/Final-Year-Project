import React, { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faCircleExclamation,
  faCircleCheck,
  faCircleInfo,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

export type AlertVariant = "error" | "success" | "info" | "warning";

export interface AlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
  /** Optional supporting line rendered under the message. */
  detail?: string;
  onDismiss?: () => void;
  className?: string;
  /**
   * When set, the alert clears itself after this many milliseconds. Manual
   * dismissal cancels the pending timer and the timer is cleared on unmount.
   * Leave undefined to keep the message visible until the caller clears it.
   */
  autoDismissMs?: number;
}

const ICONS: Record<AlertVariant, IconDefinition> = {
  error: faCircleExclamation,
  success: faCircleCheck,
  info: faCircleInfo,
  warning: faTriangleExclamation,
};

/** Inline status message. Icon + text, so meaning never depends on colour. */
export const Alert: React.FC<AlertProps> = ({
  variant = "info",
  children,
  detail,
  onDismiss,
  className = "",
  autoDismissMs,
}) => {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (autoDismissMs === undefined || autoDismissMs === null || !onDismiss) return;
    timerRef.current = window.setTimeout(onDismiss, autoDismissMs);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoDismissMs, onDismiss]);

  const handleDismiss = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onDismiss?.();
  };

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`cos-alert cos-alert-${variant} ${className}`}
    >
      <FontAwesomeIcon icon={ICONS[variant]} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{children}</p>
        {detail && <p className="mt-1 opacity-90">{detail}</p>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss message"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100"
        >
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export default Alert;