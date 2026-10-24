import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faChevronLeft,
  faChevronRight,
  faMagnifyingGlassPlus,
  faMagnifyingGlassMinus,
  faExpand,
  faCompress,
  faDownload,
  faPrint,
  faRotate,
  faFilePdf,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { fetchPreviewUrl } from "../../../lib/documentPreview";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export interface PdfViewerProps {
  /** Stored file id served by the authenticated `/api/files/:id` route. */
  fileId: string;
  fileName?: string;
  onDownload?: (fileId: string, fileName?: string) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; pageCount: number }
  | { kind: "error"; message: string };

/** Toolbar button used only inside the PDF viewer toolbar. */
const ToolbarButton: React.FC<{
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  icon: IconDefinition;
  active?: boolean;
}> = ({ label, onClick, disabled, icon, active }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active || undefined}
    onClick={onClick}
    disabled={disabled}
    className={[
      "inline-flex h-8 w-8 items-center justify-center rounded-md",
      active
        ? "bg-amber-100 text-amber-800"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      disabled ? "cursor-not-allowed opacity-40" : "",
    ].join(" ")}
  >
    <FontAwesomeIcon icon={icon} aria-hidden="true" />
  </button>
);

/**
 * Embedded PDF reader.
 *
 * The document is fetched through the authenticated file
 * route as a blob, so previewing never weakens file
 * permissions and never forces a download. Rendering uses
 * PDF.js with a Vite-served worker — no remote worker CDN.
 */
export const PdfViewer: React.FC<PdfViewerProps> = ({
  fileId,
  fileName,
  onDownload,
}) => {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [renderError, setRenderError] = useState("");

  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    docRef.current?.destroy();
    docRef.current = null;
  }, []);

  const load = useCallback(async () => {
    cleanup();
    setState({ kind: "loading" });
    setPage(1);
    setRenderError("");
    try {
      const { url } = await fetchPreviewUrl(fileId);
      objectUrlRef.current = url;
      const doc = await pdfjs.getDocument({ url }).promise;
      docRef.current = doc;
      setState({ kind: "ready", pageCount: doc.numPages });
    } catch (error) {
      docRef.current = null;
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The PDF could not be loaded.",
      });
    }
  }, [fileId, cleanup]);

  useEffect(() => {
    void load();
    return cleanup;
  }, [load, cleanup]);

  /** Renders the current page onto the canvas at the active scale. */
  const renderPage = useCallback(
    async (doc: pdfjs.PDFDocumentProxy, pageNumber: number, zoom: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      renderTaskRef.current?.cancel();
      setRenderError("");

      try {
        const pdfPage = await doc.getPage(pageNumber);
        const baseViewport = pdfPage.getViewport({ scale: 1 });

        let targetScale = zoom;
        const container = containerRef.current;
        if (fitWidth && container) {
          const availableWidth = container.clientWidth - 8;
          if (availableWidth > 0 && baseViewport.width > 0) {
            targetScale = Math.min(
              Math.max(availableWidth / baseViewport.width, MIN_ZOOM),
              MAX_ZOOM,
            );
          }
        }

        const viewport = pdfPage.getViewport({ scale: targetScale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const context = canvas.getContext("2d");
        if (!context) return;

        const renderTask = pdfPage.render({
          canvasContext: context,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (error) {
        // Rendering is cancelled whenever the page or zoom changes;
        // only genuine failures are surfaced.
        if (
          error instanceof Error &&
          error.name === "RenderingCancelledException"
        ) {
          return;
        }
        setRenderError("This page could not be rendered. Try again.");
      }
    },
    [fitWidth],
  );

  const pageCount = state.kind === "ready" ? state.pageCount : 0;

  useEffect(() => {
    if (state.kind !== "ready" || !docRef.current) return;
    void renderPage(docRef.current, page, scale);
  }, [page, scale, state, renderPage]);

  // Re-render on container resize (rotation, split view) while in
  // fit-width mode.
  useEffect(() => {
    if (!fitWidth || state.kind !== "ready") return;
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (docRef.current) {
        void renderPage(docRef.current, page, scale);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitWidth, page, scale, state, renderPage]);

  const goToPage = useCallback(
    (value: number) => {
      if (!Number.isFinite(value) || pageCount === 0) return;
      setPage(Math.min(Math.max(Math.round(value), 1), pageCount));
    },
    [pageCount],
  );

  const zoomIn = useCallback(() => {
    setFitWidth(false);
    setScale((value) => Math.min(value + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const zoomOut = useCallback(() => {
    setFitWidth(false);
    setScale((value) => Math.max(value - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const toggleFitWidth = useCallback(() => {
    setFitWidth((value) => !value);
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

  const handlePrint = useCallback(() => {
    if (!objectUrlRef.current) return;
    // The blob URL is opened in a throwaway window so the
    // browser prints the document itself, not the viewer chrome.
    const printWindow = window.open(objectUrlRef.current, "_blank");
    if (printWindow) {
      printWindow.addEventListener("load", () => {
        printWindow.focus();
        printWindow.print();
      });
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (onDownload) {
      onDownload(fileId, fileName);
      return;
    }
    if (objectUrlRef.current) {
      const anchor = document.createElement("a");
      anchor.href = objectUrlRef.current;
      anchor.download = fileName || "document.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  }, [fileId, fileName, onDownload]);

  const pageLabel =
    state.kind === "ready"
      ? `Page ${page} of ${pageCount}`
      : "Loading document";

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-[60vh] flex-col bg-slate-100"
      data-testid="pdf-viewer"
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2">
        <ToolbarButton
          label="Previous page"
          disabled={state.kind !== "ready" || page <= 1}
          onClick={() => goToPage(page - 1)}
          icon={faChevronLeft}
        />
        <ToolbarButton
          label="Next page"
          disabled={state.kind !== "ready" || page >= pageCount}
          onClick={() => goToPage(page + 1)}
          icon={faChevronRight}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={pageCount || 1}
            value={page}
            aria-label="Page number"
            disabled={state.kind !== "ready"}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value)) goToPage(value);
            }}
            className="h-8 w-16 rounded border border-slate-300 px-2 text-xs disabled:bg-slate-100"
          />
          <span className="text-xs text-slate-500">/ {pageCount || "—"}</span>
        </div>

        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />

        <ToolbarButton
          label="Zoom out"
          disabled={state.kind !== "ready"}
          onClick={zoomOut}
          icon={faMagnifyingGlassMinus}
        />
        <span className="w-12 text-center text-xs text-slate-600" aria-live="polite">
          {fitWidth ? "Fit" : `${Math.round(scale * 100)}%`}
        </span>
        <ToolbarButton
          label="Zoom in"
          disabled={state.kind !== "ready"}
          onClick={zoomIn}
          icon={faMagnifyingGlassPlus}
        />
        <ToolbarButton
          label={fitWidth ? "Fixed zoom" : "Fit to width"}
          disabled={state.kind !== "ready"}
          onClick={toggleFitWidth}
          icon={fitWidth ? faCompress : faExpand}
          active={fitWidth}
        />

        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />

        <ToolbarButton
          label="Print"
          disabled={state.kind !== "ready"}
          onClick={handlePrint}
          icon={faPrint}
        />
        <ToolbarButton
          label="Download PDF"
          disabled={state.kind !== "ready"}
          onClick={handleDownload}
          icon={faDownload}
        />
        <ToolbarButton
          label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          disabled={state.kind !== "ready"}
          onClick={toggleFullscreen}
          icon={isFullscreen ? faCompress : faExpand}
        />

        <span className="ml-auto text-xs font-medium text-slate-600">
          {pageLabel}
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto p-2">
        {state.kind === "loading" && (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-slate-500">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xl" />
            <p className="text-sm">Loading PDF…</p>
          </div>
        )}
        {state.kind === "error" && (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-center">
            <FontAwesomeIcon icon={faFilePdf} className="text-3xl text-slate-300" />
            <p className="max-w-sm text-sm text-slate-600">{state.message}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800"
            >
              <FontAwesomeIcon icon={faRotate} /> Retry
            </button>
          </div>
        )}
        {state.kind === "ready" && (
          <div className="flex min-h-full items-start justify-center">
            <canvas
              ref={canvasRef}
              className="bg-white shadow-sm"
              role="img"
              aria-label={`PDF page ${page} of ${pageCount}`}
            />
            {renderError && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {renderError}
                <button
                  type="button"
                  onClick={() => {
                    if (docRef.current) {
                      void renderPage(docRef.current, page, scale);
                    }
                  }}
                  className="ml-2 font-semibold underline"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewer;
