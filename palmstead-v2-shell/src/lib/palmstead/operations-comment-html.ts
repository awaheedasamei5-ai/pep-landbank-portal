import sanitizeHtml from "sanitize-html";

export const OPERATION_COMMENT_TEXT_LIMIT = 20_000;
const textEntities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Plain composer input stays text even when it contains markup or angle brackets. */
export function operationCommentTextToHtml(text: string): string {
  const value = text.trim().replace(/\r\n?/g, "\n");
  if (!value) throw new Error("Enter a comment before posting.");
  if (value.length > OPERATION_COMMENT_TEXT_LIMIT) throw new Error("Comments must be 20,000 characters or fewer.");
  const escaped = value.replace(/[&<>"']/g, (character) => textEntities[character]);
  return `<p>${escaped.replace(/\n/g, "<br />")}</p>`;
}

/** Treat every saved/legacy comment as untrusted at the HTML rendering boundary. */
export function safeOperationCommentHtml(html: string | null | undefined): string {
  return sanitizeHtml(html ?? "", {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "ul", "ol", "li", "pre", "code", "a"],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "iframe", "object", "embed", "svg", "math"],
    parseStyleAttributes: false,
  });
}
