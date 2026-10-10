// Used on the server (save and render); kept free of "server-only" so it can be unit-tested.
import sanitizeHtml from "sanitize-html";
import { toRichHtml } from "@/lib/rich-text";

const ALIGN = [/^(left|center|right|justify)$/];

/**
 * Keeps only what the product editor can produce (paragraphs, headings, lists, bold, italic,
 * underline, alignment, links, divider lines). Links open in a new tab and only http(s)/mailto are allowed,
 * so stored HTML can never run script. Run on save and again before rendering.
 */
export function sanitizeRichText(value: string): string {
  return sanitizeHtml(toRichHtml(value), {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "ul", "ol", "li", "a", "blockquote", "hr"],
    allowedAttributes: { a: ["href", "target", "rel"], p: ["style"], h2: ["style"], h3: ["style"] },
    allowedStyles: { "*": { "text-align": ALIGN } },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
    },
  });
}
