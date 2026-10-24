import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faCircleCheck,
  faCopy,
  faDownload,
  faEllipsis,
  faEye,
  faFilePen,
  faFolderOpen,
  faRotateRight,
  faTrashCan,
  faTriangleExclamation,
  faUpload,
} from "@fortawesome/free-solid-svg-icons";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { FormField, Input, SelectField } from "../../ui/Input";
import { IconButton } from "../../ui/IconButton";
import {
  deleteLearningMaterial,
  downloadStoredFile,
  fetchCourseWeeks,
  fetchLearningMaterial,
  fetchLearningMaterials,
  MaterialStatus,
  replaceLearningMaterialFile,
  setMaterialStatus,
  updateMaterial,
} from "../../../services/lmsApi";
import { uploadWithProgress } from "../../../services/uploadClient";
import { formatBytes, splitFileName } from "../../shared/upload/fileTypes";
import { FilePreview } from "../../shared/upload/FilePreview";
import { FileUploader } from "../../shared/upload/FileUploader";
import { Dropzone } from "../../shared/upload/Dropzone";
import { FileTypeIcon } from "../../shared/upload/FileTypeIcon";
import { useUploadQueue } from "../../shared/upload/useUploadQueue";
import type {
  LmsMaterial,
  LmsMaterialType,
  LmsWeek,
} from "../../../types/lms";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { Drawer } from "../shared/Drawer";
import { PageToolbar } from "../shared/PageToolbar";
import { BulkActionBar } from "../shared/BulkActionBar";
import { StatusBadge, toSemanticStatus } from "../shared/StatusBadge";
import { useDebouncedValue } from "../shared/useDebouncedValue";

export interface MaterialsViewProps {
  courseId: string;
  access: { canManage: boolean; sections: string[] };
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

const PAGE_SIZE = 25;

const SORT_OPTIONS = [
  { value: "updated", label: "Recently uploaded" },
  { value: "name", label: "Name A–Z" },
  { value: "size", label: "Largest first" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

/**
 * The course materials library.
 *
 * A real file manager: server-side search, type and status
 * filters, pagination, bulk actions, in-browser preview where
 * the platform permits it, and a complete upload experience —
 * drag-and-drop, a live queue with progress, cancellation,
 * retry and replacement — through the shared upload system.
 */
export const MaterialsView: React.FC<MaterialsViewProps> = ({
  courseId,
  access,
  onNotice,
  onError,
}) => {
  const [materials, setMaterials] = useState<LmsMaterial[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<LmsMaterial | null>(null);
  const [renameTarget, setRenameTarget] = useState<LmsMaterial | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LmsMaterial[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage = page) => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchLearningMaterials(courseId, {
          q: debouncedSearch || undefined,
          status: statusFilter || undefined,
          materialType: typeFilter || undefined,
          page: targetPage,
          limit: PAGE_SIZE,
        });
        setMaterials(result.materials);
        setTotal(result.pagination.total);
        setPages(result.pagination.pages);
        setPage(result.pagination.page);
        setSelected(new Set());
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Course materials could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [courseId, debouncedSearch, statusFilter, typeFilter, page],
  );

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, debouncedSearch, statusFilter, typeFilter]);

  const sortedMaterials = useMemo(() => {
    const list = materials ?? [];
    if (sort === "name") {
      return [...list].sort((a, b) =>
        a.title.localeCompare(b.title),
      );
    }
    if (sort === "size") {
      return [...list].sort(
        (a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0),
      );
    }
    return list;
  }, [materials, sort]);

  /* --------------------------- upload queue --------------------------- */

  const queue = useUploadQueue({
    upload: (file, meta, onProgress) =>
      uploadWithProgress("/learning-materials", file, {
        fields: { courseId, ...meta },
        onProgress: (progress) => onProgress(progress.percent),
      }),
    onDone: () => {
      void load(1);
    },
    onError: (_item, requestError) => onError(requestError.message),
  });

  const uploadMeta = useCallback(
    (file: File) => {
      // A title the teacher typed applies to a single-file upload;
      // with several files at once, each file is titled by its own
      // name so nothing is mislabelled.
      const defaultTitle = splitFileName(file.name).stem;
      return {
        title: defaultTitle,
        ...(access.sections.length === 1
          ? { sectionCodes: access.sections[0] }
          : {}),
      };
    },
    [access.sections],
  );

  /* ----------------------------- actions ------------------------------ */

  const runOn = useCallback(
    async (
      id: string,
      action: () => Promise<unknown>,
      notice: string,
    ) => {
      setBusyId(id);
      try {
        await action();
        onNotice(notice);
      } catch (requestError) {
        onError(
          requestError instanceof Error
            ? requestError.message
            : "The action could not be completed.",
        );
      } finally {
        setBusyId(null);
      }
    },
    [onNotice, onError],
  );

  const setStatus = (material: LmsMaterial, status: MaterialStatus) =>
    void runOn(material.id, async () => {
      const { material: updated } = await setMaterialStatus(
        material.id,
        status,
      );
      setMaterials((current) =>
        (current ?? []).map((row) =>
          row.id === material.id ? updated : row,
        ),
      );
    }, `Material ${status.toLowerCase()}.`);

  const removeMaterials = async (targets: LmsMaterial[]) => {
    const ids = new Set(targets.map((row) => row.id));
    setPendingDelete([]);
    let failed = 0;
    for (const target of targets) {
      try {
        await deleteLearningMaterial(target.id);
      } catch {
        failed += 1;
      }
    }
    setMaterials((current) =>
      (current ?? []).filter((row) => !ids.has(row.id)),
    );
    setSelected(new Set());
    if (failed === 0) {
      onNotice(
        `${targets.length} material${targets.length === 1 ? "" : "s"} deleted.`,
      );
    } else {
      onError(
        `${failed} of ${targets.length} material${targets.length === 1 ? "" : "s"} could not be deleted. The rest were removed.`,
      );
      void load();
    }
  };

  const download = async (material: LmsMaterial) => {
    if (!material.file?.fileId) {
      onError("This material has no stored file to download.");
      return;
    }
    try {
      await downloadStoredFile(
        material.file.fileId,
        material.file.originalName || material.title,
      );
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The file could not be downloaded.",
      );
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPageSelected =
    sortedMaterials.length > 0 &&
    sortedMaterials.every((row) => selected.has(row.id));

  /* ----------------------------- render ------------------------------ */

  return (
    <div className="space-y-4">
      <PageToolbar
        search={{
          value: search,
          onChange: setSearch,
          label: "Search materials",
          placeholder: "Search files…",
          loading: loading,
        }}
        filters={
          <>
            <SelectField
              label="Status"
              hideLabel
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 w-32 text-xs"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PUBLISHED">Published</option>
              <option value="HIDDEN">Hidden</option>
              <option value="ARCHIVED">Archived</option>
            </SelectField>
            <SelectField
              label="Type"
              hideLabel
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-9 w-32 text-xs"
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              <option value="FILE">File</option>
              <option value="SLIDES">Slides</option>
              <option value="DOCUMENT">Document</option>
              <option value="IMAGE">Image</option>
              <option value="VIDEO">Video</option>
              <option value="AUDIO">Audio</option>
              <option value="ARCHIVE">Archive</option>
              <option value="LINK">Link</option>
              <option value="TEXT">Text</option>
            </SelectField>
            <SelectField
              label="Sort"
              hideLabel
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-9 w-40 text-xs"
              aria-label="Sort materials"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </>
        }
        actions={[
          {
            id: "upload",
            label: "Upload",
            icon: faUpload,
            primary: true,
            hidden: !access.canManage,
            onClick: () => setUploadOpen(true),
          },
        ]}
      />

      {error && (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {loading && !materials ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : sortedMaterials.length === 0 ? (
        <EmptyState
          icon={faFolderOpen}
          title="No course materials yet"
          description={
            debouncedSearch || statusFilter || typeFilter
              ? "No material matches these filters. Adjust them to see more of the library."
              : "Upload lecture slides, lab manuals, videos, notes and other resources for this course."
          }
          actionLabel={
            debouncedSearch || statusFilter || typeFilter
              ? undefined
              : access.canManage
                ? "Upload materials"
                : undefined
          }
          actionIcon={faUpload}
          onAction={
            debouncedSearch || statusFilter || typeFilter
              ? undefined
              : access.canManage
                ? () => setUploadOpen(true)
                : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all materials on this page"
                    checked={allOnPageSelected}
                    onChange={() =>
                      setSelected(
                        allOnPageSelected
                          ? new Set()
                          : new Set(sortedMaterials.map((row) => row.id)),
                      )
                    }
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                </th>
                <th className="px-3 py-2.5">Name</th>
                <th className="hidden px-3 py-2.5 md:table-cell">Type</th>
                <th className="hidden px-3 py-2.5 sm:table-cell">Size</th>
                <th className="hidden px-3 py-2.5 lg:table-cell">Version</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="hidden px-3 py-2.5 md:table-cell">Uploaded</th>
                <th className="w-24 px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedMaterials.map((material) => (
                <tr
                  key={material.id}
                  className={`group transition-colors ${
                    selected.has(material.id)
                      ? "bg-[var(--color-primary-soft)]/60"
                      : "hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(material.id)}
                      onChange={() => toggleSelected(material.id)}
                      aria-label={`Select ${material.title}`}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        material.file?.fileId
                          ? setPreviewId(material.id)
                          : undefined
                      }
                      disabled={!material.file?.fileId}
                      className="flex min-w-0 items-center gap-2.5 text-left disabled:cursor-default"
                      title={
                        material.file?.fileId
                          ? "Open preview"
                          : "No stored file"
                      }
                    >
                      <FileTypeIcon
                        name={material.file?.originalName || material.title}
                        type={material.file?.mimeType}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-200">
                          {material.title}
                        </span>
                        {material.topic && (
                          <span className="block truncate text-xs text-slate-400">
                            {material.topic}
                          </span>
                        )}
                      </span>
                    </button>
                  </td>
                  <td className="hidden px-3 py-2 text-xs text-slate-500 dark:text-slate-400 md:table-cell">
                    {material.file
                      ? (material.file.mimeType || material.file.extension).toUpperCase()
                      : material.materialType}
                  </td>
                  <td className="hidden px-3 py-2 text-xs text-slate-500 dark:text-slate-400 sm:table-cell">
                    {material.file
                      ? material.file.sizeLabel || formatBytes(material.file.sizeBytes)
                      : "—"}
                  </td>
                  <td className="hidden px-3 py-2 text-xs text-slate-500 dark:text-slate-400 lg:table-cell">
                    {material.version != null && material.version > 1 ? (
                      <Badge variant="neutral" size="sm" hideDot>
                        v{material.version}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">v1</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      status={toSemanticStatus(material.state ?? material.status)}
                    />
                  </td>
                  <td className="hidden px-3 py-2 text-xs text-slate-500 dark:text-slate-400 md:table-cell">
                    {material.uploadedAt
                      ? new Date(material.uploadedAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      {material.file?.fileId && (
                        <>
                          <IconButton
                            icon={faEye}
                            label={`Preview ${material.title}`}
                            size="sm"
                            hideTooltip={false}
                            onClick={() => setPreviewId(material.id)}
                          />
                          <IconButton
                            icon={faDownload}
                            label={`Download ${material.title}`}
                            size="sm"
                            hideTooltip
                            onClick={() => void download(material)}
                          />
                        </>
                      )}
                      {access.canManage && (
                        <MaterialMenu
                          material={material}
                          busy={busyId === material.id}
                          canManage={access.canManage}
                          onRename={() => setRenameTarget(material)}
                          onReplace={() => setReplaceTarget(material)}
                          onStatus={(status) => void setStatus(material, status)}
                          onDelete={() => setPendingDelete([material])}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {total} material{total === 1 ? "" : "s"} · page {page} of {pages}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => void load(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => void load(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <BulkActionBar
        selected={selected.size}
        onClear={() => setSelected(new Set())}
        actions={[
          {
            id: "publish",
            label: "Publish",
            hidden: !access.canManage,
            onClick: () => {
              const targets = (materials ?? []).filter((row) =>
                selected.has(row.id),
              );
              targets.forEach((target) => void setStatus(target, "PUBLISHED"));
            },
          },
          {
            id: "archive",
            label: "Archive",
            hidden: !access.canManage,
            onClick: () => {
              const targets = (materials ?? []).filter((row) =>
                selected.has(row.id),
              );
              targets.forEach((target) => void setStatus(target, "ARCHIVED"));
            },
          },
          {
            id: "delete",
            label: "Delete",
            danger: true,
            hidden: !access.canManage,
            onClick: () =>
              setPendingDelete(
                (materials ?? []).filter((row) => selected.has(row.id)),
              ),
          },
        ]}
      />

      <UploadDrawer
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        courseId={courseId}
        access={access}
        queue={queue}
        uploadMeta={uploadMeta}
        onUploaded={() => {
          setUploadOpen(false);
          onNotice("Upload complete. The library now reflects the server's response.");
        }}
        onError={onError}
        onNotice={onNotice}
      />

      {previewId && (
        <PreviewDrawer
          materialId={previewId}
          onClose={() => setPreviewId(null)}
          onDownload={(material) => void download(material)}
        />
      )}

      {replaceTarget && (
        <ReplaceFileDrawer
          material={replaceTarget}
          onClose={() => setReplaceTarget(null)}
          onReplaced={(updated) => {
            setMaterials((current) =>
              (current ?? []).map((row) =>
                row.id === updated.id ? updated : row,
              ),
            );
            setReplaceTarget(null);
            onNotice(
              `Replaced with version ${updated.version ?? "…"} of "${updated.title}". The previous file stays in version history.`,
            );
          }}
          onError={onError}
        />
      )}

      {renameTarget && (
        <RenameDrawer
          material={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={(updated) => {
            setMaterials((current) =>
              (current ?? []).map((row) =>
                row.id === updated.id ? updated : row,
              ),
            );
            setRenameTarget(null);
            onNotice("Material renamed.");
          }}
          onError={onError}
        />
      )}

      <ConfirmDialog
        isOpen={pendingDelete.length > 0}
        onClose={() => setPendingDelete([])}
        onConfirm={() => void removeMaterials(pendingDelete)}
        title={`Delete ${pendingDelete.length === 1 ? "material" : `${pendingDelete.length} materials`}?`}
        confirmLabel="Delete"
        message="Deleted materials are removed from the course library. Students will no longer see them."
        subject={
          pendingDelete.length === 1
            ? pendingDelete[0]?.title
            : undefined
        }
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Row action menu                                                   */
/* ------------------------------------------------------------------ */

const MaterialMenu: React.FC<{
  material: LmsMaterial;
  busy: boolean;
  canManage: boolean;
  onRename: () => void;
  onReplace: () => void;
  onStatus: (status: MaterialStatus) => void;
  onDelete: () => void;
}> = ({ material, busy, onRename, onReplace, onStatus, onDelete }) => {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  const status = material.state ?? material.status;

  return (
    <div className="relative" ref={ref}>
          <IconButton
            icon={faEllipsis}
            label={`Actions for ${material.title}`}
            size="sm"
            hideTooltip
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-haspopup="menu"
          />
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-8 z-40 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <MenuItem label="Rename" onClick={() => { setOpen(false); onRename(); }} />
          <MenuItem label="Replace file (new version)" onClick={() => { setOpen(false); onReplace(); }} />
          <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" role="separator" />
          {status !== "PUBLISHED" && (
            <MenuItem
              label="Publish"
              icon={faCircleCheck}
              onClick={() => { setOpen(false); onStatus("PUBLISHED"); }}
            />
          )}
          {status !== "SCHEDULED" && (
            <MenuItem
              label="Schedule release…"
              icon={faUpload}
              onClick={() => {
                setOpen(false);
                const value = window.prompt(
                  "Release date and time (ISO)",
                  material.releaseAt || "",
                );
                if (value) {
                  void updateMaterial(material.id, { releaseAt: value }).then(
                    () => onStatus("SCHEDULED"),
                  );
                }
              }}
            />
          )}
          {status !== "HIDDEN" && (
            <MenuItem
              label="Hide from students"
              onClick={() => { setOpen(false); onStatus("HIDDEN"); }}
            />
          )}
          <MenuItem
            label="Archive"
            onClick={() => { setOpen(false); onStatus("ARCHIVED"); }}
          />
          <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" role="separator" />
          <MenuItem
            label="Delete"
            icon={faTrashCan}
            danger
            onClick={() => { setOpen(false); onDelete(); }}
          />
        </div>
      )}
      {busy && (
        <span className="absolute right-1 top-1 h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" role="status" aria-label="Working" />
      )}
    </div>
  );
};

const MenuItem: React.FC<{
  label: string;
  icon?: typeof faCopy;
  onClick: () => void;
  danger?: boolean;
}> = ({ label, icon, onClick, danger }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
      danger
        ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
    }`}
  >
    {icon && (
      <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" aria-hidden="true" />
    )}
    {label}
  </button>
);

/* ------------------------------------------------------------------ */
/* Upload drawer                                                     */
/* ------------------------------------------------------------------ */

const UploadDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  access: { canManage: boolean; sections: string[] };
  queue: ReturnType<typeof useUploadQueue>;
  uploadMeta: (file: File) => Record<string, string>;
  onUploaded: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}> = ({
  isOpen,
  onClose,
  courseId,
  access,
  queue,
  uploadMeta,
  onUploaded,
  onError,
  onNotice,
}) => {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [releaseAt, setReleaseAt] = useState("");
  const [visibility, setVisibility] = useState<"DRAFT" | "SCHEDULED" | "PUBLISHED">("DRAFT");
  const [weeks, setWeeks] = useState<LmsWeek[]>([]);
  const [weekId, setWeekId] = useState("");
  const [rejections, setRejections] = useState<{ file: string; reason: string }[]>([]);

  // The queue's uploader must be (re)bound with the metadata the
  // teacher typed in this drawer, so every staged file carries it.
  useEffect(() => {
    queue.setFields({
      ...(title ? { title } : {}),
      ...(topic ? { topic } : {}),
      ...(description ? { description } : {}),
      ...(releaseAt ? { releaseAt: new Date(releaseAt).toISOString() } : {}),
      status: visibility,
      ...(weekId ? { week: weekId } : {}),
    });
  }, [title, topic, description, releaseAt, visibility, weekId, queue]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchCourseWeeks(courseId);
        if (!cancelled) setWeeks(result.weeks);
      } catch {
        // The week picker is optional; uploads work without it.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const doneCount = queue.doneCount;
  const allFinished =
    queue.items.length > 0 &&
    queue.queuedCount === 0 &&
    queue.uploadingCount === 0;
  const announcedRef = React.useRef(false);

  useEffect(() => {
    if (isOpen && allFinished && doneCount > 0 && !announcedRef.current) {
      announcedRef.current = true;
      onNotice(`${doneCount} file${doneCount === 1 ? "" : "s"} uploaded.`);
      onUploaded();
    }
    if (!allFinished) announcedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFinished, doneCount, isOpen]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Upload materials"
      subtitle={`${access.sections.length ? `Sections ${access.sections.join(", ")}` : "All sections"} · 50 MB per file`}
      width="lg"
    >
      <div className="space-y-4">
        <FileUploader
          queue={queue}
          acceptHint="PDF · DOC · DOCX · PPT · PPTX · XLS · XLSX · ZIP · TXT · MD · CSV · Images · Video · Audio"
          maxFileSizeBytes={50 * 1024 * 1024}
          onReject={(file, reason) =>
            setRejections((current) => [
              ...current,
              { file: file.name, reason },
            ])
          }
          fields={undefined}
          metadataControls={
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Title (single file)">
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    className="cos-input text-sm"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Lecture 3 — Arrays"
                  />
                )}
              </FormField>
              <FormField label="Topic">
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    className="cos-input text-sm"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="Week 3 topic"
                  />
                )}
              </FormField>
              <FormField label="Description">
                {({ id, describedBy }) => (
                  <textarea
                    id={id}
                    aria-describedby={describedBy}
                    className="cos-input min-h-16 resize-y text-sm"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                )}
              </FormField>
              <FormField label="Attach to week (optional)">
                {({ id, describedBy }) => (
                  <select
                    id={id}
                    aria-describedby={describedBy}
                    className="cos-input text-sm"
                    value={weekId}
                    onChange={(event) => setWeekId(event.target.value)}
                  >
                    <option value="">No week</option>
                    {weeks.map((week) => (
                      <option key={week.id} value={week.id}>
                        Week {week.weekNumber} — {week.title}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="Release time (optional)">
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    type="datetime-local"
                    aria-describedby={describedBy}
                    className="cos-input text-sm"
                    value={releaseAt}
                    onChange={(event) => setReleaseAt(event.target.value)}
                  />
                )}
              </FormField>
              <FormField label="Visibility" required>
                {({ id, describedBy }) => (
                  <select
                    id={id}
                    aria-describedby={describedBy}
                    className="cos-input text-sm"
                    value={visibility}
                    onChange={(event) =>
                      setVisibility(
                        event.target.value as "DRAFT" | "SCHEDULED" | "PUBLISHED",
                      )
                    }
                  >
                    <option value="DRAFT">Draft — only teaching team</option>
                    <option value="SCHEDULED">
                      Scheduled — releases at the time above
                    </option>
                    <option value="PUBLISHED">
                      Published — visible to students now
                    </option>
                  </select>
                )}
              </FormField>
            </div>
          }
        />

        {rejections.length > 0 && (
          <Alert variant="warning" onDismiss={() => setRejections([])}>
            {rejections.length} file{rejections.length === 1 ? "" : "s"} were
            not added:
            <ul className="mt-1 list-inside list-disc">
              {rejections.map((row) => (
                <li key={row.file}>
                  <span className="font-medium">{row.file}</span> — {row.reason}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Files are checked on the server against the institution's type and
          size policy before they are stored. A failed upload is reported
          per file — nothing is silently dropped, and no success is shown
          until the server confirms it.
        </p>
      </div>
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Preview drawer                                                    */
/* ------------------------------------------------------------------ */

const PreviewDrawer: React.FC<{
  materialId: string;
  onClose: () => void;
  onDownload: (material: LmsMaterial) => void;
}> = ({ materialId, onClose, onDownload }) => {
  const [material, setMaterial] = useState<LmsMaterial | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchLearningMaterial(materialId);
        if (!cancelled) setMaterial(result.material);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The material could not be opened.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={material?.title ?? "Material"}
      subtitle={material?.file?.originalName}
      width="lg"
    >
      {error ? (
        <Alert variant="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : !material ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <div className="min-h-80 rounded-lg border border-slate-200 dark:border-slate-800">
            {material.file?.fileId ? (
              <FilePreview
                fileId={material.file.fileId}
                originalName={material.file.originalName || material.title}
                mimeType={material.file.mimeType}
                sizeBytes={material.file.sizeBytes}
              />
            ) : (
              <div className="flex h-full min-h-80 flex-col items-center justify-center p-6 text-center">
                <FontAwesomeIcon icon={faFilePen} className="mb-3 text-2xl text-slate-300" aria-hidden="true" />
                <p className="text-sm text-slate-500">
                  This material is a {material.materialType.toLowerCase()} —
                  there is no file to preview.
                </p>
                {material.content && (
                  <p className="mt-3 max-w-md whitespace-pre-line text-xs text-slate-600 dark:text-slate-400">
                    {material.content}
                  </p>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <section aria-label="File information">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                File information
              </h3>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                {material.file ? (
                  <>
                    <MetadataRow label="Type" value={(material.file.mimeType || material.file.extension).toUpperCase()} />
                    <MetadataRow
                      label="Size"
                      value={material.file.sizeLabel || formatBytes(material.file.sizeBytes)}
                    />
                    {material.uploadedAt && (
                      <MetadataRow
                        label="Uploaded"
                        value={new Date(material.uploadedAt).toLocaleString()}
                      />
                    )}
                  </>
                ) : (
                  <MetadataRow label="Kind" value={material.materialType} />
                )}
                {material.version != null && (
                  <MetadataRow label="Version" value={`v${material.version}`} />
                )}
              </div>
            </section>

            {material.documentMeta &&
              (material.documentMeta.unitCount != null ||
                material.documentMeta.slideCount != null ||
                material.documentMeta.pageCount != null) && (
                <section aria-label="Document structure">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Structure
                  </h3>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <MetadataRow
                      label="Length"
                      value={`${
                        material.documentMeta.slideCount ??
                        material.documentMeta.pageCount ??
                        material.documentMeta.unitCount ??
                        0
                      } ${material.documentMeta.unitLabel}s`}
                    />
                    <MetadataRow
                      label="Detected by"
                      value={material.documentMeta.detectedBy ?? "Manual entry"}
                    />
                  </div>
                </section>
              )}

            <section aria-label="Version history">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Version history
              </h3>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <MetadataRow label={`v${material.version ?? 1}`} value="Current" />
                {material.supersedesMaterialId && (
                  <MetadataRow
                    label="Replaces"
                    value={`Material ${material.supersedesMaterialId.slice(-6)}`}
                  />
                )}
                {material.supersededByMaterialId && (
                  <MetadataRow
                    label="Superseded by"
                    value={`Material ${material.supersededByMaterialId.slice(-6)}`}
                  />
                )}
              </div>
            </section>

            {material.file?.fileId && (
              <Button
                variant="secondary"
                icon={faArrowDown}
                onClick={() => onDownload(material)}
                fullWidth
              >
                Download
              </Button>
            )}
          </aside>
        </div>
      )}
    </Drawer>
  );
};

const MetadataRow: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
      {value}
    </dd>
  </div>
);

/* ------------------------------------------------------------------ */
/* Replace file drawer (version upload)                              */
/* ------------------------------------------------------------------ */

const ReplaceFileDrawer: React.FC<{
  material: LmsMaterial;
  onClose: () => void;
  onReplaced: (material: LmsMaterial) => void;
  onError: (message: string) => void;
}> = ({ material, onClose, onReplaced, onError }) => {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const replace = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const { material: updated } = await replaceLearningMaterialFile(
        material.id,
        file,
      );
      onReplaced(updated);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The file could not be replaced.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Replace file"
      subtitle={`Replaces the stored file of "${material.title}" with version ${(material.version ?? 1) + 1}`}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void replace()}
            disabled={!file}
            isLoading={busy}
            loadingLabel="Replacing"
          >
            Replace file
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Dropzone
          onFiles={(files) => setFile(files[0] ?? null)}
          accept={acceptedTypes}
          maxTotalBytes={50 * 1024 * 1024}
          multiple={false}
          label="Drop the replacement file or browse"
          acceptHint="Same policy as the original upload"
        />
        {file && (
          <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
            <FileTypeIcon name={file.name} type={file.type} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
              {file.name}
            </span>
            <span className="text-xs text-slate-400">{formatBytes(file.size)}</span>
          </div>
        )}
        {error && (
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The previous file is retained as version history. Teaching
          records stay attached to the version they were taught from.
        </p>
      </div>
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Rename drawer                                                     */
/* ------------------------------------------------------------------ */

const RenameDrawer: React.FC<{
  material: LmsMaterial;
  onClose: () => void;
  onRenamed: (material: LmsMaterial) => void;
  onError: (message: string) => void;
}> = ({ material, onClose, onRenamed, onError }) => {
  const [title, setTitle] = useState(material.title);
  const [topic, setTopic] = useState(material.topic ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const { material: updated } = await updateMaterial(material.id, {
        title: title.trim(),
        topic: topic.trim() || null,
      });
      onRenamed(updated);
    } catch (requestError) {
      onError(
        requestError instanceof Error
          ? requestError.message
          : "The material could not be renamed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title="Rename material"
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={!title.trim()}
            isLoading={busy}
            loadingLabel="Saving"
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Title" required>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              className="cos-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          )}
        </FormField>
        <FormField label="Topic">
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              className="cos-input"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          )}
        </FormField>
      </div>
    </Drawer>
  );
};

/** The server's learning-material allow-list, mirrored for the picker. */
const acceptedTypes = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".zip",
  ".txt",
  ".md",
  ".csv",
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".wav",
].join(",");

export default MaterialsView;
