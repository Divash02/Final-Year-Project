import IsomorphicDOMPurify from "isomorphic-dompurify";

const { sanitize, addHook } = IsomorphicDOMPurify;

/**
 * Server-side rich-text sanitisation.
 *
 * Notice bodies are authored as HTML by the rich-text editor, so
 * the server never stores what the editor produced verbatim: every
 * save passes through this strict allow-list. Scripts, iframes,
 * event-handler attributes, `javascript:` URIs and CSS constructs
 * are removed before the string touches the database, which keeps
 * stored-XSS impossible even if a client-side check is bypassed.
 *
 * The same allow-list is applied on the client before render, so a
 * notice is safe in defence-in-depth, not by trusting one layer.
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

addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    // Every link opens safely: no opener access, never a new
    // browsing context unless the author explicitly asked.
    node.setAttribute("rel", "noopener noreferrer");
    if (node.getAttribute("target") !== "_blank") {
      node.removeAttribute("target");
    }
  }
  if (node.getAttribute("style")) {
    // Tiptap's text-style writes `color: #rrggbb`; keep colour
    // declarations and drop every other CSS property, on every
    // element, so backgrounds, positions and url() payloads
    // cannot ride through on any tag.
    const kept = node
      .getAttribute("style")
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

/**
 * Sanitises an HTML notice body. Returns an empty string for
 * anything that is not a string, so a malformed payload can never
 * be stored as raw markup.
 */
export function sanitizeNoticeHtml(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  return sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: SAFE_URI,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "svg", "math"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "src", "class", "id"],
  }).trim();
}

/** Plain-text extraction for search/preview, from sanitized HTML. */
export function htmlToPlainText(html) {
  if (typeof html !== "string" || !html) return "";
  // Every tag boundary becomes a space so words from
  // different elements never run together.
  return sanitize(html.replace(/<[^>]*>/g, " "), { ALLOWED_TAGS: [] })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sanitises a rich-text email signature. Unlike notice bodies, signatures
 * may embed an uploaded handwritten-signature image, so `img`/`src`/`alt`
 * are permitted while scripts, event-handler attributes and dangerous CSS
 * are still stripped before persistence.
 */
export function sanitizeSignatureHtml(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  return sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS, "img"],
    ALLOWED_ATTR: [...ALLOWED_ATTR, "src", "alt"],
    ALLOWED_URI_REGEXP: SAFE_URI,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "svg", "math"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "class", "id"],
  }).trim();
}
