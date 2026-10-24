import React, { useCallback, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCloudArrowUp, faFolderOpen } from "@fortawesome/free-solid-svg-icons";

export interface DropzoneProps {
  /** Called with the accepted files the user dropped or picked. */
  onFiles: (files: File[]) => void;
  /**
   * Optional client-side gate. Return an error string to refuse the
   * pick before any bytes move; the server re-validates regardless.
   */
  validate?: (file: File) => string | null;
  /** Human-readable hint of what is accepted, e.g. "PDF · DOCX · ZIP". */
  acceptHint?: string;
  /** Mirrors the `accept` attribute of the hidden input. */
  accept?: string;
  /** Allow several files at once (default) or force one at a time. */
  multiple?: boolean;
  /** Maximum total bytes for one drop; larger drops are refused up front. */
  maxTotalBytes?: number;
  /** Reported with the offending file when `validate` or the size gate refuses. */
  onReject?: (file: File, reason: string) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Accessible name for the drop region. */
  label?: string;
  className?: string;
}

/**
 * Drag-and-drop + browse target.
 *
 * The drop region is a real button (keyboard: Enter/Space opens the
 * picker) and the picker itself is a labelled input, so the whole
 * flow works without a mouse. Nothing is uploaded here — accepted
 * files are handed to the caller's queue, which owns the transfer.
 */
export const Dropzone: React.FC<DropzoneProps> = ({
  onFiles,
  validate,
  acceptHint,
  accept,
  multiple = true,
  maxTotalBytes,
  onReject,
  disabled = false,
  compact = false,
  label = "Drop files here or browse",
  className = "",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const admit = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const picked = Array.from(files).slice(0, multiple ? undefined : 1);
      const accepted: File[] = [];
      for (const file of picked) {
        if (maxTotalBytes && file.size > maxTotalBytes) {
          onReject?.(
            file,
            `File exceeds the ${formatMb(maxTotalBytes)} size limit.`,
          );
          continue;
        }
        const reason = validate?.(file);
        if (reason) {
          onReject?.(file, reason);
          continue;
        }
        accepted.push(file);
      }
      if (accepted.length > 0) onFiles(accepted);
    },
    [maxTotalBytes, multiple, onFiles, onReject, validate],
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (disabled) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (!disabled) admit(event.dataTransfer?.files ?? null);
      }}
      className={[
        "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors",
        compact ? "px-4 py-4" : "px-6 py-8",
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
          : dragging
            ? "cursor-pointer border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
            : "cursor-pointer border-slate-300 bg-slate-50 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-900/60",
        className,
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          admit(event.target.files);
          // Allow picking the same file twice in a row.
          event.target.value = "";
        }}
      />
      <span
        className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${
          dragging
            ? "bg-[var(--color-primary)] text-white"
            : "bg-white text-slate-400 shadow-sm dark:bg-slate-800"
        }`}
        aria-hidden="true"
      >
        <FontAwesomeIcon
          icon={dragging ? faCloudArrowUp : faFolderOpen}
          className="text-lg"
        />
      </span>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </p>
      {acceptHint && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {acceptHint}
        </p>
      )}
      {maxTotalBytes && (
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          Up to {formatMb(maxTotalBytes)} per file
        </p>
      )}
    </div>
  );
};

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export default Dropzone;
