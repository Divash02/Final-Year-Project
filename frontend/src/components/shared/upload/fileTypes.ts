/**
 * File taxonomy shared by every upload surface in CollegeOS.
 *
 * The categories mirror the server's file policies (`FILE_POLICIES` in
 * `backend/src/services/fileStorage.js`), which are the real contract:
 * a class here never claims a type the server will refuse. The lists are
 * duplicated on purpose — the client validates early so a bad pick is
 * rejected before any bytes move, and the server re-validates against
 * the file's actual content, which the browser cannot do.
 */

export type FileCategory =
  | "pdf"
  | "document"
  | "presentation"
  | "spreadsheet"
  | "image"
  | "archive"
  | "text"
  | "video"
  | "audio"
  | "code"
  | "other";

export interface FileTypeInfo {
  category: FileCategory;
  label: string;
}

const EXTENSION_MAP: Record<string, FileTypeInfo> = {
  pdf: { category: "pdf", label: "PDF" },
  doc: { category: "document", label: "Word" },
  docx: { category: "document", label: "Word" },
  odt: { category: "document", label: "Text document" },
  ppt: { category: "presentation", label: "PowerPoint" },
  pptx: { category: "presentation", label: "PowerPoint" },
  xls: { category: "spreadsheet", label: "Excel" },
  xlsx: { category: "spreadsheet", label: "Excel" },
  csv: { category: "spreadsheet", label: "CSV" },
  png: { category: "image", label: "Image" },
  jpg: { category: "image", label: "Image" },
  jpeg: { category: "image", label: "Image" },
  webp: { category: "image", label: "Image" },
  gif: { category: "image", label: "Image" },
  zip: { category: "archive", label: "Archive" },
  "rar": { category: "archive", label: "Archive" },
  "7z": { category: "archive", label: "Archive" },
  txt: { category: "text", label: "Text" },
  md: { category: "text", label: "Markdown" },
  mp4: { category: "video", label: "Video" },
  webm: { category: "video", label: "Video" },
  mov: { category: "video", label: "Video" },
  mp3: { category: "audio", label: "Audio" },
  wav: { category: "audio", label: "Audio" },
  ogg: { category: "audio", label: "Audio" },
  js: { category: "code", label: "Code" },
  ts: { category: "code", label: "Code" },
  tsx: { category: "code", label: "Code" },
  jsx: { category: "code", label: "Code" },
  py: { category: "code", label: "Code" },
  java: { category: "code", label: "Code" },
  c: { category: "code", label: "Code" },
  cpp: { category: "code", label: "Code" },
  json: { category: "code", label: "JSON" },
  sql: { category: "code", label: "SQL" },
};

export function getFileTypeInfo(file: {
  name: string;
  type?: string;
}): FileTypeInfo {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const byExtension = EXTENSION_MAP[extension];
  if (byExtension) return byExtension;

  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return { category: "image", label: "Image" };
  if (mime.startsWith("video/")) return { category: "video", label: "Video" };
  if (mime.startsWith("audio/")) return { category: "audio", label: "Audio" };
  if (mime === "application/pdf") return { category: "pdf", label: "PDF" };
  return { category: "other", label: "File" };
}

/**
 * Whether the browser can render the file inline.
 *
 * Deliberately conservative: the server only inlines PDF and a small
 * set of images (`INLINE_MIME_TYPES`), so anything else is offered as
 * download + metadata, never as a broken preview.
 */
export function canPreviewInline(file: { name: string; type?: string }): boolean {
  const { category } = getFileTypeInfo(file);
  return category === "pdf" || category === "image";
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/** "name.pdf" → { stem: "name", extension: "pdf" } */
export function splitFileName(name: string): {
  stem: string;
  extension: string;
} {
  const index = name.lastIndexOf(".");
  if (index <= 0) return { stem: name, extension: "" };
  return {
    stem: name.slice(0, index),
    extension: name.slice(index + 1).toLowerCase(),
  };
}

/**
 * De-duplicates a filename against names already in use, so an upload
 * never silently pretends two "Lecture 3.pdf" files are the same file.
 */
export function uniqueFileName(
  name: string,
  taken: (candidate: string) => boolean,
): string {
  if (!taken(name)) return name;
  const { stem, extension } = splitFileName(name);
  for (let attempt = 2; attempt < 100; attempt += 1) {
    const candidate = extension
      ? `${stem} (${attempt}).${extension}`
      : `${stem} (${attempt})`;
    if (!taken(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}${extension ? `.${extension}` : ""}`;
}
