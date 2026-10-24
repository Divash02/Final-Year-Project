import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faFileImage,
  faUpload,
  faPlus,
  faSearch,
  faArrowsRotate,
  faEye,
  faHistory,
  faPaperPlane,
  faCheckCircle,
  faBullseye,
  faArchive,
  faRotateLeft,
  faFilePdf,
  faFilePowerpoint,
  faFileWord,
  faFileExcel,
  faSpinner,
  faDownload,
} from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { apiRequest } from "../../services/apiClient";
import { WorkspaceLayout } from "../layout/WorkspaceLayout";
import { Button } from "../ui/Button";
import { Input, SelectField } from "../ui/Input";
import { IconButton } from "../ui/IconButton";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { Card } from "../ui/Card";
import { Alert } from "../ui/Alert";
import { EmptyState } from "../ui/EmptyState";
import { Dropzone } from "../shared/upload/Dropzone";
import { downloadStoredFile } from "../../services/uploadClient";
import { DocumentViewerModal } from "../shared/viewer/DocumentViewerModal";
import type { StoredFileSummary } from "../../lib/documentPreview";
import { DocumentPreview } from "../shared/viewer/DocumentPreview";

const ACADEMIC_DOCUMENT_CATEGORIES = [
  "ACADEMIC_PLANNER",
  "EXAMINATION_SCHEDULE",
  "HOLIDAY_CALENDAR",
  "SEMESTER_CALENDAR",
  "ADMISSION_CALENDAR",
  "REGISTRATION_SCHEDULE",
  "ORIENTATION_SCHEDULE",
  "PROJECT_THESIS_SCHEDULE",
  "RESULT_SCHEDULE",
  "OTHER_OFFICIAL_ACADEMIC_DOCUMENT",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  ACADEMIC_PLANNER: "Academic Planner",
  EXAMINATION_SCHEDULE: "Examination Schedule",
  HOLIDAY_CALENDAR: "Holiday Calendar",
  SEMESTER_CALENDAR: "Semester Calendar",
  ADMISSION_CALENDAR: "Admission Calendar",
  REGISTRATION_SCHEDULE: "Registration Schedule",
  ORIENTATION_SCHEDULE: "Orientation Schedule",
  PROJECT_THESIS_SCHEDULE: "Project/Thesis Schedule",
  RESULT_SCHEDULE: "Result Schedule",
  OTHER_OFFICIAL_ACADEMIC_DOCUMENT: "Other Official Document",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  UNDER_REVIEW: "In Review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const LIFECYCLE_VARIANT: Record<string, "success" | "warning" | "info" | "neutral" | "danger"> = {
  DRAFT: "neutral",
  UNDER_REVIEW: "warning",
  APPROVED: "info",
  PUBLISHED: "success",
  ARCHIVED: "neutral",
};

export interface CalendarDocument {
  id: string;
  _id: string;
  title: string;
  description: string;
  category: string;
  academicYear: string;
  semester: number | null;
  audience: { targetType: string; target?: Record<string, unknown> };
  targetType: string;
  audienceLabel: string;
  file: {
    fileId: string;
    originalName: string;
    mimeType: string;
    extension: string;
    sizeBytes: number;
    uploadedAt: string | null;
    isPdf: boolean;
    isImage: boolean;
  } | null;
  version: number;
  previousVersionId: string | null;
  versionReason: string | null;
  lifecycleState: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface DocumentListMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface AudienceTarget {
  programCodes?: string[];
  batchYears?: string[];
  semesters?: number[];
  sectionCodes?: string[];
  allSections?: boolean;
}

interface AudienceInput {
  targetType: "ALL" | "STAFF" | "SPECIFIC";
  target?: AudienceTarget;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIconFor(mimeType: string): IconDefinition {
  if (mimeType === "application/pdf") return faFilePdf;
  if (mimeType?.startsWith("image/")) return faFileImage;
  if (mimeType?.includes("wordprocessing")) return faFileWord;
  if (mimeType?.includes("spreadsheet")) return faFileExcel;
  if (mimeType?.includes("presentation")) return faFilePowerpoint;
  return faFileImage;
}

const FILE_ACCEPT =
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officeded.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png,image/jpeg,image/webp";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Academic Calendar Document Management.
 *
 * Lists, creates, and drives the lifecycle of official calendar documents
 * (exam schedules, holiday calendars, semester planners, etc.). Students see
 * only PUBLISHED documents in their cohort; administrators with
 * `calendar.manage` see the full lifecycle and the upload/edit controls.
 */
export const AcademicCalendarDocumentsView: React.FC = () => {
  const { currentUser, currentTenant } = useCollegeOS();
  const permissions = new Set(currentUser?.permissions || []);
  const canManage = permissions.has("calendar.manage");
  const [documents, setDocuments] = useState<CalendarDocument[]>([]);
  const [meta, setMeta] = useState<DocumentListMeta>({
    page: 1,
    limit: 25,
    total: 0,
    pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [categoryFilter, setCategoryFilter] = useState("");
  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<CalendarDocument | null>(null);
  const [previewFile, setPreviewFile] = useState<StoredFileSummary | null>(null);
  const [previewing, setPreviewing] = useState<CalendarDocument | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.append("category", categoryFilter);
      if (academicYearFilter) params.append("academicYear", academicYearFilter);
      if (semesterFilter) params.append("semester", semesterFilter);
      if (lifecycleFilter) params.append("lifecycle", lifecycleFilter);
      if (search) params.append("q", search);
      params.append("limit", String(meta.limit));
      params.append("page", String(meta.page));
      if (!canManage && lifecycleFilter === "") {
        params.append("includeArchived", "false");
      }

      const result = await apiRequest<{
        documents: CalendarDocument[];
        pagination: DocumentListMeta;
      }>(`/academic-calendar/documents?${params.toString()}`);

      setDocuments(result.documents || []);
      setMeta(result.pagination || meta);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load documents.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    categoryFilter,
    academicYearFilter,
    semesterFilter,
    lifecycleFilter,
    search,
    meta.page,
    meta.limit,
    canManage,
  ]);

  useEffect(() => {
    let active = true;
    loadDocuments().catch(() => {
      if (active) setError("Could not load documents.");
    });
    return () => {
      active = false;
    };
  }, [loadDocuments]);

  const refetch = () => {
    setMeta((m) => ({ ...m, page: 1 }));
    loadDocuments().catch(() => {});
  };

  const [saveBusy, setSaveBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("OTHER_OFFICIAL_ACADEMIC_DOCUMENT");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [audienceTargetType, setAudienceTargetType] = useState<"ALL" | "STAFF" | "SPECIFIC">("ALL");
  const [programCodes, setProgramCodes] = useState("");
  const [batchYears, setBatchYears] = useState("");
  const [sectionCodes, setSectionCodes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [saveError, setSaveError] = useState("");

  const resetCreateForm = () => {
    setTitle("");
    setDescription("");
    setCategory("OTHER_OFFICIAL_ACADEMIC_DOCUMENT");
    setAcademicYear(currentTenant ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : "");
    setSemester("");
    setEffectiveFrom("");
    setEffectiveTo("");
    setAudienceTargetType("ALL");
    setProgramCodes("");
    setBatchYears("");
    setSectionCodes("");
    setFile(null);
    setFileError("");
    setSaveError("");
  };

  const handleFileSelect = (files: File[]) => {
    const picked = files[0];
    setFileError("");
    if (picked.size > MAX_FILE_BYTES) {
      setFileError(
        `File exceeds the ${formatFileSize(MAX_FILE_BYTES)} size limit.`,
      );
      setFile(null);
      return;
    }
    setFile(picked);
  };

  const buildAudience = (): AudienceInput => {
    if (audienceTargetType === "ALL" || audienceTargetType === "STAFF") {
      return { targetType: audienceTargetType };
    }
    const target: AudienceTarget = { allSections: true };
    if (programCodes.trim()) {
      target.programCodes = programCodes
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }
    if (batchYears.trim()) {
      target.batchYears = batchYears
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (semester.trim()) {
      target.semesters = [parseInt(semester, 10)];
    }
    if (sectionCodes.trim()) {
      target.allSections = false;
      target.sectionCodes = sectionCodes
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }
    return { targetType: "SPECIFIC", target };
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveBusy(true);
    setSaveError("");

    if (!file) {
      setSaveError("A file is required for this request.");
      setSaveBusy(false);
      return;
    }

    try {
      const body = new FormData();
      body.append("title", title);
      body.append("description", description);
      body.append("category", category);
      body.append("academicYear", academicYear);
      if (semester.trim()) body.append("semester", semester);
      if (effectiveFrom) body.append("effectiveFrom", effectiveFrom);
      if (effectiveTo) body.append("effectiveTo", effectiveTo);

      const audience = buildAudience();
      body.append("audience", JSON.stringify(audience));
      body.append("file", file);

      await apiRequest<{ document: CalendarDocument }>(
        "/academic-calendar/documents",
        { method: "POST", body },
      );

      setShowCreate(false);
      resetCreateForm();
      refetch();
    } catch (requestError) {
      setSaveError(
        requestError instanceof Error
          ? requestError.message
          : "Could not create the document.",
      );
    } finally {
      setSaveBusy(false);
    }
  };

  const handleStateChange = async (doc: CalendarDocument, action: string) => {
    try {
      await apiRequest<{ document: CalendarDocument }>(
        `/academic-calendar/documents/${doc.id}/${action}`,
        { method: "POST" },
      );
      refetch();
      if (selected?.id === doc.id) {
        setSelected(null);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : `Could not ${action} the document.`,
      );
    }
  };

  const handleDelete = (doc: CalendarDocument) => {
    if (
      window.confirm(
        `Archive "${doc.title}"? It will be removed from student view.`,
      )
    ) {
      handleStateChange(doc, "archive");
    }
  };

  const handleDownload = (doc: CalendarDocument) => {
    if (doc.file?.fileId && doc.file?.originalName) {
      void downloadStoredFile(doc.file.fileId, doc.file.originalName).catch(
        (err: unknown) =>
          setError(
            err instanceof Error ? err.message : "Could not download the file.",
          ),
      );
    }
  };

  /** Opens the inline viewer for PDF and image documents. */
  const handleView = (doc: CalendarDocument) => {
    if (!doc.file) return;
    setPreviewFile({
      fileId: doc.file.fileId,
      originalName: doc.file.originalName,
      mimeType: doc.file.mimeType,
      extension: doc.file.extension,
      sizeBytes: doc.file.sizeBytes,
      isPdf: doc.file.isPdf,
      isImage: doc.file.isImage,
      isPreviewable: doc.file.isPdf || doc.file.isImage,
    });
  };

  const canSubmit = (doc: CalendarDocument) =>
    ["DRAFT", "UNDER_REVIEW"].includes(doc.lifecycleState);
  const canApprove = (doc: CalendarDocument) => doc.lifecycleState === "UNDER_REVIEW";
  const canPublish = (doc: CalendarDocument) =>
    !["ARCHIVED"].includes(doc.lifecycleState) && canManage;
  const canArchive = (doc: CalendarDocument) => doc.lifecycleState !== "ARCHIVED";
  const canRestore = (doc: CalendarDocument) => doc.lifecycleState === "ARCHIVED";
  const canEdit = (doc: CalendarDocument) => canManage && doc.lifecycleState === "DRAFT";

  const renderDocumentList = () => (
    <div className="flex-1 overflow-x-auto">
      {loading ? (
        <div className="p-8 text-center text-slate-500">
          <FontAwesomeIcon
            icon={faSpinner}
            className="mr-2 animate-spin"
            aria-hidden="true"
          />
          Loading documents...
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={faCalendarDays}
          title={canManage ? "No documents found" : "No published documents yet"}
          description={
            search || categoryFilter || academicYearFilter || semesterFilter
              ? "No documents match your current filters. Try adjusting them."
              : canManage
                ? "Start by uploading an academic calendar document."
                : "The academic office has not published the current semester, so this list is grouped by the periods found in your own records."
          }
          actionLabel={canManage ? "Upload document" : undefined}
          onAction={canManage ? () => setShowCreate(true) : undefined}
          actionIcon={canManage ? faUpload : undefined}
        />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <th className="px-4 py-2.5 text-left">Document</th>
              <th className="px-4 py-2.5 text-left">Category</th>
              <th className="px-4 py-2.5 text-left">Academic Year</th>
              <th className="px-4 py-2.5 text-left">State</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr
                key={doc.id}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon
                      icon={fileIconFor(doc.file?.mimeType || "")}
                      className="text-slate-400"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={() => setSelected(doc)}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {doc.title}
                    </button>
                  </div>
                  {doc.file && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {doc.file.originalName} · {formatFileSize(doc.file.sizeBytes)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-600">
                    {CATEGORY_LABELS[doc.category] || doc.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {doc.academicYear}
                  {doc.semester ? ` · Sem ${doc.semester}` : ""}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={LIFECYCLE_VARIANT[doc.lifecycleState] || "neutral"}
                    hideDot
                  >
                    {LIFECYCLE_LABELS[doc.lifecycleState] || doc.lifecycleState}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {doc.file && (
                      <>
                        <IconButton
                          icon={faEye}
                          label="View"
                          variant="ghost"
                          size="sm"
                          hideTooltip
                          onClick={() => setPreviewing(doc)}
                        />
                        <IconButton
                          icon={faDownload}
                          label="Download"
                          variant="ghost"
                          size="sm"
                          hideTooltip
                          onClick={() => handleDownload(doc)}
                        />
                      </>
                    )}
                    <IconButton
                      icon={faHistory}
                      label="Versions"
                      variant="ghost"
                      size="sm"
                      hideTooltip
                      onClick={() => setSelected(doc)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const lifecycleActions = (doc: CalendarDocument) => {
    if (!canManage) return null;
    const actions = [];

    if (canSubmit(doc)) {
      actions.push(
        <Button
          key="submit"
          variant="secondary"
          size="sm"
          icon={faPaperPlane}
          onClick={() => handleStateChange(doc, "submit")}
        >
          Submit
        </Button>,
      );
    }
    if (canApprove(doc)) {
      actions.push(
        <Button
          key="approve"
          variant="secondary"
          size="sm"
          icon={faCheckCircle}
          onClick={() => handleStateChange(doc, "approve")}
        >
          Approve
        </Button>,
      );
    }
    if (canPublish(doc)) {
      actions.push(
        <Button
          key="publish"
          variant="secondary"
          size="sm"
          icon={faBullseye}
          onClick={() => handleStateChange(doc, "publish")}
        >
          Publish
        </Button>,
      );
    }
    if (canArchive(doc)) {
      actions.push(
        <Button
          key="archive"
          variant="secondary"
          size="sm"
          icon={faArchive}
          onClick={() => handleDelete(doc)}
        >
          Archive
        </Button>,
      );
    }
    if (canRestore(doc)) {
      actions.push(
        <Button
          key="restore"
          variant="secondary"
          size="sm"
          icon={faRotateLeft}
          onClick={() => handleStateChange(doc, "restore")}
        >
          Restore
        </Button>,
      );
    }
    return actions.length ? actions : null;
  };

  return (
    <>
      <WorkspaceLayout
        title="Academic Calendar"
        icon={faCalendarDays}
        toolbar={
          <>
            <div className="relative w-full max-w-sm">
              <Input
                label="Search documents"
                hideLabel
                placeholder="Search by title or description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={faSearch}
                wrapperClassName="mb-0"
              />
            </div>
            {canManage && (
              <Button
                variant="primary"
                size="sm"
                icon={faPlus}
                onClick={() => {
                  resetCreateForm();
                  setShowCreate(true);
                }}
              >
                Upload document
              </Button>
            )}
            <IconButton
              icon={faArrowsRotate}
              label="Refresh"
              variant="ghost"
              size="sm"
              onClick={refetch}
            />
          </>
        }
      >
        {error && (
          <div className="px-5 pt-4">
            <Alert variant="error" onDismiss={() => setError("")}>
              {error}
            </Alert>
          </div>
        )}
        {renderDocumentList()}
      </WorkspaceLayout>

      <DocumentCreateModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title={title}
        setTitle={setTitle}
        description={description}
        setDescription={setDescription}
        category={category}
        setCategory={setCategory}
        academicYear={academicYear}
        setAcademicYear={setAcademicYear}
        semester={semester}
        setSemester={setSemester}
        effectiveFrom={effectiveFrom}
        setEffectiveFrom={setEffectiveFrom}
        effectiveTo={effectiveTo}
        setEffectiveTo={setEffectiveTo}
        audienceTargetType={audienceTargetType}
        setAudienceTargetType={setAudienceTargetType}
        programCodes={programCodes}
        setProgramCodes={setProgramCodes}
        batchYears={batchYears}
        setBatchYears={setBatchYears}
        sectionCodes={sectionCodes}
        setSectionCodes={setSectionCodes}
        file={file}
        setFile={setFile}
        fileError={fileError}
        setFileError={setFileError}
         saveError={saveError}
         setSaveError={setSaveError}
         saveBusy={saveBusy}
        onSubmit={handleCreate}
        maxFileSize={MAX_FILE_BYTES}
      />

      {selected && (
        <DocumentDetailModal
          document={selected}
          canManage={canManage}
          lifecycleActions={lifecycleActions(selected)}
          onClose={() => setSelected(null)}
          onPreview={() => setPreviewing(selected)}
        />
      )}

      {previewing?.file && (
        <Modal
          isOpen={Boolean(previewing)}
          onClose={() => setPreviewing(null)}
          title={previewing.title}
          subtitle={`${CATEGORY_LABELS[previewing.category] || previewing.category} · ${previewing.academicYear}${previewing.semester ? ` · Semester ${previewing.semester}` : ""}`}
          maxWidth="3xl"
        >
          <DocumentPreview
            file={{
              fileId: previewing.file.fileId,
              originalName: previewing.file.originalName,
              mimeType: previewing.file.mimeType,
              sizeBytes: previewing.file.sizeBytes,
              extension: previewing.file.extension,
            }}
          />
        </Modal>
      )}
    </>
  );
};

interface DocumentCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  academicYear: string;
  setAcademicYear: (v: string) => void;
  semester: string;
  setSemester: (v: string) => void;
  effectiveFrom: string;
  setEffectiveFrom: (v: string) => void;
  effectiveTo: string;
  setEffectiveTo: (v: string) => void;
  audienceTargetType: "ALL" | "STAFF" | "SPECIFIC";
  setAudienceTargetType: (v: "ALL" | "STAFF" | "SPECIFIC") => void;
  programCodes: string;
  setProgramCodes: (v: string) => void;
  batchYears: string;
  setBatchYears: (v: string) => void;
  sectionCodes: string;
  setSectionCodes: (v: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  fileError: string;
  setFileError: (e: string) => void;
   saveError: string;
   setSaveError: (e: string) => void;
   saveBusy: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  maxFileSize: number;
}

const DocumentCreateModal: React.FC<DocumentCreateModalProps> = ({
  isOpen,
  onClose,
  title,
  setTitle,
  description,
  setDescription,
  category,
  setCategory,
  academicYear,
  setAcademicYear,
  semester,
  setSemester,
  effectiveFrom,
  setEffectiveFrom,
  effectiveTo,
  setEffectiveTo,
  audienceTargetType,
  setAudienceTargetType,
  programCodes,
  setProgramCodes,
  batchYears,
  setBatchYears,
  sectionCodes,
  setSectionCodes,
  file,
  setFile,
  fileError,
  setFileError,
   saveError,
   setSaveError,
   saveBusy,
  onSubmit,
  maxFileSize,
}) => {
  const filePreview = file
    ? `${file.name} (${formatFileSize(file.size)})`
    : "";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Academic Calendar Document"
      subtitle="Add a new document to the calendar (exam schedule, holiday list, semester planner, etc.)."
      maxWidth="lg"
    >
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        <div className="space-y-4">
          <Input
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            helperText="Optional summary shown alongside the document."
          />
          <SelectField
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            {ACADEMIC_DOCUMENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat] || cat}
              </option>
            ))}
          </SelectField>
          <Input
            label="Academic Year"
            required
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            maxLength={20}
            placeholder="e.g. 2025-2026"
          />
          <Input
            label="Semester (optional)"
            type="number"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            placeholder="e.g. 4"
            min={1}
            max={12}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Effective from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            <Input
              label="Effective to"
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Audience
            </label>
            <div className="flex gap-4 mb-3">
              {(["ALL", "STAFF", "SPECIFIC"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="targetType"
                    checked={audienceTargetType === t}
                    onChange={() => setAudienceTargetType(t)}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  {t === "ALL"
                    ? "All students"
                    : t === "STAFF"
                      ? "Staff only"
                      : "Specific cohort"}
                </label>
              ))}
            </div>

            {audienceTargetType === "SPECIFIC" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Program codes"
                  placeholder="e.g. BCA, MCA"
                  value={programCodes}
                  onChange={(e) => setProgramCodes(e.target.value)}
                  helperText="Comma-separated"
                />
                <Input
                  label="Batch years"
                  placeholder="e.g. 2025"
                  value={batchYears}
                  onChange={(e) => setBatchYears(e.target.value)}
                  helperText="Comma-separated"
                />
                <Input
                  label="Semester"
                  placeholder="e.g. 4"
                  type="number"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  min={1}
                  max={12}
                />
                <Input
                  label="Section codes"
                  placeholder="e.g. A1, A2"
                  value={sectionCodes}
                  onChange={(e) => setSectionCodes(e.target.value)}
                  helperText="Comma-separated"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              File <span className="text-[var(--color-danger)]">*</span>
            </label>
            <Dropzone
              onFiles={(files) => setFile(files[0] ?? null)}
              accept={FILE_ACCEPT}
              acceptHint="PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, PNG, JPG"
              multiple={false}
              maxTotalBytes={maxFileSize}
              onReject={(_, reason) => setFileError(reason)}
              label="Drop a file or click to browse"
              compact
            />
            {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
            {filePreview && !fileError && (
              <p className="mt-1 text-xs text-slate-600">{filePreview}</p>
            )}
          </div>

          {saveError && (
            <Alert variant="error" onDismiss={() => setSaveError("")}>
              {saveError}
            </Alert>
          )}
        </div>
      </form>

      <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
          disabled={saveBusy}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={faUpload}
          isLoading={saveBusy}
          loadingLabel="Uploading…"
          onClick={(e) => {
            e.preventDefault();
            void onSubmit(e as unknown as React.FormEvent);
          }}
          disabled={saveBusy || !title || !academicYear || !file}
        >
          Create document
        </Button>
      </div>
    </Modal>
  );
};

interface DocumentDetailModalProps {
  document: CalendarDocument;
  canManage: boolean;
  lifecycleActions: React.ReactNode;
  onClose: () => void;
  onPreview?: () => void;
}

const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  document,
  canManage,
  lifecycleActions,
  onClose,
  onPreview,
}) => {
  const [versions, setVersions] = useState<CalendarDocument[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  const loadVersions = async () => {
    setVersionsLoading(true);
    try {
      const result = await apiRequest<{ versions: CalendarDocument[] }>(
        `/academic-calendar/documents/${document.id}/versions`,
      );
      setVersions(result.versions || []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  useEffect(() => {
    void loadVersions();
  }, [document.id]);

  const stateLabel = LIFECYCLE_LABELS[document.lifecycleState] || document.lifecycleState;
  const stateVariant = LIFECYCLE_VARIANT[document.lifecycleState] || "neutral";

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={document.title}
      subtitle={CATEGORY_LABELS[document.category] || document.category}
      maxWidth="3xl"
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <Badge variant={stateVariant} size="md">
            {stateLabel}
          </Badge>
          {canManage && lifecycleActions}
        </div>

        {document.description && (
          <p className="text-sm text-slate-700">{document.description}</p>
        )}

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">
              Academic Year
            </dt>
            <dd className="mt-0.5 text-slate-800">{document.academicYear}</dd>
          </div>
          {document.semester && (
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">
                Semester
              </dt>
              <dd className="mt-0.5 text-slate-800">{document.semester}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">
              Version
            </dt>
            <dd className="mt-0.5 text-slate-800">v{document.version}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">
              Audience
            </dt>
            <dd className="mt-0.5 text-slate-800">{document.audienceLabel}</dd>
          </div>
          {document.effectiveFrom && (
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">
                Effective From
              </dt>
              <dd className="mt-0.5 text-slate-800">{document.effectiveFrom}</dd>
            </div>
          )}
          {document.effectiveTo && (
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">
                Effective To
              </dt>
              <dd className="mt-0.5 text-slate-800">{document.effectiveTo}</dd>
            </div>
          )}
          {document.publishedAt && (
            <div>
              <dt className="text-xs font-medium uppercase text-slate-500">
                Published
              </dt>
              <dd className="mt-0.5 text-slate-800">
                {new Date(document.publishedAt).toLocaleDateString()}
              </dd>
            </div>
          )}
        </dl>

        {document.file && (
          <Card
            title="File"
            subtitle={`${document.file.originalName} · ${formatFileSize(document.file.sizeBytes)}`}
            icon={fileIconFor(document.file.mimeType)}
            headerAction={
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={faEye}
                  onClick={onPreview}
                >
                  View
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={faDownload}
                  onClick={() => {
                    if (document.file?.fileId && document.file?.originalName) {
                      void downloadStoredFile(
                        document.file.fileId,
                        document.file.originalName,
                      ).catch((err: unknown) =>
                        console.error("Download failed:", err),
                      );
                    }
                  }}
                >
                  Download
                </Button>
              </div>
            }
          >
            <div className="p-4 text-center text-slate-400">
              <FontAwesomeIcon
                icon={fileIconFor(document.file.mimeType)}
                className="text-4xl"
                aria-hidden="true"
              />
              <p className="mt-2 text-xs">
                {document.file.isPdf
                  ? "PDF document — opens in the inline viewer."
                  : document.file.isImage
                    ? "Image — opens in the inline viewer."
                    : "Office document — download to read it."}
              </p>
            </div>
          </Card>
        )}

        {versions.length > 0 && (
          <Card title="Version history" subtitle={`${versions.length} version(s)`}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase text-slate-500">
                  <th className="px-3 py-2 text-left">Version</th>
                  <th className="px-3 py-2 text-left">State</th>
                  <th className="px-3 py-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      v{v.version}
                      {v.id === document.id && (
                        <span className="ml-1.5 text-xs text-slate-400">
                          (current)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={LIFECYCLE_VARIANT[v.lifecycleState] || "neutral"}
                        hideDot
                      >
                        {LIFECYCLE_LABELS[v.lifecycleState] || v.lifecycleState}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {v.createdAt
                        ? new Date(v.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <div className="mt-6 flex justify-end border-t border-slate-200 px-6 py-4">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default AcademicCalendarDocumentsView;
