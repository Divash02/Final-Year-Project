import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation, faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { Button } from "./Button";

interface NotFoundStateProps {
  title?: string;
  message?: string;
  onReset?: () => void;
  resetLabel?: string;
}

export const NotFoundState: React.FC<NotFoundStateProps> = ({
  title = "Module or record not found",
  message = "The requested institutional resource, record, or operational view is unavailable in the current workspace.",
  onReset,
  resetLabel = "Return to dashboard",
}) => (
  <div className="mx-auto my-8 flex max-w-lg flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-8 py-12 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600">
      <FontAwesomeIcon icon={faTriangleExclamation} className="text-2xl" aria-hidden="true" />
    </div>

    <p className="cos-eyebrow text-amber-700">Not located</p>

    <h2 className="mt-2 text-lg font-bold text-slate-900">{title}</h2>

    <p className="mb-6 mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
      {message}
    </p>

    {onReset && (
      <Button variant="secondary" icon={faArrowLeft} onClick={onReset}>
        {resetLabel}
      </Button>
    )}
  </div>
);