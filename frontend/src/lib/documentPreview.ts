import { fetchStoredFileBlob } from "../services/apiClient";

/**
 * Authenticated inline document preview.
 *
 * Stored files are private: `/api/files/:id` authorises every
 * request against the record that owns the file. An inline
 * viewer therefore cannot use a plain URL — the bytes are
 * fetched with the session token (through the central API client)
 * and exposed to the viewer through a short-lived object URL,
 * which is revoked when the viewer closes.
 */

export type PreviewKind = "pdf" | "image" | "office" | "other";

export interface StoredFileSummary {
  fileId: string;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  isPdf?: boolean;
  isImage?: boolean;
  isPreviewable?: boolean;
}

const PDF_MIME = "application/pdf";
const IMAGE_MIME_PREFIX = "image/";
const OFFICE_MIMES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function previewKindOf(mimeType: string): PreviewKind {
  if (mimeType === PDF_MIME) return "pdf";
  if (mimeType.startsWith(IMAGE_MIME_PREFIX)) return "image";
  if (OFFICE_MIMES.has(mimeType)) return "office";
  return "other";
}

export function formatBytes(bytes: number): string {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Fetches a stored file with the session token and returns a
 * blob URL the browser can render inline. Callers must revoke
 * the URL with `URL.revokeObjectURL` when done.
 */
export async function fetchPreviewUrl(
  fileId: string,
): Promise<{ url: string; mimeType: string }> {
  const blob = await fetchStoredFileBlob(fileId);
  const mimeType = blob.type || "application/octet-stream";
  return { url: URL.createObjectURL(blob), mimeType };
}

/**
 * Streams a stored file to the browser as a download.
 * A plain anchor cannot send the session token, so the
 * bytes are fetched with authority and opened through an
 * object URL instead.
 */
export async function downloadStoredFileById(
  fileId: string,
  filename: string,
): Promise<void> {
  const { url } = await fetchPreviewUrl(fileId);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
