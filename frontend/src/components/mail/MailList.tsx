import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faStar,
  faPaperclip,
} from "@fortawesome/free-solid-svg-icons";
import { mailSenderName, MailRow } from "./mailTypes";

export interface MailListProps {
  mails: MailRow[];
  selectedId: number | null;
  onSelect: (mail: MailRow) => void;
  onToggleStar: (mail: MailRow) => void;
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  emptyMessage: string;
  /** Formats the timestamp column using the active calendar system. */
  formatTimestamp: (value: string) => string;
}

/** Unread/selected mail list for the 320px collection pane. */
export const MailList: React.FC<MailListProps> = ({
  mails,
  selectedId,
  onSelect,
  onToggleStar,
  search,
  onSearchChange,
  loading,
  emptyMessage,
  formatTimestamp,
}) => (
  <div className="flex h-full min-h-0 flex-col">
    <div className="border-b border-slate-200 px-3 py-3">
      <div className="relative">
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search this folder"
          aria-label="Search this folder"
          className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 transition focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </div>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto">
      {loading ? (
        <ul className="divide-y divide-slate-100" aria-label="Loading mail">
          {Array.from({ length: 6 }).map((_, index) => (
            <li key={index} className="space-y-2 px-4 py-3.5">
              <div className="h-3 w-2/5 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
            </li>
          ))}
        </ul>
      ) : mails.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {mails.map((mail) => {
            const isUnread = !mail.read_at;
            const isSelected = selectedId === mail.id;

            return (
              <li key={mail.id}>
                <div
                  className={`flex items-start gap-1 border-l-[3px] transition ${
                    isSelected
                      ? "border-l-[var(--color-primary)] bg-[var(--color-primary-soft)]/50"
                      : "border-l-transparent hover:bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(mail)}
                    aria-current={isSelected ? "true" : undefined}
                    className="min-w-0 flex-1 cursor-pointer px-3.5 py-3.5 text-left"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={`flex min-w-0 items-center gap-1.5 truncate text-sm ${
                          isUnread
                            ? "font-semibold text-slate-950"
                            : "font-medium text-slate-700"
                        }`}
                      >
                        {isUnread && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]"
                            aria-label="Unread"
                          />
                        )}
                        <span className="truncate">{mailSenderName(mail)}</span>
                      </span>
                      <time className="shrink-0 text-xs text-slate-400">
                        {formatTimestamp(mail.created_at)}
                      </time>
                    </span>

                    <span
                      className={`mt-1 block truncate text-sm ${
                        isUnread
                          ? "font-semibold text-slate-900"
                          : "text-slate-700"
                      }`}
                    >
                      {mail.subject || "(no subject)"}
                    </span>

                    <span className="mt-1 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-500">
                        {mail.body}
                      </span>
                      {mail.attachments && mail.attachments.length > 0 && (
                        <FontAwesomeIcon
                          icon={faPaperclip}
                          className="shrink-0 text-xs text-slate-400"
                          aria-label={`${mail.attachments.length} attachment(s)`}
                        />
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleStar(mail)}
                    aria-label={
                      mail.is_starred
                        ? `Remove star from message from ${mailSenderName(mail)}`
                        : `Star message from ${mailSenderName(mail)}`
                    }
                    aria-pressed={Boolean(mail.is_starred)}
                    className={`mr-1.5 mt-3.5 shrink-0 cursor-pointer rounded-md p-1.5 transition hover:bg-slate-200/70 ${
                      mail.is_starred ? "text-amber-500" : "text-slate-300"
                    }`}
                  >
                    <FontAwesomeIcon
                      icon={faStar}
                      className="text-xs"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </div>
);

export default MailList;