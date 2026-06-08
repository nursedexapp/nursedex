import type { TiptapDoc, TiptapNode } from "@/types/database";

/**
 * Flatten a Tiptap document to its plain text, so the post body can be
 * indexed for full text search. Pure, so it is unit testable. Collapses
 * whitespace and joins block text with spaces.
 */
export function extractPlainText(doc: TiptapDoc | null | undefined): string {
  if (!doc?.content) return "";
  const parts: string[] = [];
  const walk = (node: TiptapNode) => {
    if (typeof node.text === "string") parts.push(node.text);
    for (const child of node.content ?? []) walk(child);
  };
  for (const node of doc.content) walk(node);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const WORDS_PER_MINUTE = 220;

/**
 * Estimated reading time in whole minutes for a post body, at an average
 * adult reading pace. Always at least 1 minute. Pure, so it is unit
 * testable.
 */
export function readingTimeMinutes(doc: TiptapDoc | null | undefined): number {
  const text = extractPlainText(doc);
  if (!text) return 1;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
