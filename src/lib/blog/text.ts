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
