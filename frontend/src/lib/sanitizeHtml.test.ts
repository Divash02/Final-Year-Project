import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * DOMPurify needs a DOM to run. Under Node, jsdom (already
 * installed as a dependency of isomorphic-dompurify) provides
 * the browser globals before the sanitizer module is imported.
 */
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
// DOMPurify reads the browser globals at import time.
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
});

const { sanitizeRichHtml, richHtmlToPlainText } = await import("./sanitizeHtml");

describe("sanitizeRichHtml (client-side defence in depth)", () => {
  it("keeps ordinary rich text intact", () => {
    const html =
      "<h2>Exam routine</h2><p>The <strong>midterm</strong> is <em>Friday</em>.</p>" +
      "<ul><li>Bring a hall ticket</li></ul>" +
      '<a href="https://college.example.edu/routine">routine</a>';
    const clean = sanitizeRichHtml(html);
    assert.ok(clean.includes("<h2>Exam routine</h2>"));
    assert.ok(clean.includes("<strong>midterm</strong>"));
    assert.ok(clean.includes("<em>Friday</em>"));
    assert.ok(clean.includes("<li>Bring a hall ticket</li>"));
    assert.ok(clean.includes('href="https://college.example.edu/routine"'));
    assert.ok(clean.includes('rel="noopener noreferrer"'));
  });

  it("strips scripts, event handlers and javascript URLs", () => {
    const clean = sanitizeRichHtml(
      '<script>alert("xss")</script>' +
        '<p onclick="evil()">Hello</p>' +
        '<img src="x" onerror="evil()">' +
        '<a href="javascript:evil()">click</a>' +
        '<iframe src="https://evil.example"></iframe>',
    );
    assert.ok(!clean.includes("<script"), "scripts are removed");
    assert.ok(!clean.includes("onclick"), "handlers are removed");
    assert.ok(!clean.includes("onerror"), "image handlers are removed");
    assert.ok(!clean.includes("javascript:"), "javascript URLs are removed");
    assert.ok(!clean.includes("<iframe"), "iframes are removed");
    assert.ok(!clean.includes("<img"), "images are removed (no src allowed)");
    assert.ok(clean.includes("Hello"), "text survives");
  });

  it("keeps only hex color in inline styles", () => {
    const clean = sanitizeRichHtml(
      '<span style="color: #ff0000; position: fixed; background: url(javascript:evil())">red</span>',
    );
    assert.ok(clean.includes("color: #ff0000"), "safe color is kept");
    assert.ok(!clean.includes("position"), "unsafe CSS is dropped");
    assert.ok(!clean.includes("url("), "url() payloads are dropped");
  });

  it("removes class, id and src attributes", () => {
    const clean = sanitizeRichHtml(
      '<p class="big" id="first">text</p><a href="/x" class="link" target="_blank">y</a>',
    );
    assert.ok(!clean.includes("class="), "classes are removed");
    assert.ok(!clean.includes("id="), "ids are removed");
    // target is kept only as _blank alongside the forced rel.
    assert.ok(clean.includes('target="_blank"'));
  });

  it("returns an empty string for empty or non-string input", () => {
    assert.equal(sanitizeRichHtml(""), "");
    assert.equal(sanitizeRichHtml("   "), "");
    assert.equal(sanitizeRichHtml(null), "");
    assert.equal(sanitizeRichHtml(undefined), "");
  });
});

describe("richHtmlToPlainText", () => {
  it("extracts readable text from markup", () => {
    const text = richHtmlToPlainText(
      "<h2>Urgent</h2><p>Campus closes <strong>today</strong> at 3pm.</p>",
    );
    assert.equal(text, "Urgent Campus closes today at 3pm.");
  });

  it("returns an empty string for empty input", () => {
    assert.equal(richHtmlToPlainText(""), "");
    assert.equal(richHtmlToPlainText(null), "");
  });
});
