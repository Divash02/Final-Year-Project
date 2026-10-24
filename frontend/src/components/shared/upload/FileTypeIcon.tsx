import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArchive,
  faFile,
  faFileAudio,
  faFileCode,
  faFileImage,
  faFileLines,
  faFilePowerpoint,
  faFileExcel,
  faFilePdf,
  faFileVideo,
} from "@fortawesome/free-solid-svg-icons";
import {
  FileCategory,
  getFileTypeInfo,
} from "./fileTypes";

const ICONS: Record<FileCategory, typeof faFile> = {
  pdf: faFilePdf,
  document: faFileLines,
  presentation: faFilePowerpoint,
  spreadsheet: faFileExcel,
  image: faFileImage,
  archive: faArchive,
  text: faFileLines,
  video: faFileVideo,
  audio: faFileAudio,
  code: faFileCode,
  other: faFile,
};

/** Tint per category — the label text next to it carries the meaning. */
const TINTS: Record<FileCategory, string> = {
  pdf: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  document: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  presentation:
    "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  spreadsheet:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  image: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  archive: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  text: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  video: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  audio: "bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
  code: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  other: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export interface FileTypeIconProps {
  name: string;
  type?: string;
  size?: "sm" | "md" | "lg";
  /** Include the short label (PDF, Word, …) under the glyph. */
  withLabel?: boolean;
  className?: string;
}

/**
 * File glyph + optional label. The category icon is always paired with
 * readable text somewhere nearby, so file type is never colour-only.
 */
export const FileTypeIcon: React.FC<FileTypeIconProps> = ({
  name,
  type,
  size = "md",
  withLabel = false,
  className = "",
}) => {
  const info = getFileTypeInfo({ name, type });
  const icon = ICONS[info.category];
  const glyph =
    size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";
  const box =
    size === "sm"
      ? "h-7 w-7 rounded-md"
      : size === "lg"
        ? "h-14 w-14 rounded-xl"
        : "h-9 w-9 rounded-lg";

  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className}`}
      title={`${info.label} file`}
    >
      <span
        className={`inline-flex shrink-0 items-center justify-center ${box} ${TINTS[info.category]}`}
        aria-hidden="true"
      >
        <FontAwesomeIcon icon={icon} className={glyph} />
      </span>
      {withLabel && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
            {name}
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {info.label}
          </span>
        </span>
      )}
    </span>
  );
};

export default FileTypeIcon;
