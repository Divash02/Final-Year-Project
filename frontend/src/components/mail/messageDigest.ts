/**
 * Deterministic, on-device message digest.
 *
 * This is an extractive summariser: it selects sentences out of the message the
 * reader already has. No external service is called and no content is generated,
 * so it cannot fabricate a response or imply an AI backend that does not exist.
 */

export interface MessageDigest {
  /** Short label for the most likely intent of the message. */
  intent: string;
  /** Key points extracted from the message body, in original order. */
  keyPoints: string[];
  /** Word count and estimated reading time. */
  wordCount: number;
  readingMinutes: number;
  /** True when the body was too short to summarise meaningfully. */
  tooShort: boolean;
}

const INTENT_RULES: { intent: string; pattern: RegExp }[] = [
  { intent: "Action required", pattern: /\b(action|required|deadline|submit|submitting|please (?:apply|submit|send|complete)|due by|kindly)\b/i },
  { intent: "Approval request", pattern: /\b(approv|sign-?off|authoris|authoriz|confirm your)\b/i },
  { intent: "Schedule update", pattern: /\b(reschedul|postpon|schedule|timetable|exam date|slot|shifted|moved to)\b/i },
  { intent: "Payment notice", pattern: /\b(invoice|payment|fee|due amount|receipt|billing|installment)\b/i },
  { intent: "Result publication", pattern: /\b(result|marks?|grade|transcript|published|transcript)\b/i },
  { intent: "Announcement", pattern: /\b(announce|notice|remind|important information|circular)\b/i },
  { intent: "Acknowledgement", pattern: /\b(thank you|received|acknowledg|noted)\b/i },
];

const KEY_POINT_PATTERN =
  /\b(due|deadline|submit|submitted|required|must|schedule|rescheduled|date|time|amount|npr|rs?\.|semester|section|room|document|form|attach|approved|rejected|pending|exam|result|fee|payment|contact|visit|apply|note that|kindly)\b/i;

const MAX_KEY_POINTS = 4;

function splitSentences(body: string): string[] {
  return body
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function digestMailMessage(body: string): MessageDigest {
  const trimmed = (body || "").trim();
  const words = trimmed ? trimmed.split(/\s+/) : [];
  const wordCount = words.length;

  if (wordCount < 12) {
    return {
      intent: "Short message",
      keyPoints: trimmed ? [trimmed] : [],
      wordCount,
      readingMinutes: 1,
      tooShort: true,
    };
  }

  const sentences = splitSentences(trimmed);
  const scored = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: KEY_POINT_PATTERN.test(sentence) ? 1 : 0,
    }))
    .filter((entry) => entry.score > 0);

  const chosen = (scored.length > 0 ? scored : sentences.slice(0, 2).map((sentence, index) => ({ sentence, index, score: 0 })))
    .slice(0, MAX_KEY_POINTS)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence);

  const intent =
    INTENT_RULES.find((rule) => rule.pattern.test(trimmed))?.intent ??
    "General correspondence";

  return {
    intent,
    keyPoints: chosen,
    wordCount,
    readingMinutes: Math.max(1, Math.round(wordCount / 200)),
    tooShort: false,
  };
}