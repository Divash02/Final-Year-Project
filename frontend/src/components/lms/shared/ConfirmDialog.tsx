import React from "react";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faTriangleExclamation, faCircleExclamation } from "@fortawesome/free-solid-svg-icons";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  title: string;
  message: string;
  subject?: string;
  busy?: boolean;
  icon?: IconDefinition;
  severity?: "danger" | "warning" | "info";
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  confirmLabel,
  onConfirm,
  title,
  message,
  subject,
  busy = false,
  icon,
  severity = "danger",
}) => {
  const resolvedIcon =
    icon ||
    (severity === "warning" ? faTriangleExclamation : severity === "info" ? faCircleExclamation : faTriangleExclamation);
  const iconBg =
    severity === "danger"
      ? "bg-red-50 text-red-600"
      : severity === "warning"
        ? "bg-amber-50 text-amber-600"
        : "bg-sky-50 text-sky-600";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={severity === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            isLoading={busy}
            loadingLabel={`${confirmLabel}...`}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <span
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
          aria-hidden="true"
        >
          <FontAwesomeIcon icon={resolvedIcon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-slate-700">{message}</p>
          {subject && (
            <p className="mt-3 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-800">
              {subject}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
