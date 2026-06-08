import type { TiptapDoc, TiptapNode } from "@/types/database";

export interface Footnote {
  number: number;
  text: string;
}

/**
 * Collect footnote nodes in document order, numbered 1..N. Empty footnotes
 * are skipped. Pure, so it is unit testable, and it walks the document in
 * the same order the renderer does, so the numbers match the inline
 * references the renderer emits.
 */
export function collectFootnotes(doc: TiptapDoc | null | undefined): Footnote[] {
  if (!doc?.content) return [];
  const out: Footnote[] = [];
  const walk = (node: TiptapNode) => {
    if (node.type === "footnote") {
      const text =
        typeof node.attrs?.text === "string" ? node.attrs.text.trim() : "";
      if (text) out.push({ number: out.length + 1, text });
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  for (const node of doc.content) walk(node);
  return out;
}
