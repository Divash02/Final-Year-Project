import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaperclip,
  faListUl,
  faReply,
  faReplyAll,
  faForward,
  faBoxArchive,
  faTrash,
  faEnvelopeOpen,
  faStar,
  faEllipsis,
  faChevronLeft,
  faPaperPlane,
  faEnvelope,
} from "@fortawesome/free-solid-svg-icons";
import { MailDetail, mailAttachmentName, mailSenderName } from "./mailTypes";
import { MessageDigest } from "./messageDigest";
import { MailAIActions } from "./MailAIActions";
import { RichTextDisplay } from "../ui/RichTextDisplay";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";

export interface MailReaderProps {
  detail: MailDetail;
  formatTimestamp: (value: string) => string;
  digest: MessageDigest | null;
  onBack: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onPermanentDelete: () => void;
  onMarkUnread: () => void;
  onReply: () => void;
  onToggleStar: () => void;
  onSummarize: () => void;
  isStarred: boolean;
  isSummarizing: boolean;
  busy: boolean;
  canArchive: boolean;
  canMarkUnread: boolean;
  isTrash: boolean;
}

export const MailReader: React.FC<MailReaderProps> = ({
  detail,
  formatTimestamp,
  digest,
  onBack,
  onArchive,
  onDelete,
  onPermanentDelete,
  onMarkUnread,
  onReply,
  onToggleStar,
  onSummarize,
  isStarred,
  isSummarizing,
  busy,
  canArchive,
  canMarkUnread,
  isTrash,
}) => {
  const { thread, recipients } = detail;
  const attachments = thread.attachments ?? [];
  const ccEmails = detail.ccEmails ?? thread.ccEmails ?? [];
  const bccEmails = detail.bccEmails ?? thread.bccEmails ?? [];
  const sender = mailSenderName(thread);
  const isUnread = !thread.read_at;

  const allRecipients = [
    ...recipients.map((r) => r.email),
    ...ccEmails,
    ...bccEmails,
  ];

  return (
    <article className="mail-reader">
      {/* Top action toolbar */}
      <div className="mail-reader-toolbar">
        <div className="mail-reader-toolbar-left">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-mail-text-secondary)] hover:bg-[var(--color-mail-row-hover)] hover:text-[var(--color-mail-text-primary)] transition"
            aria-label="Back to mail list"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" aria-hidden="true" />
          </button>
          <IconButton
            icon={faBoxArchive}
            label="Archive"
            variant="ghost"
            size="sm"
            onClick={onArchive}
            disabled={busy || !canArchive}
          />
          {isTrash ? (
            <IconButton
              icon={faTrash}
              label="Delete permanently"
              variant="danger"
              size="sm"
              onClick={onPermanentDelete}
              disabled={busy}
            />
          ) : (
            <IconButton
              icon={faTrash}
              label="Delete"
              variant="danger"
              size="sm"
              onClick={onDelete}
              disabled={busy}
            />
          )}
          <IconButton
            icon={faEnvelopeOpen}
            label={isUnread ? "Mark as read" : "Mark as unread"}
            variant="ghost"
            size="sm"
            onClick={onMarkUnread}
            disabled={busy || !canMarkUnread}
          />
        </div>
        <div className="mail-reader-toolbar-right">
          <IconButton
            icon={isStarred ? faStar : faStar}
            label={isStarred ? "Remove star" : "Star this message"}
            variant="ghost"
            size="sm"
            onClick={onToggleStar}
            disabled={busy}
            className={isStarred ? "text-[var(--color-mail-star)]" : ""}
          />
          <IconButton
            icon={faEllipsis}
            label="More actions"
            variant="ghost"
            size="sm"
            className="text-[var(--color-mail-text-muted)]"
          />
        </div>
      </div>

      {/* Email header - subject and sender */}
      <header className="mail-reader-header">
        <div className="mail-reader-subject-row">
          <FontAwesomeIcon
            icon={isStarred ? faStar : faStar}
            className="mail-reader-star-btn"
            aria-label={isStarred ? "Remove star" : "Star this message"}
            aria-pressed={isStarred}
            onClick={onToggleStar}
          />
          <h1 className="mail-reader-subject">
            {thread.subject || "(no subject)"}
          </h1>
          <div className="mail-reader-labels">
            {isUnread && (
              <span className="mail-reader-label">Unread</span>
            )}
          </div>
        </div>

        <div className="mail-reader-meta">
          <div className="mail-reader-sender-row">
            <div className="mail-reader-avatar shrink-0">
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(sender)}&background=3949AB&color=fff`}
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              {!thread.sender_email && (
                <span className="text-xs font-medium">
                  {sender.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="mail-reader-sender-info flex-1 min-w-0">
              <span className="mail-reader-sender-name">{sender}</span>
              <span className="mail-reader-sender-email">
                &lt;{thread.sender_email}&gt;
              </span>
            </div>
          </div>

          {allRecipients.length > 0 && (
            <div className="mail-reader-recipients">
              <strong>To:</strong> {allRecipients.join(", ")}
            </div>
          )}

          <div className="mail-reader-meta-row">
            <span className="label">Sent</span>
            <time dateTime={thread.created_at}>
              {formatTimestamp(thread.created_at)}
            </time>
          </div>
        </div>
      </header>

      {/* AI actions bar */}
      <div className="border-t border-[var(--color-mail-border)] bg-[var(--color-mail-reader-header-bg)] px-4 py-3 shrink-0">
        <MailAIActions
          body={thread.body}
          onSummarize={() => onSummarize()}
          onSmartReply={() => onReply()}
          onExtractActionItems={() => {}}
          digest={digest}
          busy={busy || isSummarizing}
        />
      </div>

      {/* Message body */}
      <div className="mail-reader-body">
        {thread.body ? (
          <RichTextDisplay
            content={thread.body}
            className="max-w-none"
          />
        ) : (
          <div className="mail-reader-body-empty">
            <div className="mail-reader-empty-icon">
              <FontAwesomeIcon icon={faEnvelope} className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="mail-reader-empty-title">No message content</h3>
            <p className="mail-reader-empty-desc">
              This message has no body content.
            </p>
          </div>
        )}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <section className="mail-reader-attachments">
          <div className="mail-reader-attachments-header">
            <span className="mail-reader-attachments-title">
              Attachments ({attachments.length})
            </span>
          </div>
          <ul className="mail-reader-attachment-list">
            {attachments.map((attachment, index) => (
              <li key={index} className="mail-reader-attachment-item">
                <FontAwesomeIcon
                  icon={faPaperclip}
                  className="mail-reader-attachment-icon"
                  aria-hidden="true"
                />
                <div className="mail-reader-attachment-info">
                  <span className="mail-reader-attachment-name">
                    {mailAttachmentName(attachment)}
                  </span>
                  <span className="mail-reader-attachment-meta">
                    {attachment.type ? attachment.type.toUpperCase() : ""}
                    {attachment.size && attachment.type ? " · " : ""}
                    {attachment.size ? `${Number(attachment.size) / 1024} KB` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="mail-reader-attachment-download"
                  aria-label={`Download ${mailAttachmentName(attachment)}`}
                >
                  <FontAwesomeIcon icon={faPaperPlane} className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
};

export default MailReader;
