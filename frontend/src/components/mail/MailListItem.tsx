import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar } from "@fortawesome/free-solid-svg-icons";
import { mailSenderName, MailRow } from "./mailTypes";

export interface MailListItemProps {
  mail: MailRow;
  isSelected: boolean;
  isUnread: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
  onSelectCheckbox?: (checked: boolean) => void;
  isCheckboxSelected?: boolean;
  showCheckbox?: boolean;
  formatTimestamp: (value: string) => string;
}

export const MailListItem: React.FC<MailListItemProps> = ({
  mail,
  isSelected,
  isUnread,
  onSelect,
  onToggleStar,
  onSelectCheckbox,
  isCheckboxSelected = false,
  showCheckbox = false,
  formatTimestamp,
}) => {
  const sender = mailSenderName(mail);
  const initials = sender
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isSelected ? "true" : undefined}
        className={`mail-list-row ${isSelected || isCheckboxSelected ? "selected" : ""} ${
          isUnread ? "unread" : ""
        }`}
      >
        {showCheckbox && (
          <input
            type="checkbox"
            checked={isCheckboxSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelectCheckbox?.(e.target.checked);
            }}
            aria-label={`Select message from ${sender}`}
            className="mail-list-row-checkbox"
          />
        )}
        <div className="mail-list-row-avatar shrink-0">
          {mail.sender_email ? (
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(sender)}&background=3949AB&color=fff`}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
          {!mail.sender_email && <span>{initials}</span>}
        </div>
        <div className="mail-list-row-content">
          <div className="mail-list-row-header">
            <span className="mail-list-row-sender">{sender}</span>
            <time className="mail-list-row-time">
              {formatTimestamp(mail.created_at)}
            </time>
          </div>
          <span className="mail-list-row-subject">
            {mail.subject || "(no subject)"}
          </span>
          <span className="mail-list-row-preview">{mail.body}</span>
        </div>
        <FontAwesomeIcon
          icon={faStar}
          className={`mail-list-row-star ${mail.is_starred ? "starred" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          aria-label={mail.is_starred ? "Remove star" : "Star this message"}
          aria-pressed={Boolean(mail.is_starred)}
        />
      </button>
    </li>
  );
};

export default MailListItem;
