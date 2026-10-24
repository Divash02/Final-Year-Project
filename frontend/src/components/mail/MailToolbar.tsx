import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBoxArchive,
  faTrash,
  faEnvelopeOpen,
  faReply,
  faListUl,
  faStar,
} from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "../ui/IconButton";

export interface MailToolbarProps {
  /** Shown only below `lg`, where the list pane stacks above the canvas. */
  showBack: boolean;
  onBack: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMarkUnread: () => void;
  onReply: () => void;
  onSummarize: () => void;
  onToggleStar: () => void;
  isStarred: boolean;
  isSummarizing: boolean;
  busy: boolean;
  /** Destructive/folder actions that make no sense in the current folder. */
  canArchive: boolean;
  canMarkUnread: boolean;
}

/**
 * Reading-pane action bar.
 *
 * `Summarize` and `Smart Reply` are ordinary text actions with normal Font
 * Awesome icons. Neither carries artificial-intelligence branding.
 */
export const MailToolbar: React.FC<MailToolbarProps> = ({
  showBack,
  onBack,
  onArchive,
  onDelete,
  onMarkUnread,
  onReply,
  onSummarize,
  onToggleStar,
  isStarred,
  isSummarizing,
  busy,
  canArchive,
  canMarkUnread,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
    <div className="flex items-center gap-1">
      {showBack && (
        <IconButton icon={faArrowLeft} label="Back to mail list" onClick={onBack} />
      )}
      <IconButton
        icon={faBoxArchive}
        label="Archive message"
        onClick={onArchive}
        disabled={busy || !canArchive}
      />
      <IconButton
        icon={faTrash}
        label="Delete message"
        variant="danger"
        onClick={onDelete}
        disabled={busy}
      />
      <IconButton
        icon={faEnvelopeOpen}
        label="Mark as unread"
        onClick={onMarkUnread}
        disabled={busy || !canMarkUnread}
      />
      <IconButton
        icon={faStar}
        label={isStarred ? "Remove star" : "Star this message"}
        onClick={onToggleStar}
        disabled={busy}
        className={isStarred ? "text-amber-500" : ""}
      />
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onSummarize}
        aria-pressed={isSummarizing}
        aria-controls="mail-summary-panel"
        className="cos-btn cos-btn-ghost h-9 min-h-0 gap-2 px-3 text-sm"
      >
        <FontAwesomeIcon icon={faListUl} className="text-sm" aria-hidden="true" />
        {isSummarizing ? "Hide summary" : "Summarize"}
      </button>
      <button
        type="button"
        onClick={onReply}
        disabled={busy}
        className="cos-btn cos-btn-secondary h-9 min-h-0 gap-2 px-3 text-sm"
      >
        <FontAwesomeIcon icon={faReply} className="text-sm" aria-hidden="true" />
        Smart Reply
      </button>
    </div>
  </div>
);

export default MailToolbar;