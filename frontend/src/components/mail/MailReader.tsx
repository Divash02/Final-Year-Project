import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaperclip,
  faCircleInfo,
  faListUl,
  faClock,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { MailDetail, mailAttachmentName, mailSenderName } from "./mailTypes";
import { MessageDigest } from "./messageDigest";

export interface MailReaderProps {
  detail: MailDetail;
  formatTimestamp: (value: string) => string;
  /** Present when the reader-level summary panel is open. */
  digest: MessageDigest | null;
}

/**
 * Message reading pane. Body copy is set at a comfortable reading size
 * (`text-base` / `leading-7`) rather than dense metadata text.
 */
export const MailReader: React.FC<MailReaderProps> = ({
  detail,
  formatTimestamp,
  digest,
}) => {
  const { thread, recipients } = detail;
  const attachments = thread.attachments ?? [];

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-7 lg:px-8">
      <header>
        <h2 className="text-xl font-semibold leading-snug text-slate-900">
          {thread.subject || "(no subject)"}
        </h2>

        <dl className="mt-4 grid gap-3 border-y border-slate-200 py-4 text-sm sm:grid-cols-[8rem_1fr] sm:gap-x-4">
          <dt className="font-medium text-slate-500">From</dt>
          <dd className="min-w-0 text-slate-800">
            <span className="font-medium">{mailSenderName(thread)}</span>
            <span className="text-slate-500"> &lt;{thread.sender_email}&gt;</span>
          </dd>

          <dt className="font-medium text-slate-500">To</dt>
          <dd className="min-w-0 break-words text-slate-800">
            {recipients.map((recipient) => recipient.email).join(", ") || "you"}
          </dd>

          <dt className="font-medium text-slate-500">Sent</dt>
          <dd className="text-slate-800">
            <time dateTime={thread.created_at}>
              {formatTimestamp(thread.created_at)}
            </time>
          </dd>
        </dl>
      </header>

      {digest && (
        <section
          id="mail-summary-panel"
          aria-label="Message summary"
          className="rounded-xl border border-teal-200 bg-[var(--color-primary-soft)]/50 p-5"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-primary-strong)]">
            <FontAwesomeIcon icon={faListUl} aria-hidden="true" />
            Message summary
          </h3>

          <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <dt className="text-slate-600">Type</dt>
              <dd className="font-medium text-slate-900">{digest.intent}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-slate-600">Length</dt>
              <dd className="flex items-center gap-1.5 font-medium text-slate-900">
                <FontAwesomeIcon icon={faClock} className="text-xs text-slate-500" aria-hidden="true" />
                {digest.wordCount} words · about {digest.readingMinutes} min read
              </dd>
            </div>
          </dl>

          {digest.keyPoints.length > 0 && (
            <ul className="mt-4 space-y-2">
              {digest.keyPoints.map((point, index) => (
                <li
                  key={index}
                  className="flex gap-2.5 text-sm leading-relaxed text-slate-800"
                >
                  <FontAwesomeIcon
                    icon={faCircleInfo}
                    className="mt-1 shrink-0 text-xs text-[var(--color-primary)]"
                    aria-hidden="true"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 flex items-start gap-2 text-xs text-slate-600">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              Extracted on this device from the sentences in this message. No
              content is generated or sent to an external service.
            </span>
          </p>
        </section>
      )}

      <div className="whitespace-pre-wrap text-base leading-7 text-slate-700">
        {thread.body}
      </div>

      {attachments.length > 0 && (
        <section aria-label="Attachments" className="border-t border-slate-200 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Attachments ({attachments.length})
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {attachments.map((attachment, index) => (
              <li
                key={`${mailAttachmentName(attachment)}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-700"
              >
                <FontAwesomeIcon
                  icon={faPaperclip}
                  className="shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">
                  {mailAttachmentName(attachment)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
};

export default MailReader;