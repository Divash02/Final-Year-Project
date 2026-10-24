import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faCircleExclamation,
  faRotateRight,
  faSpinner,
  faTrashCan,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FileTypeIcon } from "./FileTypeIcon";
import { formatBytes } from "./fileTypes";
import { UploadItem } from "./useUploadQueue";

export interface UploadQueueProps {
  items: UploadItem[];
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
  /** Compact mode for drawers and side panels. */
  compact?: boolean;
  className?: string;
}

const STATUS_LABEL: Record<UploadItem["status"], string> = {
  queued: "Queued",
  uploading: "Uploading",
  done: "Uploaded",
  error: "Upload failed",
  cancelled: "Cancelled",
};

/**
 * The visible upload queue: one row per file with a real progress bar,
 * per-item actions (cancel in flight, retry failed, remove), and a text
 * status so progress is never communicated by the bar alone.
 */
export const UploadQueue: React.FC<UploadQueueProps> = ({
  items,
  onRetry,
  onRemove,
  onCancel,
  compact = false,
  className = "",
}) => {
  if (items.length === 0) return null;

  return (
    <ul
      aria-label="Upload queue"
      className={`divide-y divide-slate-100 dark:divide-slate-800 ${className}`}
    >
      {items.map((item) => (
        <li
          key={item.id}
          className={`py-2.5 ${compact ? "" : "first:pt-0 last:pb-0"}`}
        >
          <div className="flex items-center gap-3">
            <FileTypeIcon name={item.file.name} type={item.file.type} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {item.file.name}
                </p>
                <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {formatBytes(item.file.size)}
                </p>
              </div>

              {/* Progress bar + text status together. */}
              <div className="mt-1.5 flex items-center gap-2">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.percent ?? undefined}
                  aria-label={`${item.file.name} upload progress`}
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${
                      item.status === "error" || item.status === "cancelled"
                        ? "bg-red-500"
                        : item.status === "done"
                          ? "bg-emerald-600"
                          : "bg-[var(--color-primary)]"
                    }`}
                    style={{
                      width:
                        item.status === "done"
                          ? "100%"
                          : item.percent === null
                            ? "0%"
                            : `${item.percent}%`,
                    }}
                  />
                </div>
                <span
                  className={`flex w-24 shrink-0 items-center gap-1.5 text-xs ${
                    item.status === "error" || item.status === "cancelled"
                      ? "text-red-600 dark:text-red-400"
                      : item.status === "done"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {item.status === "uploading" && (
                    <FontAwesomeIcon
                      icon={faSpinner}
                      spin
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                  )}
                  {item.status === "done" && (
                    <FontAwesomeIcon
                      icon={faCircleCheck}
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                  )}
                  {(item.status === "error" || item.status === "cancelled") && (
                    <FontAwesomeIcon
                      icon={faCircleExclamation}
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                  )}
                  {item.status === "uploading" && item.percent !== null
                    ? `${item.percent}%`
                    : STATUS_LABEL[item.status]}
                </span>
              </div>

              {item.error && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                  {item.error}
                </p>
              )}
            </div>

            {/* Per-item actions. */}
            <div className="flex shrink-0 items-center gap-1">
              {(item.status === "error" || item.status === "cancelled") && (
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  aria-label={`Retry ${item.file.name}`}
                  title="Retry upload"
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <FontAwesomeIcon icon={faRotateRight} className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {item.status === "uploading" && (
                <button
                  type="button"
                  onClick={() => onCancel(item.id)}
                  aria-label={`Cancel upload of ${item.file.name}`}
                  title="Cancel upload"
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {item.status !== "uploading" && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.file.name} from queue`}
                  title="Remove from queue"
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default UploadQueue;
