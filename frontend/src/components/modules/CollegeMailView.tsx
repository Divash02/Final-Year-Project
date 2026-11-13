import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faPlus,
  faTrash,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../services/apiClient";
import { formatDateTimeForCalendar } from "../../lib/nepaliCalendar";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { MailNavigation } from "../mail/MailNavigation";
import { MailList } from "../mail/MailList";
import { MailReader } from "../mail/MailReader";
import { MailComposer } from "../mail/MailComposer";
import { MailMobileDrawer } from "../mail/MailMobileDrawer";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Alert, AlertVariant } from "../ui/Alert";
import { EmptyState } from "../ui/EmptyState";
import {
  MAIL_FOLDERS,
  MailFolderId,
  MailRow,
  MailDetail,
  mailSenderName,
} from "../mail/mailTypes";
import { digestMailMessage, MessageDigest } from "../mail/messageDigest";

const EMPTY_FOLDER_MESSAGES: Record<MailFolderId, string> = {
  inbox: "Your inbox is empty. New institutional mail will appear here.",
  sent: "You have not sent any mail yet.",
  drafts: "No drafts in this mailbox.",
  starred: "No starred messages.",
  archive: "Nothing has been archived.",
  spam: "No spam messages.",
  trash: "Trash is empty.",
  all: "No messages found.",
};

type ViewMode = "list" | "detail";

export const CollegeMailView: React.FC = () => {
  const { calendarType, language, currentTenant, currentUser } = useCollegeOS();
  const [folder, setFolder] = useState<MailFolderId>("inbox");
  const [mail, setMail] = useState<MailRow[]>([]);
  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [digest, setDigest] = useState<MessageDigest | null>(null);
  const [composer, setComposer] = useState<{
    recipient: string;
    subject: string;
    body: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<AlertVariant>("success");
  const [collapsed, setCollapsed] = useState(false);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);

  const formatTimestamp = useCallback(
    (value: string) => formatDateTimeForCalendar(value, calendarType, language),
    [calendarType, language],
  );

  const loadFolder = useCallback(
    async (targetFolder: MailFolderId, isActive: () => boolean) => {
      setLoading(true);
      setError("");
      try {
        const result = await apiRequest<{ mail: MailRow[] }>(
          `/mail?folder=${targetFolder}`,
        );
        if (isActive()) {
          setMail(result.mail);
          setSelectedIds(new Set());
          if (viewMode === "detail" && window.innerWidth < 768) {
            setViewMode("list");
          }
        }
      } catch (requestError) {
        if (isActive()) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load College Mail.",
          );
        }
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [viewMode],
  );

  useEffect(() => {
    let active = true;
    setSelected(null);
    setDigest(null);
    setSelectedIds(new Set());
    void loadFolder(folder, () => active);
    return () => {
      active = false;
    };
  }, [folder, loadFolder]);

  const filteredMail = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = mail.filter((item) => {
      if (filter === "unread") return !item.read_at;
      if (filter === "starred") return Boolean(item.is_starred);
      if (filter === "attachments")
        return Boolean(item.attachments && item.attachments.length > 0);
      return true;
    });
    if (!query) return base;
    return base.filter((item) =>
      [mailSenderName(item), item.email, item.subject, item.body]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [mail, search, filter]);

  const unreadCount = useMemo(
    () => mail.filter((item) => !item.read_at).length,
    [mail],
  );

  const openMail = async (item: MailRow) => {
    setError("");
    setNotice("");
    setDigest(null);
    try {
      const detail = await apiRequest<MailDetail>(`/mail/${item.id}`);
      setSelected(detail);
      setMail((current) =>
        current.map((row) =>
          row.id === item.id
            ? { ...row, read_at: row.read_at || item.created_at }
            : row,
        ),
      );
      if (window.innerWidth < 768) setViewMode("detail");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not open this mail thread.",
      );
    }
  };

  const patchSelected = (mutate: (row: MailRow) => MailRow) => {
    if (!selected) return;
    setMail((current) =>
      current.map((row) =>
        row.id === selected.thread.id ? mutate(row) : row,
      ),
    );
    setSelected((current) =>
      current
        ? {
            ...current,
            thread: mutate(current.thread),
          }
        : current,
    );
  };

  const runAction = async (
    label: string,
    request: () => Promise<unknown>,
    onSuccess: () => void,
    opts?: { showNotice?: boolean; variant?: AlertVariant; noticeMessage?: string },
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request();
      onSuccess();
      if (opts?.showNotice !== false) {
        setNotice(opts?.noticeMessage ?? `${label} completed.`);
        setNoticeVariant(opts?.variant ?? "success");
        setTimeout(() => setNotice(""), 4000);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : `${label} failed.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const mailId = selected?.thread.id;

  const archiveSelected = () =>
    mailId === undefined
      ? undefined
      : runAction(
          "Archive",
          () =>
            apiRequest(`/mail/${mailId}/folder`, {
              method: "PATCH",
              body: JSON.stringify({ folder: "archive" }),
            }),
          () => {
            setSelected(null);
            setDigest(null);
            setMail((current) => current.filter((row) => row.id !== mailId));
            if (window.innerWidth < 768) setViewMode("list");
          },
          { noticeMessage: "Email archived", variant: "success" },
        );

  const deleteSelected = () =>
    mailId === undefined
      ? undefined
      : runAction(
          "Delete",
          () => apiRequest(`/mail/${mailId}`, { method: "DELETE" }),
          () => {
            setSelected(null);
            setDigest(null);
            setMail((current) => current.filter((row) => row.id !== mailId));
            if (window.innerWidth < 768) setViewMode("list");
          },
          { noticeMessage: "Email moved to Trash", variant: "warning" },
        );

  const permanentDeleteSelected = () =>
    mailId === undefined
      ? undefined
      : runAction(
          "Permanent delete",
          () => apiRequest(`/mail/${mailId}/permanent`, { method: "DELETE" }),
          () => {
            setSelected(null);
            setDigest(null);
            setPermanentDeleteId(null);
            setMail((current) => current.filter((row) => row.id !== mailId));
            if (window.innerWidth < 768) setViewMode("list");
          },
          { noticeMessage: "Email permanently deleted", variant: "error" },
        );

  const markUnreadSelected = () =>
    mailId === undefined
      ? undefined
      : runAction(
          "Mark as unread",
          () =>
            apiRequest(`/mail/${mailId}/read`, {
              method: "PATCH",
              body: JSON.stringify({ isRead: false }),
            }),
          () => {
            patchSelected((row) => ({ ...row, read_at: null }));
            setSelected(null);
            setDigest(null);
            if (window.innerWidth < 768) setViewMode("list");
          },
        );

  const toggleSelectedStar = () => {
    if (mailId === undefined) return;
    const nextStarred = !selected?.thread.is_starred;
    void apiRequest(`/mail/${mailId}/star`, { method: "PATCH" })
      .then(() => {
        patchSelected((row) => ({ ...row, is_starred: nextStarred }));
        if (nextStarred) {
          setNotice("Star added successfully");
          setNoticeVariant("success");
          setTimeout(() => setNotice(""), 4000);
        } else {
          setNotice("Star removed");
          setNoticeVariant("warning");
          setTimeout(() => setNotice(""), 4000);
        }
      })
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not update star.",
        );
      });
  };

  const toggleListStar = (item: MailRow) => {
    const nextStarred = !item.is_starred;
    void runAction(
      nextStarred ? "Star" : "Remove star",
      () => apiRequest(`/mail/${item.id}/star`, { method: "PATCH" }),
      () =>
        setMail((current) =>
          current.map((row) =>
            row.id === item.id ? { ...row, is_starred: nextStarred } : row,
          ),
        ),
      {
        noticeMessage: nextStarred ? "Star added successfully" : "Star removed",
        variant: nextStarred ? "success" : "warning",
      },
    );
  };

  const sendMail = async (payload: {
    recipientEmail: string;
    recipientEmails: string[];
    ccEmails: string[];
    bccEmails: string[];
    subject: string;
    body: string;
    attachments: File[];
  }) => {
    setError("");
    await apiRequest("/mail", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const recipientCount =
      payload.recipientEmails.length +
      payload.ccEmails.length +
      payload.bccEmails.length;
    setNotice(`Mail sent to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}.`);
    setFolder("sent");
    setComposer(null);
  };

  const toggleSummary = () => {
    if (!selected) return;
    setDigest((current) =>
      current ? null : digestMailMessage(selected.thread.body),
    );
  };

  const startSmartReply = () => {
    if (!selected) return;
    const originalSubject = selected.thread.subject || "(no subject)";
    setComposer({
      recipient: selected.thread.sender_email,
      subject: originalSubject.toLowerCase().startsWith("re:")
        ? originalSubject
        : `Re: ${originalSubject}`,
      body: `\n\n---\nOn ${formatTimestamp(selected.thread.created_at)}, ${
        selected.thread.sender_email
      } wrote:\n${selected.thread.body}`,
    });
  };

  const activeFolderLabel =
    MAIL_FOLDERS.find((definition) => definition.id === folder)?.label ??
    "Mail";

  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
      }
      if (event.key === "Escape") {
        if (showMobileDrawer) setShowMobileDrawer(false);
        if (viewMode === "detail" && isMobile) setViewMode("list");
        if (!isMobile && selected) setSelected(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showMobileDrawer, viewMode, isMobile, selected]);

  const bulkActions = {
    onBulkArchive: () => {
      if (selectedIds.size === 0) return;
      runAction(
        "Archive",
        () =>
          Promise.all(
            Array.from(selectedIds).map((id) =>
              apiRequest(`/mail/${id}/folder`, {
                method: "PATCH",
                body: JSON.stringify({ folder: "archive" }),
              }),
            ),
          ),
        () => {
          setMail((current) => current.filter((row) => !selectedIds.has(row.id)));
          setSelectedIds(new Set());
        },
        { noticeMessage: "Emails archived", variant: "success" },
      );
    },
    onBulkDelete: () => {
      if (selectedIds.size === 0) return;
      runAction(
        "Delete",
        () =>
          Promise.all(
            Array.from(selectedIds).map((id) =>
              apiRequest(`/mail/${id}`, { method: "DELETE" }),
            ),
          ),
        () => {
          setMail((current) => current.filter((row) => !selectedIds.has(row.id)));
          setSelectedIds(new Set());
        },
        { noticeMessage: "Emails moved to Trash", variant: "warning" },
      );
    },
    onBulkMarkRead: () => {
      if (selectedIds.size === 0) return;
      runAction(
        "Mark as read",
        () =>
          Promise.all(
            Array.from(selectedIds).map((id) =>
              apiRequest(`/mail/${id}/read`, {
                method: "PATCH",
                body: JSON.stringify({ isRead: true }),
              }),
            ),
          ),
        () => {
          setMail((current) =>
            current.map((row) =>
              selectedIds.has(row.id) ? { ...row, read_at: new Date().toISOString() } : row,
            ),
          );
          setSelectedIds(new Set());
        },
      );
    },
    onBulkMarkUnread: () => {
      if (selectedIds.size === 0) return;
      runAction(
        "Mark as unread",
        () =>
          Promise.all(
            Array.from(selectedIds).map((id) =>
              apiRequest(`/mail/${id}/read`, {
                method: "PATCH",
                body: JSON.stringify({ isRead: false }),
              }),
            ),
          ),
        () => {
          setMail((current) =>
            current.map((row) =>
              selectedIds.has(row.id) ? { ...row, read_at: null } : row,
            ),
          );
          setSelectedIds(new Set());
        },
      );
    },
  };

  const onToggleSelection = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const onSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredMail.map((m) => m.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  return (
    <div className="mail-workspace flex h-full w-full bg-[var(--color-mail-background)]">
      {/* Mobile drawer overlay */}
      {showMobileDrawer && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setShowMobileDrawer(false)}
          aria-hidden="true"
        />
      )}
      <MailMobileDrawer
        show={showMobileDrawer}
        onClose={() => setShowMobileDrawer(false)}
        folder={folder}
        onFolderChange={setFolder}
        unreadCount={unreadCount}
        onCompose={() => {
          setComposer({ recipient: "", subject: "", body: "" });
          setShowMobileDrawer(false);
        }}
      />

      {/* Desktop navigation rail - always visible on desktop */}
      {!isMobile && (
        <MailNavigation
          folder={folder}
          onFolderChange={setFolder}
          unreadCount={unreadCount}
          onCompose={() => setComposer({ recipient: "", subject: "", body: "" })}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
        />
      )}

      {/* Main workspace - three panel layout */}
      <div className="flex flex-1 min-w-0 relative">
        {/* Message list panel - always visible on desktop */}
        {!isMobile ? (
          <div
            className="flex flex-col min-w-0 bg-white border-r border-slate-200 dark:border-dark-border w-[56%] max-w-[1100px] shrink-0 flex-col dark:bg-dark-surface"
          >
            <MailList
              mails={filteredMail}
              selectedId={selected?.thread.id ?? null}
              onSelect={openMail}
              onToggleStar={toggleListStar}
              search={search}
              onSearchChange={setSearch}
              filter={filter}
              onFilterChange={setFilter}
              loading={loading}
              emptyMessage={EMPTY_FOLDER_MESSAGES[folder]}
              formatTimestamp={formatTimestamp}
              folderLabel={activeFolderLabel}
              unreadCount={unreadCount}
              selectedIds={selectedIds}
              onToggleSelection={onToggleSelection}
              onSelectAll={onSelectAll}
              onBulkArchive={bulkActions.onBulkArchive}
              onBulkDelete={bulkActions.onBulkDelete}
              onBulkMarkRead={bulkActions.onBulkMarkRead}
              onBulkMarkUnread={bulkActions.onBulkMarkUnread}
            />
          </div>
        ) : (
          // Mobile: list view or detail view
          viewMode === "list" ? (
            <div
              className="flex flex-col min-w-0 bg-white border-r border-slate-200 dark:border-dark-border dark:bg-dark-surface"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowMobileDrawer(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-mail-text-secondary)] hover:bg-[var(--color-mail-surface-muted)] hover:text-[var(--color-mail-text-primary)] transition"
                  aria-label="Open navigation"
                >
                  <FontAwesomeIcon
                    icon={faEnvelope}
                    className="w-4 h-4"
                    aria-hidden="true"
                  />
                </button>
                <h1 className="font-semibold text-[var(--color-mail-text-primary)] text-lg">
                  {activeFolderLabel}
                </h1>
                <div className="flex items-center gap-1">
                  <Button
                    icon={faPlus}
                    onClick={() => setComposer({ recipient: "", subject: "", body: "" })}
                    size="sm"
                    className="bg-[var(--color-primary)] text-white hover:bg-[#8A1916]"
                  >
                    Compose
                  </Button>
                </div>
              </div>

              <MailList
                mails={filteredMail}
                selectedId={selected?.thread.id ?? null}
                onSelect={openMail}
                onToggleStar={toggleListStar}
                search={search}
                onSearchChange={setSearch}
                filter={filter}
                onFilterChange={setFilter}
                loading={loading}
                emptyMessage={EMPTY_FOLDER_MESSAGES[folder]}
                formatTimestamp={formatTimestamp}
                folderLabel={activeFolderLabel}
                unreadCount={unreadCount}
                selectedIds={selectedIds}
                onToggleSelection={onToggleSelection}
                onSelectAll={onSelectAll}
                onBulkArchive={bulkActions.onBulkArchive}
                onBulkDelete={bulkActions.onBulkDelete}
                onBulkMarkRead={bulkActions.onBulkMarkRead}
                onBulkMarkUnread={bulkActions.onBulkMarkUnread}
              />
            </div>
          ) : (
              <MailReader
                detail={selected!}
                formatTimestamp={formatTimestamp}
                digest={digest}
                onBack={() => {
                  setSelected(null);
                  setDigest(null);
                  setViewMode("list");
                }}
                onArchive={archiveSelected}
                onDelete={deleteSelected}
                onPermanentDelete={permanentDeleteSelected}
                onMarkUnread={markUnreadSelected}
                onReply={startSmartReply}
                onToggleStar={toggleSelectedStar}
                onSummarize={toggleSummary}
                isStarred={Boolean(selected?.thread.is_starred)}
                isSummarizing={Boolean(digest)}
                busy={busy}
                canArchive={folder !== "archive" && folder !== "trash"}
                canMarkUnread={folder !== "sent" && folder !== "drafts"}
                isTrash={folder === "trash"}
              />
          )
        )}

        {/* Reading pane panel - desktop: always visible with selected or empty state */}
        {!isMobile && (
          <div className="flex-1 min-w-0 bg-[var(--color-mail-background)]">
            {selected ? (
              <MailReader
                detail={selected}
                formatTimestamp={formatTimestamp}
                digest={digest}
                onBack={() => {
                  setSelected(null);
                  setDigest(null);
                }}
                onArchive={archiveSelected}
                onDelete={deleteSelected}
                onPermanentDelete={permanentDeleteSelected}
                onMarkUnread={markUnreadSelected}
                onReply={startSmartReply}
                onToggleStar={toggleSelectedStar}
                onSummarize={toggleSummary}
                isStarred={Boolean(selected.thread.is_starred)}
                isSummarizing={Boolean(digest)}
                busy={busy}
                canArchive={folder !== "archive" && folder !== "trash"}
                canMarkUnread={folder !== "sent" && folder !== "drafts"}
                isTrash={folder === "trash"}
              />
            ) : (
              <div className="mail-reader-empty flex h-full w-full flex-col items-center justify-center p-8">
                <div className="mail-reader-empty-icon">
                  <FontAwesomeIcon icon={faEnvelope} className="w-6 h-6" aria-hidden="true" />
                </div>
                <h3 className="mail-reader-empty-title">
                  Select an email to read
                </h3>
                <p className="mail-reader-empty-desc">
                  Choose a message from your inbox to view its contents.
                </p>
                <Button
                  icon={faPlus}
                  onClick={() => setComposer({ recipient: "", subject: "", body: "" })}
                  variant="outline"
                  size="sm"
                  className="mt-4 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white"
                >
                  Compose message
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="fixed top-6 right-6 z-[1300] max-w-sm">
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}
      {notice && (
        <div className="fixed top-6 right-6 z-[1300] max-w-sm">
          <Alert variant={noticeVariant} onDismiss={() => setNotice("")}>
            {notice}
          </Alert>
        </div>
      )}

      {/* Permanent delete confirmation dialog */}
      {permanentDeleteId && (
        <Modal
          isOpen={Boolean(permanentDeleteId)}
          onClose={() => setPermanentDeleteId(null)}
          title="Delete permanently?"
          subtitle="This email will be permanently deleted and cannot be recovered. This action cannot be undone."
          icon={faExclamationTriangle}
          maxWidth="sm"
        >
          <div className="text-sm text-slate-600 dark:text-dark-text-secondary mb-6">
            Confirm that you want to permanently delete this email. It will be removed from Trash and cannot be recovered.
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setPermanentDeleteId(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={permanentDeleteSelected}
              disabled={busy}
              icon={faTrash}
            >
              Delete permanently
            </Button>
          </div>
        </Modal>
      )}

      <MailComposer
        isOpen={composer !== null}
        initialRecipient={composer?.recipient}
        initialSubject={composer?.subject}
        initialBody={composer?.body}
        onClose={() => setComposer(null)}
        onSend={sendMail}
      />
    </div>
  );
};

export default CollegeMailView;
