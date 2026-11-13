import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBoxArchive,
  faEnvelope,
  faInbox,
  faPaperPlane,
  faPaperclip,
  faPen,
  faStar,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

export interface MailAttachment {
  name?: string;
  filename?: string;
  size?: number | string;
  type?: string;
  url?: string;
}

export interface MailRow {
  id: number;
  subject: string;
  body: string;
  created_at: string;
  folder: string;
  read_at: string | null;
  sender_email: string;
  sender_name?: string;
  email: string;
  first_name: string;
  last_name: string;
  is_starred?: boolean;
  isRead?: boolean;
  isDraft?: boolean;
  attachments?: MailAttachment[];
  recipientEmails?: string[];
  ccEmails?: string[];
  bccEmails?: string[];
}

export interface MailDetail {
  thread: MailRow & { sender_email: string };
  recipients: { email: string; first_name?: string; last_name?: string }[];
  ccEmails?: string[];
  bccEmails?: string[];
}

export type MailFolderId =
  | "inbox"
  | "sent"
  | "drafts"
  | "starred"
  | "archive"
  | "trash"
  | "spam"
  | "all";

export interface MailFolderDefinition {
  id: MailFolderId;
  label: string;
  icon: IconDefinition;
  /** Folder id used when moving a message out of the current view. */
  primaryAction?: MailFolderId;
}

export const MAIL_FOLDERS: MailFolderDefinition[] = [
  { id: "inbox", label: "Inbox", icon: faInbox },
  { id: "starred", label: "Starred", icon: faStar },
  { id: "sent", label: "Sent", icon: faPaperPlane },
  { id: "drafts", label: "Drafts", icon: faPen },
  { id: "archive", label: "Archive", icon: faBoxArchive },
  { id: "spam", label: "Spam", icon: faEnvelope },
  { id: "trash", label: "Trash", icon: faTrash },
  { id: "all", label: "All Mail", icon: faEnvelope },
];

export const MAIL_FILTERS: { id: string; label: string; icon: IconDefinition }[] = [
  { id: "all", label: "All", icon: faEnvelope },
  { id: "unread", label: "Unread", icon: faInbox },
  { id: "attachments", label: "Attachments", icon: faPaperclip },
  { id: "starred", label: "Starred", icon: faStar },
];

/** Human sender label, falling back to the institutional email address. */
export function mailSenderName(mail: MailRow): string {
  const composed = `${mail.first_name || ""} ${mail.last_name || ""}`.trim();
  return composed || mail.sender_name || mail.email;
}

/** Reads the attachment name across the shapes the API can return. */
export function mailAttachmentName(attachment: MailAttachment): string {
  return attachment.name || attachment.filename || "Attachment";
}

/** Reads the attachment size as a human-readable string. */
export function mailAttachmentSize(attachment: MailAttachment): string {
  const size = typeof attachment.size === "number" ? attachment.size : 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Extracts the file extension from an attachment name. */
export function mailAttachmentType(attachment: MailAttachment): string {
  const name = mailAttachmentName(attachment);
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1]?.toUpperCase() ?? "" : "";
}