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
 * Estimated reading time in whole minutes for already-flattened text, at an
 * average adult reading pace. Always at least 1 minute. Pure. Computed once
 * on save from content_text so render paths never re-walk the document.
 */
export function readingTimeFromText(text: string | null | undefined): number {
  if (!text) return 1;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/**
 * Reading time for a Tiptap document. Convenience wrapper that flattens
 * first; prefer the stored reading_time_minutes (or readingTimeFromText on
 * content_text) on hot render paths.
 */
export function readingTimeMinutes(doc: TiptapDoc | null | undefined): number {
  return readingTimeFromText(extractPlainText(doc));
}
