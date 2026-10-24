import React from "react";
import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { DocumentPreview } from "./DocumentPreview";
import type { StoredFileSummary } from "../../../lib/documentPreview";

export interface DocumentViewerModalProps {
  /** File to display, or null to keep the modal closed. */
  file: StoredFileSummary | null;
  onClose: () => void;
}

/**
 * One entry point for inline document viewing across
 * CollegeOS. PDFs render in the embedded PDF.js reader,
 * images in the image viewer. Formats the application
 * cannot render (DOCX, PPTX) say so plainly and offer a
 * download — a broken preview is never shown as if the
 * document had loaded.
 */
export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  file,
  onClose,
}) => {
  return (
    <Modal
      isOpen={Boolean(file)}
      onClose={onClose}
      title={file?.originalName || "Document"}
      subtitle={
        file
          ? `${file.mimeType} · ${file.extension.toUpperCase()}`
          : undefined
      }
      maxWidth="3xl"
    >
      {file && (
        <DocumentPreview
          file={{
            fileId: file.fileId,
            originalName: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            extension: file.extension,
          }}
        />
      )}
      <div className="mt-4 flex justify-end border-t border-slate-200 pt-3">
        <Button variant="secondary" size="sm" icon={faXmark} onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default DocumentViewerModal;
