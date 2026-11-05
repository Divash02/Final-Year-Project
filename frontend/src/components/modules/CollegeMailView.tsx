import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faEnvelopeOpenText,
  faPaperclip,
  faInfoCircle,
  faClockRotateLeft,
  faCircleInfo,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../services/apiClient";
import { formatDateTimeForCalendar } from "../../lib/nepaliCalendar";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { WorkspaceLayout } from "../layout/WorkspaceLayout";
import { ListPane } from "../layout/ListPane";
import { RightRail } from "../layout/RightRail";
import { MailList } from "../mail/MailList";
import { MailReader } from "../mail/MailReader";
import { MailToolbar } from "../mail/MailToolbar";
import { MailComposer } from "../mail/MailComposer";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
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
  trash: "Trash is empty.",
};

export const CollegeMailView: React.FC = () => {
  const { calendarType, language } = useCollegeOS();
  const [folder, setFolder] = useState<MailFolderId>("inbox");
  const [mail, setMail] = useState<MailRow[]>([]);
  const [selected, setSelected] = useState<MailDetail | null>(null);
  const [search, setSearch] = useState("");
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
        if (isActive()) setMail(result.mail);
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
    [],
  );

  useEffect(() => {
    let active = true;
    setSelected(null);
    setDigest(null);
    void loadFolder(folder, () => active);
    return () => {
      active = false;
    };
  }, [folder, loadFolder]);

  const filteredMail = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return mail;
    return mail.filter((item) =>
      [mailSenderName(item), item.email, item.subject, item.body]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [mail, search]);

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
          row.id === item.id ? { ...row, read_at: row.read_at || item.created_at } : row,
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not open this mail thread.",
      );
    }
  };

  /** Applies a mutation locally so the list reflects the server immediately. */
  const patchSelected = (mutate: (row: MailRow) => MailRow) => {
    if (!selected) return;
    setMail((current) =>
      current.map((row) => (row.id === selected.thread.id ? mutate(row) : row)),
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
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request();
      onSuccess();
      setNotice(`${label} completed.`);
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
          () => apiRequest(`/mail/${mailId}/folder`, { method: "PATCH", body: JSON.stringify({ folder: "archive" }) }),
          () => {
            setSelected(null);
            setDigest(null);
            setMail((current) => current.filter((row) => row.id !== mailId));
          },
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
          },
        );

  const markUnreadSelected = () =>
    mailId === undefined
      ? undefined
      : runAction(
          "Mark as unread",
          () => apiRequest(`/mail/${mailId}/read`, { method: "PATCH", body: JSON.stringify({ isRead: false }) }),
          () => {
            patchSelected((row) => ({ ...row, read_at: null }));
            setSelected(null);
            setDigest(null);
          },
        );

  const toggleSelectedStar = () => {
    if (mailId === undefined) return;
    const nextStarred = !selected?.thread.is_starred;
    void runAction(
      nextStarred ? "Star" : "Remove star",
      () => apiRequest(`/mail/${mailId}/star`, { method: "PATCH" }),
      () => patchSelected((row) => ({ ...row, is_starred: nextStarred })),
    );
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
    MAIL_FOLDERS.find((definition) => definition.id === folder)?.label ?? "Mail";

  return (
    <WorkspaceLayout
      title="College Mail"
      icon={faEnvelope}
      toolbar={
        <>
          <span className="hidden text-sm text-slate-500 sm:inline">
            {unreadCount > 0
              ? `${unreadCount} unread in ${activeFolderLabel}`
              : `No unread mail in ${activeFolderLabel}`}
          </span>
          <Button
            icon={faEnvelopeOpenText}
            onClick={() =>
              setComposer({ recipient: "", subject: "", body: "" })
            }
          >
            Compose
          </Button>
        </>
      }
      listPane={
        <ListPane
          label="Mail folders"
          toolbar={
            <nav aria-label="Mail folders" className="space-y-1">
              {MAIL_FOLDERS.map((definition) => {
                const isActive = folder === definition.id;
                return (
                  <button
                    key={definition.id}
                    type="button"
                    onClick={() => setFolder(definition.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`cos-nav-item !text-slate-700 ${
                      isActive
                        ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                        : "hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <FontAwesomeIcon
                      icon={definition.icon}
                      className="w-[1.125rem] shrink-0 text-base text-center"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{definition.label}</span>
                    {definition.id === "inbox" && unreadCount > 0 && (
                      <span className="shrink-0 rounded-md bg-[var(--color-primary)] px-1.5 py-0.5 text-xs font-semibold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          }
          footer={`${filteredMail.length} message${filteredMail.length === 1 ? "" : "s"}`}
        >
          <MailList
            mails={filteredMail}
            selectedId={selected?.thread.id ?? null}
            onSelect={(item) => void openMail(item)}
            onToggleStar={toggleListStar}
            search={search}
            onSearchChange={setSearch}
            loading={loading}
            emptyMessage={
              search
                ? "No messages in this folder match your search."
                : EMPTY_FOLDER_MESSAGES[folder]
            }
            formatTimestamp={formatTimestamp}
          />
        </ListPane>
      }
      rightRail={
        <RightRail
          label="Message details"
          actions={[
            {
              icon: faInfoCircle,
              label: selected ? "Message details" : "Select a message first",
              disabled: !selected,
            },
            {
              icon: faPaperclip,
              label:
                selected && selected.thread.attachments?.length
                  ? `${selected.thread.attachments.length} attachment(s)`
                  : "No attachments",
              disabled: !selected?.thread.attachments?.length,
            },
            {
              icon: faClockRotateLeft,
              label: "Delivery and read history",
              disabled: true,
            },
          ]}
        />
      }
    >
      {error && (
        <div className="px-5 pt-4">
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}
      {notice && (
        <div className="px-5 pt-4">
          <Alert variant="success" onDismiss={() => setNotice("")}>
            {notice}
          </Alert>
        </div>
      )}

      {selected ? (
        <>
          <MailToolbar
            showBack
            onBack={() => {
              setSelected(null);
              setDigest(null);
            }}
            onArchive={() => void archiveSelected?.()}
            onDelete={() => void deleteSelected?.()}
            onMarkUnread={() => void markUnreadSelected?.()}
            onReply={startSmartReply}
            onSummarize={toggleSummary}
            onToggleStar={toggleSelectedStar}
            isStarred={Boolean(selected.thread.is_starred)}
            isSummarizing={Boolean(digest)}
            busy={busy}
            canArchive={folder !== "archive" && folder !== "trash"}
            canMarkUnread={folder !== "sent" && folder !== "drafts"}
          />
          <MailReader
            detail={selected}
            formatTimestamp={formatTimestamp}
            digest={digest}
          />
        </>
      ) : (
        <div className="p-6">
          <EmptyState
            icon={faCircleInfo}
            title="Select a message"
            description={`Choose a message from the ${activeFolderLabel.toLowerCase()} list to read it here. Use Summarize and Smart Reply once a message is open.`}
          />
        </div>
      )}

      <MailComposer
        isOpen={composer !== null}
        initialRecipient={composer?.recipient}
        initialSubject={composer?.subject}
        initialBody={composer?.body}
        onClose={() => setComposer(null)}
        onSend={sendMail}
      />
    </WorkspaceLayout>
  );
};

export default CollegeMailView;