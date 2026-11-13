import React, { useCallback, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faListUl,
  faReply,
  faTasks,
  faCircleInfo,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { digestMailMessage, MessageDigest } from "./messageDigest";

export interface MailAIActionsProps {
  body: string;
  onSummarize: (digest: MessageDigest | null) => void;
  onSmartReply: (suggestions: string[]) => void;
  onExtractActionItems: (items: string[]) => void;
  digest: MessageDigest | null;
  busy: boolean;
}

const AI_SUGGESTIONS: {
  id: string;
  label: string;
  description: string;
  icon: IconDefinition;
  color: string;
}[] = [
  {
    id: "summarize",
    label: "Summarize",
    description: "Get a concise summary of this message",
    icon: faListUl,
    color: "var(--color-mail-primary)",
  },
  {
    id: "smart-reply",
    label: "Smart Reply",
    description: "Generate contextual reply suggestions",
    icon: faReply,
    color: "var(--color-mail-secondary)",
  },
  {
    id: "action-items",
    label: "Action Items",
    description: "Extract tasks, deadlines, and decisions",
    icon: faTasks,
    color: "var(--color-mail-accent)",
  },
];

export const MailAIActions: React.FC<MailAIActionsProps> = ({
  body,
  onSummarize,
  onSmartReply,
  onExtractActionItems,
  digest,
  busy,
}) => {
  const [activePanel, setActivePanel] = useState<"summary" | "replies" | "actions" | null>(null);

  const handleSummarize = useCallback(() => {
    setActivePanel("summary");
    const result = digestMailMessage(body || "");
    onSummarize(result);
  }, [body, onSummarize]);

  const handleSmartReply = useCallback(() => {
    setActivePanel("replies");
    const suggestions = generateSmartReplies(body || "");
    onSmartReply(suggestions);
  }, [body, onSmartReply]);

  const handleExtractActionItems = useCallback(() => {
    setActivePanel("actions");
    const items = extractActionItems(body || "");
    onExtractActionItems(items);
  }, [body, onExtractActionItems]);

  const closePanel = useCallback(() => setActivePanel(null), []);

  if (activePanel === "summary" && digest) {
    return (
      <section className="mail-ai-panel">
        <div className="mail-ai-panel-header">
          <button
            type="button"
            onClick={closePanel}
            className="-mr-2 text-[var(--color-mail-text-muted)] hover:text-[var(--color-mail-text-primary)]"
            aria-label="Close summary"
          >
            <FontAwesomeIcon icon={faXmark} className="w-4 h-4" aria-hidden="true" />
          </button>
          <FontAwesomeIcon icon={faListUl} className="w-4 h-4" aria-hidden="true" />
          <h3 className="font-semibold text-[var(--color-mail-text-primary)]">
            Message summary
          </h3>
        </div>
        <div className="mail-ai-panel-body">
          <p className="text-sm font-medium text-[var(--color-mail-text-secondary)] mb-2">
            {digest.intent}
          </p>
          {digest.keyPoints.length > 0 && (
            <ul className="space-y-2">
              {digest.keyPoints.map((point, index) => (
                <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-[var(--color-mail-text-secondary)]">
                  <FontAwesomeIcon
                    icon={faCircleInfo}
                    className="mt-0.5 shrink-0 text-xs text-[var(--color-mail-primary)]"
                    aria-hidden="true"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-[var(--color-mail-text-muted)]">
            Extracted on this device from this message. No content is sent to an external service.
          </p>
        </div>
      </section>
    );
  }

  if (activePanel === "replies") {
    const suggestions = generateSmartReplies(body || "");
    return (
      <section className="mail-ai-panel">
        <div className="mail-ai-panel-header">
          <button
            type="button"
            onClick={closePanel}
            className="-mr-2 text-[var(--color-mail-text-muted)] hover:text-[var(--color-mail-text-primary)]"
            aria-label="Close replies"
          >
            <FontAwesomeIcon icon={faXmark} className="w-4 h-4" aria-hidden="true" />
          </button>
          <FontAwesomeIcon icon={faReply} className="w-4 h-4" aria-hidden="true" />
          <h3 className="font-semibold text-[var(--color-mail-text-primary)]">
            Smart Reply
          </h3>
        </div>
        <div className="mail-ai-panel-body">
          <p className="text-sm text-[var(--color-mail-text-muted)] mb-3">
            Choose a suggestion to pre-fill your reply. You can edit before sending.
          </p>
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onSmartReply([s]);
                setActivePanel(null);
              }}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2.5 text-left text-sm text-[var(--color-mail-text-secondary)] hover:bg-[var(--color-mail-surface-muted)] hover:text-[var(--color-mail-text-primary)] transition"
            >
              <span className="min-w-0 truncate">{s}</span>
              <FontAwesomeIcon icon={faReply} className="w-3.5 h-3.5 text-[var(--color-mail-text-muted)] shrink-0" aria-hidden="true" />
            </button>
          ))}
          {suggestions.length === 0 && (
            <p className="text-sm text-[var(--color-mail-text-muted)]">
              No reply suggestions available for this message.
            </p>
          )}
        </div>
      </section>
    );
  }

  if (activePanel === "actions") {
    const items = extractActionItems(body || "");
    return (
      <section className="mail-ai-panel">
        <div className="mail-ai-panel-header">
          <button
            type="button"
            onClick={closePanel}
            className="-mr-2 text-[var(--color-mail-text-muted)] hover:text-[var(--color-mail-text-primary)]"
            aria-label="Close action items"
          >
            <FontAwesomeIcon icon={faXmark} className="w-4 h-4" aria-hidden="true" />
          </button>
          <FontAwesomeIcon icon={faTasks} className="w-4 h-4" aria-hidden="true" />
          <h3 className="font-semibold text-[var(--color-mail-text-primary)]">
            Action Items
          </h3>
        </div>
        <div className="mail-ai-panel-body">
          {items.length > 0 ? (
            <ul className="space-y-2">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-[var(--color-mail-text-secondary)]">
                  <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-mail-accent)]"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-mail-text-muted)]">
              No action items detected in this message.
            </p>
          )}
          <p className="mt-3 text-xs text-[var(--color-mail-text-muted)]">
            Extracted from message content only. No external service is used.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex items-center gap-1">
      {AI_SUGGESTIONS.map(({ id, label, description, icon: Icon, color }) => {
        const active = activePanel !== null;
        return (
          <button
            key={id}
            type="button"
            onClick={
              id === "summarize"
                ? handleSummarize
                : id === "smart-reply"
                  ? handleSmartReply
                  : handleExtractActionItems
            }
            disabled={busy}
            aria-pressed={activePanel !== null && activePanel === id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              activePanel === id
                ? "border-[var(--color-mail-primary)] bg-[var(--color-mail-primary)]/10 text-[var(--color-mail-primary-strong)]"
                : "border-transparent bg-transparent text-[var(--color-mail-text-secondary)] hover:bg-[var(--color-mail-surface-muted)] hover:text-[var(--color-mail-text-primary)]"
            }`}
          >
            <FontAwesomeIcon icon={Icon} className={`w-4 h-4 ${activePanel === id ? "text-[var(--color-mail-primary-strong)]" : "text-[var(--color-mail-text-muted)]"}`} aria-hidden="true" />
            <span className={activePanel === id ? "font-semibold" : "font-medium"}>{label}</span>
          </button>
        );
      })}
    </section>
  );
};

function generateSmartReplies(body: string): string[] {
  const text = (body || "").toLowerCase();
  const suggestions: string[] = [];

  if (/\b(thank you|thanks|appreciate)\b/.test(text)) {
    suggestions.push("You're welcome. Let me know if you need anything else.");
  }
  if (/\b(meeting|call|appointment|schedule)\b/.test(text)) {
    suggestions.push("I'm available. Please share a few time options that work for you.");
  }
  if (/\b(please|kindly|could you|can you)\b/.test(text)) {
    suggestions.push("I'll look into this and get back to you shortly.");
  }
  if (/\b(receipt|confirm|acknowledge)\b/.test(text)) {
    suggestions.push("Confirmed. Thank you for the update.");
  }
  if (/\b(deadline|due|submit|by )\b/.test(text)) {
    suggestions.push("I'll make sure this is completed before the deadline.");
  }

  if (suggestions.length === 0) {
    suggestions.push("Thank you for your message. I'll review it and respond.");
    suggestions.push("I'll get back to you shortly with more details.");
  }

  return suggestions.slice(0, 3);
}

function extractActionItems(body: string): string[] {
  const text = body || "";
  const items: string[] = [];

  const deadlineMatch = text.match(/due[^.]*\./i);
  if (deadlineMatch) items.push(deadlineMatch[0].trim());

  const submitMatch = text.match(/submit[^.]*\./i);
  if (submitMatch) items.push(submitMatch[0].trim());

  const meetingMatch = text.match(/meeting[^.]*\./i);
  if (meetingMatch) items.push(meetingMatch[0].trim());

  const reviewMatch = text.match(/review[^.]*\./i);
  if (reviewMatch) items.push(reviewMatch[0].trim());

  if (items.length === 0 && text.length > 0) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const actionLike = sentences.filter(
      (s) => /\b(must|should|need to|please|kindly|deadline|due|submit|action)\b/i.test(s),
    );
    items.push(...actionLike.slice(0, 3));
  }

  return items.slice(0, 4);
}
