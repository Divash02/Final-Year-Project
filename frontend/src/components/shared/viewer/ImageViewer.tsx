import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faMagnifyingGlassPlus,
  faMagnifyingGlassMinus,
  faExpand,
  faCompress,
  faDownload,
  faRotateLeft,
  faXmark,
  faSpinner,
  faImage,
} from "@fortawesome/free-solid-svg-icons";
import { fetchPreviewUrl } from "../../../lib/documentPreview";

export interface ImageViewerProps {
  /** Stored file id served by the authenticated `/api/files/:id` route. */
  fileId: string;
  fileName?: string;
  onClose?: () => void;
  onDownload?: (fileId: string, fileName?: string) => void;
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

/**
 * Inline image viewer with zoom and fullscreen.
 *
 * Bytes are fetched through the authenticated file route
 * and rendered at the image's natural aspect ratio —
 * nothing is cropped, and large images scale down to
 * fit mobile screens.
 */
export const ImageViewer: React.FC<ImageViewerProps> = ({
  fileId,
  fileName,
  onClose,
  onDownload,
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [zoomIndex, setZoomIndex] = useState(3); // 1.0
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { url } = await fetchPreviewUrl(fileId);
      setObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The image could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    void load();
    return () => {
      setObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    };
  }, [load]);

  const zoom = ZOOM_STEPS[zoomIndex];
  const zoomIn = useCallback(() => {
    setZoomIndex((value) => Math.min(value + 1, ZOOM_STEPS.length - 1));
  }, []);
  const zoomOut = useCallback(() => {
    setZoomIndex((value) => Math.max(value - 1, 0));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container
        .requestFullscreen?.()
        .then(() => setIsFullscreen(true))
        .catch(() => setIsFullscreen(false));
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => setIsFullscreen(false));
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload(fileId, fileName);
      return;
    }
    if (objectUrl) {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName || "image";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  }, [fileId, fileName, objectUrl, onDownload]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape" && onClose) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="false"
      aria-label={fileName || "Image preview"}
      onKeyDown={handleKeyDown}
      className="relative flex h-full min-h-[60vh] flex-col bg-slate-950"
      data-testid="image-viewer"
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <ToolbarButton
          label="Zoom out"
          onClick={zoomOut}
          disabled={zoomIndex === 0}
          icon={faMagnifyingGlassMinus}
          dark
        />
        <span className="w-12 text-center text-xs text-slate-300" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <ToolbarButton
          label="Zoom in"
          onClick={zoomIn}
          disabled={zoomIndex === ZOOM_STEPS.length - 1}
          icon={faMagnifyingGlassPlus}
          dark
        />
        <ToolbarButton
          label="Reset zoom"
          onClick={() => setZoomIndex(3)}
          icon={faRotateLeft}
          dark
        />
        <span className="mx-1 hidden h-5 w-px bg-slate-800 sm:block" />
        <ToolbarButton
          label="Download image"
          onClick={handleDownload}
          icon={faDownload}
          dark
        />
        <ToolbarButton
          label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={toggleFullscreen}
          icon={isFullscreen ? faCompress : faExpand}
          dark
        />
        {onClose && (
          <>
            <span className="mx-1 hidden h-5 w-px bg-slate-800 sm:block" />
            <ToolbarButton
              label="Close viewer"
              onClick={onClose}
              icon={faXmark}
              dark
            />
          </>
        )}
        <span className="ml-auto max-w-[40%] truncate text-xs text-slate-400">
          {fileName || "Image"}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {loading && (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xl" />
            <p className="text-sm">Loading image…</p>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center gap-3 text-center">
            <FontAwesomeIcon icon={faImage} className="text-3xl text-slate-600" />
            <p className="max-w-sm text-sm text-slate-300">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800"
            >
              <FontAwesomeIcon icon={faRotateLeft} /> Retry
            </button>
          </div>
        )}
        {objectUrl && !loading && !error && (
          <img
            src={objectUrl}
            alt={fileName || "Calendar document"}
            style={{
              transform: `scale(${zoom})`,
              maxWidth: "100%",
              maxHeight: "100%",
            }}
            className="select-none object-contain shadow-2xl"
            draggable={false}
          />
        )}
      </div>
    </div>
  );
};

const ToolbarButton: React.FC<{
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  icon: IconDefinition;
  dark?: boolean;
}> = ({ label, onClick, disabled, icon, dark }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={onClick}
    disabled={disabled}
    className={[
      "inline-flex h-8 w-8 items-center justify-center rounded-md",
      dark
        ? "text-slate-300 hover:bg-slate-800 hover:text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      disabled ? "cursor-not-allowed opacity-40" : "",
    ].join(" ")}
  >
    <FontAwesomeIcon icon={icon} aria-hidden="true" />
  </button>
);

export default ImageViewer;
