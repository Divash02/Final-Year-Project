import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faTrash,
  faBoxArchive,
  faEnvelope,
  faStar,
  faPaperclip,
} from "@fortawesome/free-solid-svg-icons";
import { MailListItem } from "./MailListItem";
import {
  MAIL_FILTERS,
  mailSenderName,
  MailRow,
} from "./mailTypes";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

export interface MailListProps {
  mails: MailRow[];
  selectedId: number | null;
  onSelect: (mail: MailRow) => void;
  onToggleStar: (mail: MailRow) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  loading: boolean;
  emptyMessage: string;
  formatTimestamp: (value: string) => string;
  /** Bulk selection state */
  selectedIds: Set<number>;
  onToggleSelection: (id: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onBulkMarkRead: () => void;
  onBulkMarkUnread: () => void;
  /** Folder context for header */
  folderLabel: string;
  unreadCount: number;
}

export const MailList: React.FC<MailListProps> = ({
  mails,
  selectedId,
  onSelect,
  onToggleStar,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  loading,
  emptyMessage,
  formatTimestamp,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onBulkArchive,
  onBulkDelete,
  onBulkMarkRead,
  onBulkMarkUnread,
  folderLabel,
  unreadCount,
}) => {
  const hasSelection = selectedIds.size > 0;

  const filteredByFilter = mails.filter((mail) => {
    if (filter === "unread") return !mail.read_at;
    if (filter === "starred") return Boolean(mail.is_starred);
    if (filter === "attachments")
      return Boolean(mail.attachments && mail.attachments.length > 0);
    return true;
  });

  const filteredBySearch = filteredByFilter.filter((mail) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const haystack = [
      mailSenderName(mail),
      mail.email,
      mail.subject,
      mail.body,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const [selectMode, setSelectMode] = useState(false);

  const filteredUnreadCount = filteredBySearch.filter(
    (m) => !m.read_at,
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Inbox header - always visible */}
      <div className="mail-list-header">
        <div className="mail-list-header-left">
          <div className="mail-list-folder-title">{folderLabel}</div>
          <div className="mail-list-folder-subtitle">
            {filteredBySearch.length} message{
              filteredBySearch.length === 1 ? "" : "s"
            } ·
            {filteredUnreadCount > 0
              ? `${filteredUnreadCount} unread`
              : "No unread messages"}
          </div>
        </div>
        <div className="mail-list-search-wrap">
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="mail-list-search-icon"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search messages"
            aria-label="Search messages"
            className="mail-list-search-input"
          />
        </div>
      </div>

      {/* Filter pills - always visible */}
      <div className="mail-list-filter-pills" role="group" aria-label="Message filters">
        {selectMode ? (
          <div className="mail-list-select-controls">
            <button
              type="button"
              onClick={() => onSelectAll(true)}
              className="mail-list-select-action"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => onSelectAll(false)}
              className="mail-list-select-action"
            >
              None
            </button>
            <button
              type="button"
              onClick={() => setSelectMode(false)}
              className="mail-list-select-action mail-list-select-cancel"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="mail-list-select-btn"
            aria-label="Select messages"
          >
            Select
          </button>
        )}
        {MAIL_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="button"
            aria-pressed={filter === f.id}
            onClick={() => onFilterChange(f.id)}
            className={`mail-list-filter-pill ${filter === f.id ? "active" : ""}`}
          >
            <FontAwesomeIcon
              icon={f.icon}
              className="w-3.5 h-3.5 shrink-0"
              aria-hidden="true"
            />
            {f.label}
          </button>
        ))}
      </div>

      {/* Bulk action toolbar (shown when messages selected) */}
      {hasSelection && (
        <div className="mail-list-bulk-toolbar flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-dark-surface-muted border-b border-slate-200 dark:border-dark-border shrink-0 mb-4">
          <span className="text-xs font-medium text-[var(--color-mail-text-muted)] shrink-0">
            {selectedIds.size} selected
          </span>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onBulkArchive()}
            disabled={!hasSelection}
          >
            <FontAwesomeIcon icon={faBoxArchive} className="w-4 h-4" aria-hidden="true" />
            Archive
          </Button>
          <Button
            variant="danger"
            size="xs"
            onClick={() => onBulkDelete()}
            disabled={!hasSelection}
          >
            <FontAwesomeIcon icon={faTrash} className="w-4 h-4" aria-hidden="true" />
            Delete
          </Button>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => onBulkMarkRead()}
            disabled={!hasSelection}
          >
            <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4" aria-hidden="true" />
            Mark read
          </Button>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => onBulkMarkUnread()}
            disabled={!hasSelection}
          >
            <FontAwesomeIcon icon={faStar} className="w-4 h-4" aria-hidden="true" />
            Mark unread
          </Button>
        </div>
      )}

      {/* Message list area - shows loading, empty, or actual rows */}
      <div className="mail-list-rows">
        {loading ? (
          <ul role="list" aria-label="Loading mail">
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="space-y-2 px-4 py-4">
                <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-dark-border" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-dark-border mt-2" />
              </li>
            ))}
          </ul>
        ) : filteredBySearch.length === 0 ? (
          <div className="mail-list-empty">
            <EmptyState
              icon={faMagnifyingGlass}
              title={
                search
                  ? "No matching messages"
                  : emptyMessage
              }
              description={
                search
                  ? "Try adjusting your search terms or browse a different folder."
                  : "No messages in this folder yet."
              }
              actionLabel="Compose message"
              actionIcon={faEnvelope}
              onAction={undefined}
              className="mail-empty"
            />
          </div>
        ) : (
          <ul role="list" aria-label="Messages">
            {filteredBySearch.map((mail) => {
              const isUnread = !mail.read_at;
              const isSelected = selectedId === mail.id;
              const isCheckboxSel = selectedIds.has(mail.id);

              return (
                <MailListItem
                  key={mail.id}
                  mail={mail}
                  isSelected={isSelected}
                  isUnread={isUnread}
                  onSelect={() => onSelect(mail)}
                  onToggleStar={() => onToggleStar(mail)}
                  onSelectCheckbox={onToggleSelection
                    ? (checked) => onToggleSelection(mail.id, checked)
                    : undefined}
                  isCheckboxSelected={isCheckboxSel}
                  showCheckbox={selectMode}
                  formatTimestamp={formatTimestamp}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MailList;
