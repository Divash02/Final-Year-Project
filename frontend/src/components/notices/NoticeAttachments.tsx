import React, { useCallback, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCloudArrowUp,
  faFolderOpen,
  faXmark,
  faEye,
  faDownload,
  faFilePdf,
  faFileImage,
  faFileWord,
  faFilePowerpoint,
  faFile,
  faSpinner,
  faCircleCheck,
  faCircleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Dropzone } from "../shared/upload/Dropzone";
import { DocumentViewerModal } from "../shared/viewer/DocumentViewerModal";
import { uploadWithProgress } from "../../services/uploadClient";
import {
  previewKindOf,
  formatBytes,
  downloadStoredFileById,
  StoredFileSummary,
} from "../../lib/documentPreview";

/**
 * Notice attachment composer.
 *
 * Files are staged through the authenticated
 * multi-upload endpoint (server-side magic-byte
 * validation, type and size limits) and listed
 * with a live transfer state. Nothing is silently
 * discarded: a file that fails validation or
 * upload keeps its error next to the other
 * selections.
 */

export interface NoticeAttachment {
  fileId: string;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  isPreviewable: boolean;
}

const ACCEPT =
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png,image/jpeg,image/webp";

const ACCEPT_HINT = "PDF · DOC/DOCX · PPT/PPTX · PNG · JPG · WebP";
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

type QueueEntry =
  | {
      kind: "staged";
      file: File;
      status: "queued" | "uploading" | "done" | "error";
      percent: number | null;
      error: string;
      uploaded: NoticeAttachment | null;
    }
  | {
      kind: "attached";
      attachment: NoticeAttachment;
    };

export interface NoticeAttachmentsProps {
  value: NoticeAttachment[];
  onChange: (attachments: NoticeAttachment[]) => void;
  /** Set while the parent is saving, so the queue cannot change mid-flight. */
  disabled?: boolean;
  /** Upload endpoint; defaults to the notice staging route. */
  uploadRoute?: string;
}

export const NoticeAttachments: React.FC<NoticeAttachmentsProps> = ({
  value,
  onChange,
  disabled = false,
  uploadRoute = "/notices/upload",
}) => {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  const [preview, setPreview] = useState<StoredFileSummary | null>(null);
  const tasksRef = useRef<Map<QueueEntry, { abort: () => void }>>(new Map());

  const attachedCount = value.length;
  const remainingSlots = Math.max(0, MAX_FILES - attachedCount);

  const admit = useCallback(
    (files: File[]) => {
      if (disabled) return;
      const problems: string[] = [];
      const accepted: File[] = [];
      // Only dedupe against currently staged (not yet uploaded) files.
      // Allow re-adding a file that was previously attached and removed.
      const stagedSignatures = new Set<string>(
        queue
          .filter(
            (entry): entry is Extract<QueueEntry, { kind: "staged" }> =>
              entry.kind === "staged" && !!entry.file && !entry.uploaded,
          )
          .map((entry) => fileSignature(entry.file)),
      );

      for (const file of files) {
        if (accepted.length >= remainingSlots) {
          problems.push(
            `"${file.name}" was not added: a notice may carry at most ${MAX_FILES} attachments.`,
          );
          continue;
        }
        if (stagedSignatures.has(fileSignature(file))) {
          problems.push(`"${file.name}" is already in the upload list.`);
          continue;
        }
        if (!ALLOWED_MIMES.has(file.type)) {
          problems.push(
            `"${file.name}" is not a supported type (${file.type || "unknown"}). Supported: ${ACCEPT_HINT}.`,
          );
          continue;
        }
        if (file.size > MAX_BYTES) {
          problems.push(
            `"${file.name}" exceeds the ${formatBytes(MAX_BYTES)} size limit.`,
          );
          continue;
        }
        if (file.size === 0) {
          problems.push(`"${file.name}" is empty and cannot be attached.`);
          continue;
        }
        accepted.push(file);
        stagedSignatures.add(fileSignature(file));
      }

      setRejections((previous) => [...previous, ...problems]);
      if (accepted.length) {
        setQueue((previous) => [
          ...previous,
          ...accepted.map((file) => ({
            kind: "staged" as const,
            file,
            status: "queued" as const,
            percent: null,
            error: "",
            uploaded: null,
          })),
        ]);
      }
    },
    [disabled, remainingSlots, queue],
  );

  const uploadAll = useCallback(async () => {
    const staged = queue.filter(
      (entry): entry is Extract<QueueEntry, { kind: "staged" }> =>
        entry.kind === "staged" && entry.status === "queued",
    );
    if (!staged.length) return;

    await Promise.all(
      staged.map(async (entry) => {
        setQueue((previous) =>
          previous.map((item) =>
            item === entry
              ? { ...item, status: "uploading" as const, percent: 0 }
              : item,
          ),
        );

        const task = uploadWithProgress(uploadRoute, entry.file, {
          onProgress: (progress) => {
            setQueue((previous) =>
              previous.map((item) =>
                item === entry
                  ? { ...item, percent: progress.percent }
                  : item,
              ),
            );
          },
        });
        tasksRef.current.set(entry, task);

        try {
          const result = await task.promise;
          tasksRef.current.delete(entry);
          const uploaded = (result.data as { files?: NoticeAttachment[] })
            .files?.[0];
          if (!uploaded) {
            throw new Error("The server did not confirm the upload.");
          }
          onChange([...value, uploaded]);
          setQueue((previous) =>
            previous.filter((item) => item !== entry),
          );
        } catch (error) {
          tasksRef.current.delete(entry);
          setQueue((previous) =>
            previous.map((item) =>
              item === entry
                ? {
                    ...item,
                    status: "error" as const,
                    error:
                      error instanceof Error
                        ? error.message
                        : "The file could not be uploaded.",
                  }
                : item,
            ),
          );
        }
      }),
    );
  }, [queue, onChange, value]);

  // Upload queued entries as soon as they are picked.
  React.useEffect(() => {
    const hasQueued = queue.some(
      (entry) => entry.kind === "staged" && entry.status === "queued",
    );
    if (hasQueued && !disabled) {
      void uploadAll();
    }
  }, [queue, disabled, uploadAll]);

  const removeEntry = useCallback(
    (entry: QueueEntry) => {
      tasksRef.current.get(entry)?.abort();
      tasksRef.current.delete(entry);
      if (entry.kind === "attached") {
        const fileId = entry.attachment.fileId;
        onChange(value.filter((attachment) => attachment.fileId !== fileId));
        // Also remove any staged entry that uploaded this file (race condition).
        setQueue((previous) =>
          previous.filter(
            (item) =>
              !(
                item.kind === "staged" &&
                item.uploaded?.fileId === fileId
              ),
          ),
        );
        return;
      }
      // Staged entry: abort an in-flight transfer, then drop the row.
      if (entry.uploaded) {
        onChange(value.filter((attachment) => attachment.fileId !== entry.uploaded!.fileId));
      }
      setQueue((previous) => previous.filter((item) => item !== entry));
    },
    [onChange, value],
  );

  const dismissRejections = useCallback(() => setRejections([]), []);

  const entries = useMemo(() => {
    const attached: QueueEntry[] = value.map((attachment) => ({
      kind: "attached" as const,
      attachment,
    }));
    // A staged row whose upload completed is already mirrored in `value`;
    // keep it out of the list until the queue update lands so the same
    // file never renders twice.
    const pending = queue.filter(
      (entry) => entry.kind !== "staged" || !entry.uploaded,
    );

    // Deduplicate by fileId in case both attached and staged (with uploaded)
    // coexist during the render between onChange and setQueue.
    const seen = new Set<string>();
    const deduplicated = [...attached, ...pending].filter((entry) => {
      const fileId =
        entry.kind === "attached"
          ? entry.attachment.fileId
          : entry.uploaded?.fileId;
      if (!fileId || seen.has(fileId)) return false;
      seen.add(fileId);
      return true;
    });

    return deduplicated;
  }, [value, queue]);

  return (
    <div className="space-y-3">
      <Dropzone
        onFiles={admit}
        accept={ACCEPT}
        acceptHint={ACCEPT_HINT}
        multiple
        maxTotalBytes={MAX_BYTES}
        disabled={disabled || remainingSlots === 0}
        onReject={(_, reason) =>
          setRejections((previous) => [...previous, reason])
        }
        label={
          remainingSlots === 0
            ? "Attachment limit reached"
            : "Drop attachment files or click to browse"
        }
        compact
      />

      {rejections.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"
        >
          <ul className="list-inside list-disc space-y-0.5 text-xs text-red-700">
            {rejections.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={dismissRejections}
            className="mt-1 text-xs font-semibold text-red-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {entries.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {entries.map((entry, index) => {
            const attachment =
              entry.kind === "attached"
                ? entry.attachment
                : entry.uploaded;
            const file = entry.kind === "staged" ? entry.file : null;
            const name = attachment?.originalName || file?.name || "File";
            const size = attachment
              ? attachment.sizeBytes
              : file
                ? file.size
                : 0;
            const mimeType = attachment?.mimeType || file?.type || "";
            const kind = previewKindOf(mimeType);
            return (
              <li
                key={`${name}-${index}`}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <AttachmentIcon mimeType={mimeType} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-800">
                    {name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatBytes(size)}
                    {attachment ? ` · ${mimeType}` : ""}
                  </p>
                  {entry.kind === "staged" && entry.status === "uploading" && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber-600 transition-all"
                        style={{
                          width: `${entry.percent ?? 0}%`,
                        }}
                      />
                    </div>
                  )}
                  {entry.kind === "staged" && entry.status === "error" && (
                    <p className="mt-0.5 text-[11px] text-red-600">
                      {entry.error}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {entry.kind === "staged" && entry.status === "uploading" && (
                    <FontAwesomeIcon
                      icon={faSpinner}
                      className="animate-spin text-xs text-slate-400"
                      aria-label="Uploading"
                    />
                  )}
                  {entry.kind === "staged" && entry.status === "done" && (
                    <FontAwesomeIcon
                      icon={faCircleCheck}
                      className="text-xs text-emerald-600"
                      aria-label="Uploaded"
                    />
                  )}
                  {entry.kind === "staged" && entry.status === "error" && (
                    <FontAwesomeIcon
                      icon={faCircleExclamation}
                      className="text-xs text-red-500"
                      aria-label="Upload failed"
                    />
                  )}
                  {attachment && attachment.isPreviewable && (
                    <button
                      type="button"
                      title="Preview attachment"
                      aria-label={`Preview ${name}`}
                      onClick={() =>
                        setPreview({
                          fileId: attachment.fileId,
                          originalName: attachment.originalName,
                          mimeType: attachment.mimeType,
                          extension: attachment.extension,
                          sizeBytes: attachment.sizeBytes,
                          isPreviewable: true,
                        })
                      }
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      <FontAwesomeIcon icon={faEye} aria-hidden="true" />
                    </button>
                  )}
                  {attachment && (
                    <button
                      type="button"
                      title="Download attachment"
                      aria-label={`Download ${name}`}
                      onClick={() =>
                        void downloadStoredFileById(
                          attachment.fileId,
                          attachment.originalName,
                        ).catch(() => {})
                      }
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      <FontAwesomeIcon icon={faDownload} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Remove attachment"
                    aria-label={`Remove ${name}`}
                    onClick={() => removeEntry(entry)}
                    disabled={disabled}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-slate-400">
        Up to {MAX_FILES} files · {formatBytes(MAX_BYTES)} each.
        {kindNote(entries)}
      </p>

      <DocumentViewerModal
        file={preview}
        onClose={() => setPreview(null)}
      />
    </div>
  );
};

function kindNote(entries: QueueEntry[]): string {
  const previewable = entries.filter((entry) => {
    const attachment =
      entry.kind === "attached"
        ? entry.attachment
        : entry.kind === "staged"
          ? entry.uploaded
          : null;
    return Boolean(attachment?.isPreviewable);
  }).length;
  return previewable
    ? `${previewable} file(s) can be previewed inside CollegeOS.`
    : "";
}

/**
 * A stable identity for a File so the same pick cannot be staged twice.
 * Browsers expose only name, size and lastModified, so those three
 * together are the best client-side dedupe available.
 */
function fileSignature(file: File): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

function AttachmentIcon({ mimeType }: { mimeType: string }): React.ReactNode {
  const kind = previewKindOf(mimeType);
  const icon: IconDefinition =
    kind === "pdf"
      ? faFilePdf
      : kind === "image"
        ? faFileImage
        : mimeType.includes("wordprocessing")
          ? faFileWord
          : mimeType.includes("presentation")
            ? faFilePowerpoint
            : faFile;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
      <FontAwesomeIcon icon={icon} className="text-sm text-slate-500" aria-hidden="true" />
    </span>
  );
}

export default NoticeAttachments;
