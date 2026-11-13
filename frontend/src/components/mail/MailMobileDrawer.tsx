import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faEnvelope, faInbox, faPaperPlane, faPen, faStar, faBoxArchive, faTrash, faCaretLeft } from "@fortawesome/free-solid-svg-icons";
import { MailFolderId } from "./mailTypes";
import { IconButton } from "../ui/IconButton";

export interface MailMobileDrawerProps {
  show: boolean;
  onClose: () => void;
  folder: MailFolderId;
  onFolderChange: (folder: MailFolderId) => void;
  unreadCount: number;
  onCompose: () => void;
}

const DRAWER_ITEMS: { id: MailFolderId; label: string; icon: IconDefinition }[] = [
  { id: "inbox", label: "Inbox", icon: faInbox },
  { id: "starred", label: "Starred", icon: faStar },
  { id: "sent", label: "Sent", icon: faPaperPlane },
  { id: "drafts", label: "Drafts", icon: faPen },
  { id: "archive", label: "Archive", icon: faBoxArchive },
  { id: "spam", label: "Spam", icon: faEnvelope },
  { id: "trash", label: "Trash", icon: faTrash },
  { id: "all", label: "All Mail", icon: faEnvelope },
];

export const MailMobileDrawer: React.FC<MailMobileDrawerProps> = ({
  show,
  onClose,
  folder,
  onFolderChange,
  unreadCount,
  onCompose,
}) => {
  if (!show) return null;

  return (
    <div
      className="mail-mobile-nav lg:hidden transform transition-transform duration-300 ease-in-out"
      role="navigation"
      aria-label="Mail folders"
    >
      <div className="mail-mobile-nav-header">
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-mail-text-secondary)] hover:bg-[var(--color-mail-surface-muted)] hover:text-[var(--color-mail-text-primary)] transition"
          aria-label="Close navigation"
        >
          <FontAwesomeIcon icon={faCaretLeft} className="w-4 h-4" aria-hidden="true" />
        </button>
        <span className="font-semibold text-[var(--color-mail-text-primary)] text-lg flex-1">
          Mail folders
        </span>
        <button
          type="button"
          onClick={onCompose}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-mail-primary)] text-white hover:bg-[var(--color-mail-primary-strong)] transition"
          aria-label="Compose message"
        >
          <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-mail-text-muted)]">
          Folders
        </h2>
        {DRAWER_ITEMS.map((item) => {
          const isActive = folder === item.id;
          const showBadge = item.id === "inbox" && unreadCount > 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onFolderChange(item.id);
                onClose();
              }}
              aria-current={isActive ? "page" : undefined}
              className={`mail-mobile-nav-item ${isActive ? "[aria-current=\"page\"]" : ""}`}
            >
              <FontAwesomeIcon
                icon={item.icon}
                className="w-5 h-5 shrink-0 text-[var(--color-mail-text-muted)]"
                aria-hidden="true"
              />
              <span className="flex-1 truncate text-[var(--color-mail-text-secondary)]">
                {item.label}
              </span>
              {showBadge && (
                <span className="shrink-0 rounded-md bg-[var(--color-mail-primary)] px-1.5 py-0.5 text-xs font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MailMobileDrawer;
