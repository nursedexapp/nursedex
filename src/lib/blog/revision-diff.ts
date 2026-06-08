import { diffWords, type Change } from "diff";
import { extractPlainText } from "./text";
import type { BlogPostRevision } from "@/types/database";

export type DiffPart = Change;

export interface RevisionDiff {
  title: DiffPart[];
  excerpt: DiffPart[];
  body: DiffPart[];
}

/**
 * Word-level diff of two revisions' title, excerpt, and (flattened) body.
 * `from` is the older version, `to` the newer; added/removed flags on each
 * part are relative to that direction. Pure, so it is unit testable.
 */
export function diffRevisions(
  from: BlogPostRevision,
  to: BlogPostRevision,
): RevisionDiff {
  return {
    title: diffWords(from.title, to.title),
    excerpt: diffWords(from.excerpt ?? "", to.excerpt ?? ""),
    body: diffWords(extractPlainText(from.content), extractPlainText(to.content)),
  };
}
