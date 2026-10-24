import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faCheckCircle, faClock, faCode, faFileCode } from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import type { CodingAssignment } from "./codingTypes";
import { getLanguageDefinition } from "./languageRegistry";

export interface SubmissionConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  assignment: CodingAssignment | null;
  languageId: string;
  attemptNumber: number;
  maxAttempts: number | null;
  isLoading: boolean;
}

export const SubmissionConfirmDialog: React.FC<SubmissionConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  assignment,
  languageId,
  attemptNumber,
  maxAttempts,
  isLoading,
}) => {
  const isSingleAttempt = maxAttempts === 1;
  const languageDef = getLanguageDefinition(languageId);
  const now = new Date();
  const dueAt = assignment ? new Date(assignment.dueAt) : null;
  const isLate = dueAt ? now > dueAt : false;
  const timeRemaining = dueAt ? dueAt.getTime() - now.getTime() : null;

  const formatTimeRemaining = (ms: number) => {
    if (ms <= 0) return "Past due";
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days !== 1 ? "s" : ""}`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm submission"
      subtitle="Please review the details below before submitting."
      maxWidth="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={faCheckCircle}
            isLoading={isLoading}
            onClick={onConfirm}
          >
            Confirm submission
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <FontAwesomeIcon icon={faCheckCircle} className="text-[12px]" aria-hidden="true" />
            <span>You are about to submit attempt #{attemptNumber}</span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Assignment</dt>
            <dd className="font-medium text-slate-900 truncate">
              {assignment?.title || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Course</dt>
            <dd className="font-medium text-slate-900 truncate">
              {assignment?.course || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Language</dt>
            <dd className="font-medium text-slate-900">
              <FontAwesomeIcon icon={faCode} className="inline mr-1 text-[11px]" aria-hidden="true" />
              {languageDef.label}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Attempt</dt>
            <dd className="font-medium text-slate-900">
              #{attemptNumber}
              {maxAttempts && <span className="text-slate-500 ml-1">of {maxAttempts}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Due</dt>
            <dd className={`font-medium ${isLate ? "text-red-600" : "text-slate-900"}`}>
              <FontAwesomeIcon icon={faClock} className="inline mr-1 text-[11px]" aria-hidden="true" />
              {dueAt ? dueAt.toLocaleString() : "—"}
              {timeRemaining !== null && timeRemaining > 0 && (
                <span className="ml-2 text-xs text-slate-500">({formatTimeRemaining(timeRemaining)} remaining)</span>
              )}
              {isLate && (
                <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700">
                  Late
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Max marks</dt>
            <dd className="font-medium text-slate-900">{assignment?.maxMarks ?? "—"}</dd>
          </div>
        </dl>

        {isSingleAttempt && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <FontAwesomeIcon icon={faCircleExclamation} className="mt-0.5 text-amber-600" aria-hidden="true" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Single attempt only</p>
                <p className="mt-1">This assignment allows only one submission. You will not be able to replace or resubmit after confirming.</p>
              </div>
            </div>
          </div>
        )}

        {maxAttempts !== null && maxAttempts > 1 && attemptNumber >= maxAttempts && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <FontAwesomeIcon icon={faCircleExclamation} className="mt-0.5 text-red-600" aria-hidden="true" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Final attempt</p>
                <p className="mt-1">This is your last permitted attempt. No further submissions will be accepted.</p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-600">
            <FontAwesomeIcon icon={faFileCode} className="inline mr-1 text-[11px]" aria-hidden="true" />
            Your current editor content and selected language will be submitted. Make sure you have tested your solution before confirming.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default SubmissionConfirmDialog;