import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faCircleExclamation,
  faFileLines,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { downloadStoredFile } from "../../../services/uploadClient";
import { canPreviewInline, formatBytes } from "./fileTypes";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export interface FilePreviewProps {
  /** Stored file id served by `/api/files/:id`. */
  fileId: string;
  originalName: string;
  mimeType?: string;
  sizeBytes?: number | null;
  onClose?: () => void;
  className?: string;
}

/**
 * In-browser preview where the platform permits it.
 *
 * Only PDF and raster images render inline — the same allow-list the
 * server streams with `Content-Disposition: inline`. The bytes are
 * fetched through the authorized files route (an `<iframe>` cannot send
 * the session token, so the file is turned into an object URL first).
 * Every other type gets an information panel with a download action,
 * because guessing at a preview would render a broken frame.
 */
export const FilePreview: React.FC<FilePreviewProps> = ({
  fileId,
  originalName,
  mimeType,
  sizeBytes,
  onClose,
  className = "",
}) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const inline = useMemo(
    () => canPreviewInline({ name: originalName, type: mimeType }),
    [originalName, mimeType],
  );

  // Authenticated object URL for the inline viewer.
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    if (!inline) {
      setObjectUrl(null);
      return;
    }
    let revoked = false;
    let url: string | null = null;
    (async () => {
      try {
        const token = localStorage.getItem("collegeos_token");
        const response = await fetch(`${API_BASE}/files/${fileId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ||
              `Preview unavailable (HTTP ${response.status}).`,
          );
        }
        const blob = await response.blob();
        if (revoked) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      } catch (error) {
        if (!revoked) {
          setPreviewError(
            error instanceof Error ? error.message : "Preview unavailable.",
          );
        }
      }
    })();
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId, inline]);

  const download = useCallback(async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadStoredFile(fileId, originalName);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Download failed.",
      );
    } finally {
      setDownloading(false);
    }
  }, [fileId, originalName]);

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
          {originalName}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            icon={faArrowDown}
            onClick={download}
            isLoading={downloading}
            loadingLabel="Downloading"
          >
            Download
          </Button>
          {onClose && (
            <IconButton
              icon={faXmark}
              label="Close preview"
              onClick={onClose}
              hideTooltip
            />
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-100 dark:bg-slate-900">
        {inline ? (
          previewError ? (
            <PreviewMessage
              title="This file could not be previewed"
              detail={previewError}
              onDownload={download}
              downloading={downloading}
            />
          ) : objectUrl ? (
            mimeType === "application/pdf" ? (
              <iframe
                title={`Preview of ${originalName}`}
                src={objectUrl}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4">
                <img
                  src={objectUrl}
                  alt={originalName}
                  className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
                />
              </div>
            )
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center">
              <span
                className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent"
                role="status"
                aria-label="Loading preview"
              />
            </div>
          )
        ) : (
          <PreviewMessage
            title="No in-browser preview for this file type"
            detail={`${mimeType || "This format"} cannot be rendered inline. Download it to open it in its own application.${
              sizeBytes != null ? ` Size: ${formatBytes(sizeBytes)}.` : ""
            }`}
            onDownload={download}
            downloading={downloading}
          />
        )}
      </div>
    </div>
  );
};

const PreviewMessage: React.FC<{
  title: string;
  detail: string;
  onDownload: () => void;
  downloading: boolean;
}> = ({ title, detail, onDownload, downloading }) => (
  <div className="flex h-full min-h-64 flex-col items-center justify-center p-8 text-center">
    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm dark:bg-slate-800">
      <FontAwesomeIcon icon={faFileLines} className="text-2xl" aria-hidden="true" />
    </span>
    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
      {title}
    </h3>
    <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
      {detail}
    </p>
    <Button
      variant="primary"
      size="sm"
      icon={faArrowDown}
      className="mt-4"
      onClick={onDownload}
      isLoading={downloading}
      loadingLabel="Downloading"
    >
      Download file
    </Button>
  </div>
);

export default FilePreview;
