import DOMPurify from "dompurify";

/**
 * Client-side rich-text sanitisation — the second half of the
 * defence-in-depth strategy: the server sanitises on write, the
 * client sanitises again before anything reaches `innerHTML`.
 *
 * Only the same allow-list the server enforces is permitted, so a
 * notice renders identically no matter which layer cleaned it.
 */

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s", "strike", "span", "mark",
  "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a",
];

const ALLOWED_ATTR = ["href", "target", "rel", "style"];

/** Only ordinary web links and mailto are carried through. */
const SAFE_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
    if (node.getAttribute("target") !== "_blank") {
      node.removeAttribute("target");
    }
  }
  if (node.getAttribute("style")) {
    // Keep `color: #rrggbb` declarations only; drop backgrounds,
    // positions, url() payloads and every other CSS property.
    const kept = (node.getAttribute("style") || "")
      .split(";")
      .map((declaration) => declaration.trim())
      .filter((declaration) => /^color\s*:\s*#[0-9a-f]{3,8}$/i.test(declaration));
    if (kept.length) {
      node.setAttribute("style", kept.join("; "));
    } else {
      node.removeAttribute("style");
    }
  }
});

/** Sanitises rich HTML for safe rendering. Never returns null. */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (typeof html !== "string" || !html.trim()) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: SAFE_URI,
    FORBID_TAGS: [
      "script", "style", "iframe", "object", "embed",
      "form", "input", "button", "svg", "math",
    ],
    FORBID_ATTR: ["onerror", "onload", "onclick", "src", "class", "id"],
  }).trim();
}

/** Plain-text extraction for excerpts, from sanitized HTML. */
export function richHtmlToPlainText(html: string | null | undefined): string {
  if (typeof html !== "string" || !html) return "";
  // Every tag boundary becomes a space so words from
  // different elements never run together.
  return DOMPurify.sanitize(html.replace(/<[^>]*>/g, " "), {
    ALLOWED_TAGS: [],
  })
    .replace(/\s+/g, " ")
    .trim();
}
