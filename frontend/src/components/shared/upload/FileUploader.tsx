import React from "react";
import { Button } from "../../ui/Button";
import { Dropzone } from "./Dropzone";
import { FileTypeIcon } from "./FileTypeIcon";
import { UploadQueue } from "./UploadQueue";
import { formatBytes } from "./fileTypes";
import { UploadQueueApi } from "./useUploadQueue";

export interface FileUploaderProps {
  /** The queue state machine (from `useUploadQueue`). */
  queue: UploadQueueApi;
  /** Human-readable hint of accepted formats. */
  acceptHint?: string;
  /** Mirrors the `accept` attribute of the file picker. */
  accept?: string;
  /** Client-side validation; a returned string refuses the file. */
  validate?: (file: File) => string | null;
  /** Maximum total bytes per file, refused before any bytes move. */
  maxFileSizeBytes?: number;
  /** Called with each file the size gate or `validate` refuses. */
  onReject?: (file: File, reason: string) => void;
  /** Per-item metadata applied at upload time (folder, tags, …). */
  fields?: Record<string, string>;
  /** Additional controls rendered above the queue (folder picker, tags). */
  metadataControls?: React.ReactNode;
  /** Hide the dropzone (e.g. when only the queue is relevant). */
  hideDropzone?: boolean;
  /** Announced by screen readers while transfers run. */
  regionLabel?: string;
  className?: string;
}

/**
 * The complete upload experience: dropzone → queue → commit.
 *
 * Composition, not a new mechanism — the caller configures
 * `useUploadQueue` with the route-bound uploader and owns what
 * a finished file becomes. Nothing here reports success the
 * server did not: a row only turns green on the server's 2xx.
 */
export const FileUploader: React.FC<FileUploaderProps> = ({
  queue,
  acceptHint = "PDF · DOCX · PPTX · XLSX · ZIP · Images · Video",
  accept,
  validate,
  maxFileSizeBytes,
  onReject,
  fields,
  metadataControls,
  hideDropzone = false,
  regionLabel = "File upload",
  className = "",
}) => {
  const sizeError = (file: File): string | null => {
    if (
      maxFileSizeBytes &&
      file.size > maxFileSizeBytes
    ) {
      return `File exceeds the ${formatBytes(maxFileSizeBytes)} limit.`;
    }
    return validate?.(file) ?? null;
  };

  const hasFiles = queue.items.length > 0;
  const failed = queue.items.filter(
    (item) => item.status === "error" || item.status === "cancelled",
  );

  return (
    <div
      aria-label={regionLabel}
      aria-busy={queue.busy || undefined}
      className={className}
    >
      {!hideDropzone && (
        <Dropzone
          onFiles={(files) => queue.add(files, fields)}
          validate={sizeError}
          acceptHint={acceptHint}
          accept={accept}
          maxTotalBytes={maxFileSizeBytes}
          onReject={onReject}
        />
      )}

      {metadataControls && (
        <div className="mt-4 space-y-3">{metadataControls}</div>
      )}

      {hasFiles && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Upload queue
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {queue.items.length} file{queue.items.length === 1 ? "" : "s"}
              {queue.errorCount > 0 &&
                ` · ${queue.errorCount} failed`}
            </span>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 dark:border-slate-800 dark:bg-slate-950">
            <UploadQueue
              items={queue.items}
              onRetry={queue.retry}
              onRemove={queue.remove}
              onCancel={queue.cancel}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {queue.queuedCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={queue.startAll}
                  disabled={queue.busy}
                >
                  Start {queue.queuedCount} queued
                </Button>
              )}
              {queue.busy && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={queue.cancelAll}
                >
                  Cancel all
                </Button>
              )}
              {(queue.doneCount > 0 || queue.errorCount > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={queue.clearFinished}
                >
                  Clear finished
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Screen-reader summary of the queue state. */}
      <div className="sr-only" role="status" aria-live="polite">
        {queue.busy
          ? `${queue.uploadingCount} uploading, ${queue.queuedCount} queued`
          : hasFiles
            ? `${queue.doneCount} uploaded${
                queue.errorCount > 0
                  ? `, ${queue.errorCount} failed`
                  : ""
              }`
            : "No files selected"}
      </div>
    </div>
  );
};

export default FileUploader;
