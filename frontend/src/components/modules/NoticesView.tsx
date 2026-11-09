import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faPlus,
  faSearch,
  faPencil,
  faCircleCheck,
  faBan,
  faArrowRotateLeft,
  faEye,
  faDownload,
  faFilePdf,
  faFileImage,
  faFileWord,
  faFilePowerpoint,
  faFile,
  faClock,
  faCalendarDays,
  faUserTag,
  faCircleExclamation,
  faSpinner,
  faXmark,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { apiRequest, ApiError } from "../../services/apiClient";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { useToast } from "../ui/ToastContainer";
import { EmptyState } from "../ui/EmptyState";
import { RichTextEditor } from "../notices/RichTextEditor";
import {
  NoticeAttachments,
  NoticeAttachment,
} from "../notices/NoticeAttachments";
import {
  formatBytes,
  previewKindOf,
  downloadStoredFileById,
  StoredFileSummary,
} from "../../lib/documentPreview";
import { DocumentViewerModal } from "../shared/viewer/DocumentViewerModal";

/**
 * Notices board.
 *
 * One view over the notice lifecycle: the board lists every
 * notice the signed-in account may read; composers (notice
 * managers and legacy faculty) get the rich-text composer with
 * attachments, audience targeting, draft/publish and the
 * archive/restore lifecycle. Authorization is enforced
 * server-side — the UI only hides actions the session cannot
 * perform.
 */

type NoticeCategory =
  | "ACADEMIC"
  | "EXAMINATION"
  | "ADMINISTRATIVE"
  | "EVENT"
  | "URGENT"
  | "HOLIDAY";

type NoticePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

type NoticeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type AudienceTargetType = "ALL" | "STAFF" | "SPECIFIC";

interface NoticeAudienceTarget {
  programCodes?: string[];
  batchYears?: string[];
  semesters?: number[];
  sectionCodes?: string[];
  allSections?: boolean;
  userIds?: string[];
  roleIds?: string[];
}

interface NoticeAudience {
  targetType: AudienceTargetType;
  target: NoticeAudienceTarget;
}

interface NoticeRecord {
  id: string;
  title: string;
  body: string;
  contentHtml: string | null;
  category: NoticeCategory;
  priority: NoticePriority;
  examId: string | null;
  targetRoles: string[];
  audience: NoticeAudience;
  targetType: AudienceTargetType;
  audienceLabel: string;
  targetUsers: string[];
  status: NoticeStatus;
  attachments: NoticeAttachment[];
  expiresAt: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  author: string;
  authorId: string | null;
}

const CATEGORIES: NoticeCategory[] = [
  "ACADEMIC",
  "EXAMINATION",
  "ADMINISTRATIVE",
  "EVENT",
  "URGENT",
  "HOLIDAY",
];

const PRIORITIES: NoticePriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

const STATUSES: NoticeStatus[] = ["PUBLISHED", "DRAFT", "ARCHIVED"];

const ROLE_OPTIONS = [
  "student",
  "faculty",
  "hod",
  "program_coordinator",
  "dean",
  "registrar",
  "exam_officer",
  "finance_officer",
  "admin",
  "super_admin",
];

const CATEGORY_STYLES: Record<NoticeCategory, string> = {
  ACADEMIC: "bg-sky-100 text-sky-800",
  EXAMINATION: "bg-violet-100 text-violet-800",
  ADMINISTRATIVE: "bg-slate-200 text-slate-700",
  EVENT: "bg-amber-100 text-amber-800",
  URGENT: "bg-red-100 text-red-800",
  HOLIDAY: "bg-emerald-100 text-emerald-800",
};

const PRIORITY_STYLES: Record<NoticePriority, string> = {
  LOW: "bg-slate-100 text-slate-500",
  NORMAL: "bg-sky-50 text-sky-700",
  HIGH: "bg-amber-50 text-amber-700",
  URGENT: "bg-red-100 text-red-700 font-semibold",
};

const STATUS_STYLES: Record<NoticeStatus, string> = {
  DRAFT: "bg-slate-200 text-slate-600",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-stone-200 text-stone-600",
};

const EMPTY_FORM = {
  title: "",
  contentHtml: "",
  category: "ACADEMIC" as NoticeCategory,
  priority: "NORMAL" as NoticePriority,
  status: "PUBLISHED" as NoticeStatus,
  targetType: "ALL" as AudienceTargetType,
  targetRoles: [] as string[],
  programCodes: "",
  batchYears: "",
  semesters: "",
  sectionCodes: "",
  allSections: true,
  expiresAt: "",
};

interface ComposerState {
  title: string;
  contentHtml: string;
  category: NoticeCategory;
  priority: NoticePriority;
  status: NoticeStatus;
  targetType: AudienceTargetType;
  targetRoles: string[];
  programCodes: string;
  batchYears: string;
  semesters: string;
  sectionCodes: string;
  allSections: boolean;
  expiresAt: string;
}

const toDateInputValue = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const splitCsv = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const NoticesView: React.FC = () => {
  const { currentUser } = useCollegeOS();
  const { toast } = useToast();

  const roles = useMemo(
    () => new Set<string>(currentUser?.roles || []),
    [currentUser],
  );
  const permissions = useMemo(
    () => new Set<string>(currentUser?.permissions || []),
    [currentUser],
  );
  const isManager = permissions.has("notices.publish");
  const canCompose =
    isManager ||
    [...roles].some((role) =>
      [
        "super_admin",
        "hod",
        "program_coordinator",
        "dean",
        "registrar",
        "exam_officer",
        "finance_officer",
        "faculty",
      ].includes(role),
    );

  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ComposerState>(EMPTY_FORM);
  const [attachments, setAttachments] = useState<NoticeAttachment[]>([]);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<NoticeRecord | null>(null);
  const [preview, setPreview] = useState<StoredFileSummary | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<{ notices: NoticeRecord[] }>("/notices");
      setNotices(data.notices || []);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Could not load the notice board.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  const openComposer = useCallback((notice?: NoticeRecord) => {
    if (notice) {
      setEditingId(notice.id);
      setForm({
        title: notice.title,
        contentHtml: notice.contentHtml || notice.body || "",
        category: notice.category,
        priority: notice.priority,
        status: notice.status,
        targetType: notice.targetType || notice.audience?.targetType || "ALL",
        targetRoles: notice.targetRoles || [],
        programCodes: (
          notice.audience?.target?.programCodes || []
        ).join(", "),
        batchYears: (notice.audience?.target?.batchYears || []).join(", "),
        semesters: (notice.audience?.target?.semesters || []).join(", "),
        sectionCodes: (
          notice.audience?.target?.sectionCodes || []
        ).join(", "),
        allSections:
          notice.audience?.target?.allSections !== false,
        expiresAt: toDateInputValue(notice.expiresAt),
      });
      setAttachments(notice.attachments || []);
    } else {
      setEditingId(null);
      setForm(EMPTY_FORM);
      setAttachments([]);
    }
    setComposerOpen(true);
  }, []);

  const updateForm = useCallback(
    <K extends keyof ComposerState>(key: K, value: ComposerState[K]) => {
      setForm((previous) => ({ ...previous, [key]: value }));
    },
    [],
  );

  const toggleRole = useCallback((role: string) => {
    setForm((previous) => ({
      ...previous,
      targetRoles: previous.targetRoles.includes(role)
        ? previous.targetRoles.filter((item) => item !== role)
        : [...previous.targetRoles, role],
    }));
  }, []);

  const buildPayload = useCallback(() => {
    const audience: NoticeAudience =
      form.targetType === "SPECIFIC"
        ? {
            targetType: "SPECIFIC",
            target: {
              programCodes: splitCsv(form.programCodes),
              batchYears: splitCsv(form.batchYears),
              semesters: splitCsv(form.semesters)
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value)),
              sectionCodes: splitCsv(form.sectionCodes),
              allSections: form.allSections,
            },
          }
        : { targetType: form.targetType, target: {} };

    return {
      title: form.title.trim(),
      contentHtml: form.contentHtml,
      category: form.category,
      priority: form.priority,
      status: form.status,
      targetRoles: form.targetRoles.length ? form.targetRoles : ["ALL"],
      audience,
      attachments: attachments.map((attachment) => attachment.fileId),
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    };
  }, [form, attachments]);

  const saveNotice = useCallback(async () => {
    if (!form.title.trim()) {
      toast({ variant: "warning", message: "Give the notice a title." });
      return;
    }
    if (!form.contentHtml.replace(/<[^>]*>/g, "").trim()) {
      toast({ variant: "warning", message: "Write the notice body." });
      return;
    }
    if (
      form.targetType === "SPECIFIC" &&
      !splitCsv(form.programCodes).length &&
      !splitCsv(form.batchYears).length &&
      !splitCsv(form.semesters).length &&
      !splitCsv(form.sectionCodes).length
    ) {
      toast({
        variant: "warning",
        message: "Choose at least one programme, batch, semester or section.",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      if (editingId) {
        await apiRequest(`/notices/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast({ variant: "success", message: "Notice updated." });
      } else {
        await apiRequest("/notices", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({
          variant: "success",
          message:
            payload.status === "DRAFT"
              ? "Notice draft created."
              : "Notice published.",
        });
      }
      setComposerOpen(false);
      await loadNotices();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "The notice could not be saved.";
      toast({ variant: "error", message });
    } finally {
      setSaving(false);
    }
  }, [form, buildPayload, editingId, loadNotices, toast]);

  const runAction = useCallback(
    async (action: "publish" | "archive" | "restore", notice: NoticeRecord) => {
      const endpoint =
        action === "publish"
          ? `/notices/${notice.id}/publish`
          : action === "archive"
            ? `/notices/${notice.id}/archive`
            : `/notices/${notice.id}/restore`;
      setBusyActionId(notice.id);
      try {
        await apiRequest(endpoint, { method: "POST" });
        toast({
          variant: "success",
          message:
            action === "publish"
              ? "Notice published."
              : action === "archive"
                ? "Notice archived."
                : "Notice restored to the board.",
        });
        await loadNotices();
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : "The notice state could not be changed.";
        toast({ variant: "error", message });
      } finally {
        setBusyActionId(null);
      }
    },
    [loadNotices, toast],
  );

  const isExpired = (notice: NoticeRecord): boolean =>
    Boolean(notice.expiresAt) && new Date(notice.expiresAt!) < new Date();

  const visibleNotices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return notices.filter((notice) => {
      if (filterCategory !== "ALL" && notice.category !== filterCategory) {
        return false;
      }
      if (filterStatus !== "ALL" && notice.status !== filterStatus) {
        return false;
      }
      if (filterPriority !== "ALL" && notice.priority !== filterPriority) {
        return false;
      }
      if (!query) return true;
      return (
        notice.title.toLowerCase().includes(query) ||
        notice.body.toLowerCase().includes(query) ||
        notice.author.toLowerCase().includes(query)
      );
    });
  }, [notices, searchQuery, filterCategory, filterStatus, filterPriority]);

  const attachmentIcon = (mimeType: string): IconDefinition => {
    const kind = previewKindOf(mimeType);
    if (kind === "pdf") return faFilePdf;
    if (kind === "image") return faFileImage;
    if (mimeType.includes("wordprocessing")) return faFileWord;
    if (mimeType.includes("presentation")) return faFilePowerpoint;
    return faFile;
  };

  return (
    <div className="cos-page">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-[var(--color-primary)]/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Institutional Communications
            </span>
          </div>
          <h1 className="mt-1.5 flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900">
            <FontAwesomeIcon icon={faBell} className="text-[var(--color-primary)]" />
            Notice Board
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Official institutional notices with rich-text composition,
            attachments and audience targeting.
          </p>
        </div>
        {canCompose && (
          <button
            type="button"
            onClick={() => openComposer()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            <FontAwesomeIcon icon={faPlus} /> New Notice
          </button>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="relative min-w-[220px] flex-1">
          <FontAwesomeIcon
            icon={faSearch}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search notices by title, body or author…"
            className="cos-input w-full pl-9"
            aria-label="Search notices"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(event) => setFilterCategory(event.target.value)}
          className="cos-input w-auto"
          aria-label="Filter by category"
        >
          <option value="ALL">All categories</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value)}
          className="cos-input w-auto"
          aria-label="Filter by status"
        >
          <option value="ALL">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(event) => setFilterPriority(event.target.value)}
          className="cos-input w-auto"
          aria-label="Filter by priority"
        >
          <option value="ALL">All priorities</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
          Loading notices…
        </div>
      ) : loadError ? (
        <EmptyState
          icon={faCircleExclamation}
          title="Notice board unavailable"
          description={loadError}
          actionLabel="Try again"
          onAction={() => void loadNotices()}
        />
      ) : visibleNotices.length === 0 ? (
        <EmptyState
          icon={faBell}
          title={notices.length === 0 ? "No notices yet" : "No notices match"}
          description={
            notices.length === 0
              ? "Official notices published by the administration will appear here."
              : "Adjust the search or filters to see more notices."
          }
          actionLabel={canCompose && notices.length === 0 ? "Create notice" : undefined}
          onAction={canCompose ? () => openComposer() : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visibleNotices.map((notice) => {
            const expired = isExpired(notice);
            const busy = busyActionId === notice.id;
            const mine = String(notice.authorId || "") === String(currentUser?.id || "");
            return (
              <article
                key={notice.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_STYLES[notice.category]}`}
                      >
                        {notice.category}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_STYLES[notice.priority]}`}
                      >
                        {notice.priority}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[notice.status]}`}
                      >
                        {notice.status}
                      </span>
                      {expired && (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700">
                          Expired
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 text-base font-bold text-slate-900">
                      {notice.title}
                    </h2>
                    <div
                      className="mt-1 line-clamp-3 text-sm text-slate-600 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 [&_h3]:font-semibold [&_h3]:text-slate-800 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5"
                      dangerouslySetInnerHTML={{
                        __html: formatNoticeBody(notice.contentHtml || notice.body),
                      }}
                    />
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faUserTag} className="text-[10px]" />
                        {notice.author}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faBell} className="text-[10px]" />
                        {notice.audienceLabel || "Everyone"}
                      </span>
                      {notice.publishedAt && (
                        <span className="inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faCircleCheck} className="text-[10px]" />
                          {new Date(notice.publishedAt).toLocaleString()}
                        </span>
                      )}
                      {notice.expiresAt && (
                        <span className="inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faClock} className="text-[10px]" />
                          Expires {new Date(notice.expiresAt).toLocaleString()}
                        </span>
                      )}
                      {notice.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faFile} className="text-[10px]" />
                          {notice.attachments.length} attachment
                          {notice.attachments.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDetail(notice)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      <FontAwesomeIcon icon={faEye} /> View
                    </button>
                    {canCompose && (isManager || mine) && notice.status !== "ARCHIVED" && (
                      <button
                        type="button"
                        onClick={() => openComposer(notice)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        <FontAwesomeIcon icon={faPencil} /> Edit
                      </button>
                    )}
                    {canCompose && notice.status === "DRAFT" && (isManager || mine) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction("publish", notice)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
                      >
                        {busy ? (
                          <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                        ) : (
                          <FontAwesomeIcon icon={faCircleCheck} />
                        )}
                        Publish
                      </button>
                    )}
                    {canCompose && notice.status === "PUBLISHED" && (isManager || mine) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction("archive", notice)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      >
                        <FontAwesomeIcon icon={faBan} />
                        Archive
                      </button>
                    )}
                    {canCompose && notice.status === "ARCHIVED" && (isManager || mine) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction("restore", notice)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        <FontAwesomeIcon icon={faArrowRotateLeft} />
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Composer modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-[0_25px_50px_-12px_rgba(15,23,42,0.25)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingId ? "Edit Notice" : "New Notice"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingId
                    ? "Changes are saved to the existing notice."
                    : "Compose, target an audience and publish or save a draft."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-slate-600"
                aria-label="Close composer"
              >
                <FontAwesomeIcon icon={faXmark} className="text-lg" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  maxLength={180}
                  placeholder="e.g. Mid-term examination schedule"
                  className="cos-input w-full"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Body <span className="text-red-500">*</span>
                </label>
                <RichTextEditor
                  value={form.contentHtml}
                  onChange={(html) => updateForm("contentHtml", html)}
                  placeholder="Write the notice…"
                  minHeight="10rem"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Category
                  </label>
                  <div className="relative">
                    <select
                      value={form.category}
                      onChange={(event) =>
                        updateForm("category", event.target.value as NoticeCategory)
                      }
                      className="cos-input w-full appearance-none pr-8"
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <FontAwesomeIcon
                      icon={faChevronDown}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Priority
                  </label>
                  <div className="relative">
                    <select
                      value={form.priority}
                      onChange={(event) =>
                        updateForm("priority", event.target.value as NoticePriority)
                      }
                      className="cos-input w-full appearance-none pr-8"
                    >
                      {PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                    <FontAwesomeIcon
                      icon={faChevronDown}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Status
                  </label>
                  <div className="relative">
                    <select
                      value={form.status}
                      onChange={(event) =>
                        updateForm("status", event.target.value as NoticeStatus)
                      }
                      className="cos-input w-full appearance-none pr-8"
                    >
                      <option value="PUBLISHED">Published</option>
                      <option value="DRAFT">Draft</option>
                    </select>
                    <FontAwesomeIcon
                      icon={faChevronDown}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                  <FontAwesomeIcon icon={faUserTag} className="text-[10px]" />
                  Audience
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: "ALL", label: "All students" },
                      { value: "STAFF", label: "Staff only" },
                      { value: "SPECIFIC", label: "Specific cohort" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateForm("targetType", option.value)}
                      className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        form.targetType === option.value
                          ? "bg-[var(--color-primary)] text-white"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {form.targetType === "SPECIFIC" && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Programme codes (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={form.programCodes}
                          onChange={(event) =>
                            updateForm("programCodes", event.target.value)
                          }
                          placeholder="BScIT"
                          className="cos-input w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Batch years (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={form.batchYears}
                          onChange={(event) =>
                            updateForm("batchYears", event.target.value)
                          }
                          placeholder="2025, 2026"
                          className="cos-input w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Semesters (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={form.semesters}
                          onChange={(event) =>
                            updateForm("semesters", event.target.value)
                          }
                          placeholder="1, 3, 5"
                          className="cos-input w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Section codes (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={form.sectionCodes}
                          onChange={(event) =>
                            updateForm("sectionCodes", event.target.value)
                          }
                          placeholder="A1, A2"
                          className="cos-input w-full"
                        />
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={form.allSections}
                        onChange={(event) =>
                          updateForm("allSections", event.target.checked)
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Include all sections of the selected cohorts
                    </label>
                  </div>
                )}

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-1.5 text-xs font-medium text-slate-600">
                    Role reach (legacy targeting)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ROLE_OPTIONS.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                          form.targetRoles.includes(role)
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                            : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Leave all roles unselected to address everyone. Teachers
                    without the publishing permission must target a specific
                    audience.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <FontAwesomeIcon icon={faCalendarDays} className="text-[10px]" />
                    Expiry date (optional)
                  </label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(event) => updateForm("expiresAt", event.target.value)}
                    className="cos-input w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Attachments
                  </label>
                  <NoticeAttachments
                    value={attachments}
                    onChange={setAttachments}
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="cos-btn cos-btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveNotice()}
                className="cos-btn cos-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {saving && <FontAwesomeIcon icon={faSpinner} className="animate-spin" />}
                {editingId
                  ? "Save changes"
                  : form.status === "DRAFT"
                    ? "Save draft"
                    : "Publish notice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <NoticeDetailModal
          notice={detail}
          onClose={() => setDetail(null)}
          onDownload={(attachment) =>
            void downloadStoredFileById(
              attachment.fileId,
              attachment.originalName,
            ).catch(() =>
              toast({ variant: "error", message: "The file could not be downloaded." }),
            )
          }
          onPreview={(attachment) =>
            setPreview({
              fileId: attachment.fileId,
              originalName: attachment.originalName,
              mimeType: attachment.mimeType,
              extension: attachment.extension,
              sizeBytes: attachment.sizeBytes,
              isPreviewable: attachment.isPreviewable,
            })
          }
        />
      )}

      <DocumentViewerModal file={preview} onClose={() => setPreview(null)} />
    </div>
  );
};

interface NoticeDetailModalProps {
  notice: NoticeRecord;
  onClose: () => void;
  onPreview: (attachment: NoticeAttachment) => void;
  onDownload: (attachment: NoticeAttachment) => void;
}

const NoticeDetailModal: React.FC<NoticeDetailModalProps> = ({
  notice,
  onClose,
  onPreview,
  onDownload,
}) => {
  const expired = isExpiredStatic(notice);
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_STYLES[notice.category]}`}
              >
                {notice.category}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_STYLES[notice.priority]}`}
              >
                {notice.priority}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[notice.status]}`}
              >
                {notice.status}
              </span>
              {expired && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700">
                  Expired
                </span>
              )}
            </div>
            <h2 className="mt-2 text-lg font-bold text-slate-900">{notice.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              By {notice.author}
              {notice.publishedAt && ` · ${new Date(notice.publishedAt).toLocaleString()}`}
              {notice.audienceLabel && ` · ${notice.audienceLabel}`}
              {notice.expiresAt && ` · Expires ${new Date(notice.expiresAt).toLocaleString()}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-slate-400 hover:text-slate-600"
            aria-label="Close notice"
          >
            <FontAwesomeIcon icon={faXmark} className="text-lg" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {notice.contentHtml ? (
            <div
              className="cos-rendered-notice max-w-none [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-800 [&_ul]:ml-6 [&_ul]:list-disc [&_li]:my-1 [&_div]:my-1"
              dangerouslySetInnerHTML={{ __html: notice.contentHtml }}
            />
          ) : (
            <div
              className="max-w-none text-sm text-slate-700 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-800 [&_ul]:ml-6 [&_ul]:list-disc [&_li]:my-1 [&_div]:my-1"
              dangerouslySetInnerHTML={{ __html: formatNoticeBody(notice.body) }}
            />
          )}

          {notice.attachments.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                Attachments ({notice.attachments.length})
              </h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {notice.attachments.map((attachment) => {
                  const kind = previewKindOf(attachment.mimeType);
                  return (
                    <li
                      key={attachment.fileId}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                        <FontAwesomeIcon
                          icon={
                            kind === "pdf"
                              ? faFilePdf
                              : kind === "image"
                                ? faFileImage
                                : attachment.mimeType.includes("wordprocessing")
                                  ? faFileWord
                                  : attachment.mimeType.includes("presentation")
                                    ? faFilePowerpoint
                                    : faFile
                          }
                          className="text-sm text-slate-500"
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-800">
                          {attachment.originalName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatBytes(attachment.sizeBytes)} · {attachment.mimeType}
                        </p>
                      </div>
                      {attachment.isPreviewable && (
                        <button
                          type="button"
                          title="Preview attachment"
                          aria-label={`Preview ${attachment.originalName}`}
                          onClick={() => onPreview(attachment)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Download attachment"
                        aria-label={`Download ${attachment.originalName}`}
                        onClick={() => onDownload(attachment)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      >
                        <FontAwesomeIcon icon={faDownload} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="cos-btn cos-btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

function isExpiredStatic(notice: NoticeRecord): boolean {
  return Boolean(notice.expiresAt) && new Date(notice.expiresAt!) < new Date();
}

const formatNoticeBody = (text: string): string => {
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text;
  }
  let formatted = text;

  formatted = formatted.replace(
    /^(Official Examination Notice:.*)$/gim,
    "<h2>$1</h2>"
  );
  formatted = formatted.replace(/^(Examination:.*)$/gim, "<h3>$1</h3>");
  formatted = formatted.replace(
    /^(INSTRUCTIONS FOR CANDIDATES|INSTRUCTIONS|EXAMINATION DETAILS|DETAILS|SUBJECT):?$/gim,
    "<h3>$1</h3>"
  );

  formatted = formatted.replace(
    /(Course|Program & Semester|Date \(Gregorian\)|Date \(Nepali\)|Time|Venue \/ Rooms|Eligible Candidates|Issued By|Published On|Subject|To):\s*([^\n\r]+)/gim,
    "<div><strong>$1:</strong> $2</div>"
  );

  formatted = formatted.replace(/^[-•]\s*(.+)$/gim, "<li>$1</li>");
  formatted = formatted.replace(/(<li>.*<\/li>)/gms, "<ul>$1</ul>");

  formatted = formatted
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br/>");
  formatted = "<p>" + formatted + "</p>";

  return formatted;
};

export default NoticesView;
