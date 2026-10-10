import { test } from "node:test";
import assert from "node:assert/strict";
import { isHtml, plainTextToHtml, richTextToPlain } from "./rich-text";
import { sanitizeRichText } from "./rich-text-sanitize";

test("legacy plain text becomes paragraphs with clickable links", () => {
  assert.equal(isHtml("hello"), false);
  assert.equal(
    plainTextToHtml("Line one\nline two\n\nSee https://example.com/a?b=1."),
    '<p>Line one<br>line two</p><p>See <a href="https://example.com/a?b=1">https://example.com/a?b=1</a>.</p>',
  );
  assert.equal(plainTextToHtml("<b>not html</b>"), "<p>&lt;b&gt;not html&lt;/b&gt;</p>");
});

test("sanitizeRichText keeps editor formatting and makes links safe", () => {
  const html = sanitizeRichText(
    '<h2 style="text-align: center">Title</h2><p><strong>b</strong> <em>i</em> <u>u</u></p><ul><li>x</li></ul><p><a href="https://x.dev">link</a></p>',
  );
  assert.match(html, /<h2 style="text-align:center">Title<\/h2>/);
  assert.match(html, /<strong>b<\/strong> <em>i<\/em> <u>u<\/u>/);
  assert.match(html, /<a href="https:\/\/x.dev" target="_blank" rel="noopener noreferrer nofollow">link<\/a>/);
});

test("sanitizeRichText keeps divider lines", () => {
  assert.equal(sanitizeRichText('<p>a</p><hr class="x" style="color:red"><p>b</p>'), "<p>a</p><hr /><p>b</p>");
});

test("sanitizeRichText strips scripts, event handlers and javascript: links", () => {
  const html = sanitizeRichText(
    '<p onclick="alert(1)">hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)><p style="color:red;text-align:left">c</p>',
  );
  assert.doesNotMatch(html, /script|onclick|onerror|javascript|<img|color/i);
  assert.match(html, /<p>hi<\/p>/);
  assert.match(html, /<p style="text-align:left">c<\/p>/);
});

test("richTextToPlain gives readable text for meta descriptions", () => {
  assert.equal(richTextToPlain("<h2>T</h2><p>a &amp; b<br>c</p><ul><li>x</li></ul>"), "T\na & b\nc\nx");
  assert.equal(richTextToPlain("plain stays"), "plain stays");
});
