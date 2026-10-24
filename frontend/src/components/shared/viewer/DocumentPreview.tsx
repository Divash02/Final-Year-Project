import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFilePdf,
  faFileImage,
  faFileWord,
  faFilePowerpoint,
  faFileExcel,
  faFile,
  faDownload,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { PdfViewer } from "./PdfViewer";
import { ImageViewer } from "./ImageViewer";
import { downloadStoredFile } from "../../../services/uploadClient";

/**
 * Inline document preview dispatcher.
 *
 * Decides how a stored file is shown inside CollegeOS:
 * - PDFs open in the built-in page-by-page viewer.
 * - JPEG / PNG / WebP open in the image viewer.
 * - DOC, DOCX, PPT and PPTX cannot be rendered safely in a
 *   browser here, so the viewer says so plainly and offers
 *   the authorised download instead — it never pretends an
 *   Office file is previewable.
 *
 * Both viewers fetch bytes through `/api/files/:id`, which
 * re-checks the caller's entitlement against the owning
 * record, so previewing never weakens file permissions.
 */

export interface PreviewFile {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extension?: string;
}

export type PreviewKind = "pdf" | "image" | "office" | "other";

export function previewKindFor(mimeType: string, extension?: string): PreviewKind {
  if (mimeType === "application/pdf") return "pdf";
  if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return "image";
  if (
    mimeType.includes("wordprocessing") ||
    mimeType.includes("presentation") ||
    mimeType.includes("spreadsheet")
  ) {
    return "office";
  }
  return "other";
}

export function fileIconForPreview(mimeType: string): IconDefinition {
  if (mimeType === "application/pdf") return faFilePdf;
  if (mimeType?.startsWith("image/")) return faFileImage;
  if (mimeType?.includes("wordprocessing")) return faFileWord;
  if (mimeType?.includes("presentation")) return faFilePowerpoint;
  if (mimeType?.includes("spreadsheet")) return faFileExcel;
  return faFile;
}

export function formatPreviewSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface DocumentPreviewProps {
  file: PreviewFile;
  /** Height of the viewer area. */
  className?: string;
  /** Title shown above the viewer. */
  title?: string;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  file,
  className = "h-[70vh]",
  title,
}) => {
  const kind = previewKindFor(file.mimeType, file.extension);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const handleDownload = async () => {
    setDownloading(true);
    setError("");
    try {
      await downloadStoredFile(file.fileId, file.originalName);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The file could not be downloaded.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {title && (
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
          <FontAwesomeIcon
            icon={fileIconForPreview(file.mimeType)}
            className="text-slate-400"
            aria-hidden="true"
          />
          <span className="truncate">{title}</span>
          {formatPreviewSize(file.sizeBytes) && (
            <span className="shrink-0 text-xs font-normal text-slate-500">
              {formatPreviewSize(file.sizeBytes)}
            </span>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {kind === "pdf" && (
        <div className={className}>
          <PdfViewer
            fileId={file.fileId}
            fileName={file.originalName}
            onDownload={() => void handleDownload()}
          />
        </div>
      )}

      {kind === "image" && (
        <div className={className}>
          <ImageViewer
            fileId={file.fileId}
            fileName={file.originalName}
            onDownload={() => void handleDownload()}
          />
        </div>
      )}

      {(kind === "office" || kind === "other") && (
        <OfficeFallback
          file={file}
          kind={kind}
          onDownload={() => void handleDownload()}
          downloading={downloading}
        />
      )}
    </div>
  );
};

/** Honest fallback for formats CollegeOS cannot render inline. */
const OfficeFallback: React.FC<{
  file: PreviewFile;
  kind: PreviewKind;
  onDownload: () => void;
  downloading: boolean;
}> = ({ file, kind, onDownload, downloading }) => {
  const isOffice = kind === "office";
  const icon = fileIconForPreview(file.mimeType);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white p-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
        <FontAwesomeIcon icon={icon} className="text-3xl text-slate-400" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-medium text-slate-800">{file.originalName}</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
          {isOffice
            ? "Microsoft Office documents cannot be previewed inside CollegeOS. Download the file to read it."
            : "This file type cannot be previewed inside CollegeOS. Download it to open it."}
        </p>
        {formatPreviewSize(file.sizeBytes) && (
          <p className="mt-1 text-xs text-slate-400">
            {formatPreviewSize(file.sizeBytes)}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        className="cos-btn cos-btn-primary min-h-[2.25rem] px-4 text-xs disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faDownload} className="mr-1.5" aria-hidden="true" />
        {downloading ? "Downloading…" : "Download file"}
      </button>
    </div>
  );
};

export default DocumentPreview;
