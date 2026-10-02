// Product descriptions are stored as HTML from the admin's rich text editor. Older ones are plain
// text; these helpers turn either into what the editor or the page needs. No sanitizing here —
// see lib/rich-text-sanitize.ts (server-only) before rendering.

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Rich text from the editor starts with a tag; anything else is legacy plain text. */
export function isHtml(value: string): boolean {
  return /^\s*<[a-z]/i.test(value);
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/gi;

/** Plain text → paragraphs with line breaks; bare URLs become links. */
export function plainTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((para) => {
      const html = escapeHtml(para).replace(URL_PATTERN, (url) => `<a href="${url}">${url}</a>`);
      return `<p>${html.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

/** What the editor loads: stored HTML as is, legacy plain text converted. */
export function toRichHtml(value: string): string {
  return isHtml(value) ? value : plainTextToHtml(value);
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** Visible text only (for meta descriptions and structured data). */
export function richTextToPlain(value: string): string {
  if (!isHtml(value)) return value;
  return value
    .replace(/<(br|\/p|\/h[1-6]|\/li)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
