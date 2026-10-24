import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faClock } from "@fortawesome/free-solid-svg-icons";
import { formatBytes, getFileTypeInfo } from "./fileTypes";

export interface FileMetadataProps {
  name: string;
  mimeType?: string;
  sizeBytes?: number | null;
  sizeLabel?: string;
  uploadedBy?: string | null;
  uploadedAt?: string | null;
  version?: number;
  downloadCount?: number;
  /** Extra rows the owning module wants to show (folder, tags, …). */
  extra?: { label: string; value: React.ReactNode }[];
  className?: string;
}

/**
 * Read-only file facts: type, size, owner, version, timestamps.
 * Every row is label + value text, so the metadata never depends on
 * iconography alone.
 */
export const FileMetadata: React.FC<FileMetadataProps> = ({
  name,
  mimeType,
  sizeBytes,
  sizeLabel,
  uploadedBy,
  uploadedAt,
  version,
  downloadCount,
  extra,
  className = "",
}) => {
  const info = getFileTypeInfo({ name, type: mimeType });
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "File name", value: name },
    { label: "Type", value: `${info.label}${mimeType ? ` (${mimeType})` : ""}` },
    {
      label: "Size",
      value: sizeLabel || formatBytes(sizeBytes),
    },
  ];
  if (version != null) {
    rows.push({
      label: "Version",
      value: (
        <span className="inline-flex items-center gap-1.5">
          v{version}
          <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3 text-emerald-600" aria-hidden="true" />
          Current
        </span>
      ),
    });
  }
  if (uploadedBy) rows.push({ label: "Uploaded by", value: uploadedBy });
  if (uploadedAt) {
    rows.push({
      label: "Uploaded",
      value: (
        <span className="inline-flex items-center gap-1.5">
          <FontAwesomeIcon icon={faClock} className="h-3 w-3" aria-hidden="true" />
          {new Date(uploadedAt).toLocaleString()}
        </span>
      ),
    });
  }
  if (downloadCount != null) {
    rows.push({ label: "Downloads", value: String(downloadCount) });
  }
  if (extra) rows.push(...extra);

  return (
    <dl className={`divide-y divide-slate-100 dark:divide-slate-800 ${className}`}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4 py-2"
        >
          <dt className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
            {row.label}
          </dt>
          <dd className="min-w-0 truncate text-right text-xs font-medium text-slate-800 dark:text-slate-200">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export default FileMetadata;
