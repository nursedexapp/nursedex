import { slugify } from "./slug";
import type { TiptapDoc, TiptapNode } from "@/types/database";

export interface TocHeading {
  level: number;
  text: string;
  id: string;
}

/** Plain text of a single node (its text descendants), whitespace collapsed. */
export function nodeText(node: TiptapNode): string {
  const parts: string[] = [];
  const walk = (n: TiptapNode) => {
    if (typeof n.text === "string") parts.push(n.text);
    for (const c of n.content ?? []) walk(c);
  };
  walk(node);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Deterministic, de-duplicated anchor id for a heading. Mutates `seen`,
 * so the same Map shared (in document order) between the renderer and the
 * table of contents produces matching ids.
 */
export function headingId(text: string, seen: Map<string, number>): string {
  const base = slugify(text) || "section";
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

/**
 * The post's headings in document order, with the same ids the renderer
 * assigns. Pure, so it is unit testable.
 */
export function extractHeadings(doc: TiptapDoc | null | undefined): TocHeading[] {
  if (!doc?.content) return [];
  const seen = new Map<string, number>();
  const out: TocHeading[] = [];
  const walk = (node: TiptapNode) => {
    if (node.type === "heading") {
      const text = nodeText(node);
      if (text) {
        const raw = Number(node.attrs?.level) || 2;
        const level = Math.min(Math.max(raw, 2), 6);
        out.push({ level, text, id: headingId(text, seen) });
      }
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  for (const node of doc.content) walk(node);
  return out;
}
