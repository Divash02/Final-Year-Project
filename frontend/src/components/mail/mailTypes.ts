import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBoxArchive,
  faInbox,
  faPaperPlane,
  faPen,
  faStar,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

export interface MailAttachment {
  name?: string;
  filename?: string;
  size?: number | string;
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
  | "trash";

export interface MailFolderDefinition {
  id: MailFolderId;
  label: string;
  icon: IconDefinition;
  /** Folder id used when moving a message out of the current view. */
  primaryAction?: MailFolderId;
}

export const MAIL_FOLDERS: MailFolderDefinition[] = [
  { id: "inbox", label: "Inbox", icon: faInbox },
  { id: "sent", label: "Sent", icon: faPaperPlane },
  { id: "drafts", label: "Drafts", icon: faPen },
  { id: "starred", label: "Starred", icon: faStar },
  { id: "archive", label: "Archive", icon: faBoxArchive },
  { id: "trash", label: "Trash", icon: faTrash },
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