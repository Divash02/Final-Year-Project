import React from "react";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The destructive action, e.g. "Delete". */
  confirmLabel: string;
  onConfirm: () => void;
  title: string;
  /** What will happen, stated plainly. */
  message: string;
  /** Names the record at risk, e.g. the file or week title. */
  subject?: string;
  /** True while the action is being sent. */
  busy?: boolean;
  icon?: IconDefinition;
  /** "Delete" vs "Archive" severity. */
  severity?: "danger" | "warning";
}

/**
 * Confirmation for destructive or irreversible actions.
 *
 * The confirm button carries the verb that will run, the
 * message states the consequence, and the button is disabled
 * while the mutation is in flight so it cannot be double-sent.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  confirmLabel,
  onConfirm,
  title,
  message,
  subject,
  busy = false,
  icon = faTriangleExclamation,
  severity = "danger",
}) => (
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
          loadingLabel={confirmLabel}
          icon={icon}
        >
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          severity === "danger"
            ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
            : "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
        }`}
        aria-hidden="true"
      >
        <FontAwesomeIcon icon={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {message}
        </p>
        {subject && (
          <p className="mt-2 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {subject}
          </p>
        )}
      </div>
    </div>
  </Modal>
);

export default ConfirmDialog;
