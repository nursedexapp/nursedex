import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { slugify } from "./slug";

import { unwrapOrThrow, assertNoWriteError } from "@/lib/db/results";
/**
 * Normalize a list of taxonomy names: trim, drop blanks, and dedupe case
 * insensitively while preserving the first-seen casing and order. Pure, so
 * it is unit testable.
 */
export function normalizeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * When merging tag A into tag B, the post ids that need a new link to B:
 * posts tagged A but not already tagged B (so the (post_id, tag_id) primary
 * key is never violated). Deduped. Pure, so it is unit testable.
 */
export function tagRelinkPostIds(
  sourcePostIds: string[],
  targetPostIds: string[],
): string[] {
  const already = new Set(targetPostIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of sourcePostIds) {
    if (already.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// Find-or-create runs with the service-role client so it sees rows
// regardless of RLS and so the UNIQUE(slug) constraint is the real arbiter
// (see memory: slug uniqueness RLS blind spot). A losing insert race falls
// back to re-reading the row created by the winner.

/** Resolve a category name to its id, creating it if needed. Empty -> null. */
export async function findOrCreateCategory(
  name: string,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const slug = slugify(trimmed);
  if (!slug) return null;

  const supabase = createServiceRoleClient();
  // A failed read is NOT "no category with this slug" (#847). It falls through
  // to the insert, which the unique constraint then refuses, and the retry
  // read below returns null, so the post is saved with no category at all.
  const existing = await unwrapOrThrow(
    supabase
      .from("blog_categories")
      .select("id")
      .eq("slug", slug)
      .maybeSingle(),
    "an existing category with this slug",
  );
  if (existing) return existing.id as string;

  const inserted = await supabase
    .from("blog_categories")
    .insert({ name: trimmed, slug })
    .select("id")
    .single();
  if (!inserted.error && inserted.data) return inserted.data.id as string;

  // The insert lost to a concurrent caller, so this read is the answer: their
  // row. A failed read here returned null, which the caller stores as "no
  // category".
  const retry = await unwrapOrThrow(
    supabase
      .from("blog_categories")
      .select("id")
      .eq("slug", slug)
      .maybeSingle(),
    "the category a concurrent caller created first",
  );
  return (retry?.id as string) ?? null;
}

/** Resolve tag names to ids, creating any that do not exist. */
export async function findOrCreateTags(names: string[]): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const ids: string[] = [];

  for (const name of normalizeNames(names)) {
    const slug = slugify(name);
    if (!slug) continue;

    // Same as the category pair above: a failed read falls through to an
    // insert the unique constraint refuses, and the retry then returns null,
    // so the post is saved without this tag (#847).
    const existing = await unwrapOrThrow(
      supabase.from("blog_tags").select("id").eq("slug", slug).maybeSingle(),
      "an existing tag with this slug",
    );
    if (existing) {
      ids.push(existing.id as string);
      continue;
    }

    const inserted = await supabase
      .from("blog_tags")
      .insert({ name, slug })
      .select("id")
      .single();
    if (!inserted.error && inserted.data) {
      ids.push(inserted.data.id as string);
      continue;
    }

    const retry = await unwrapOrThrow(
      supabase.from("blog_tags").select("id").eq("slug", slug).maybeSingle(),
      "the tag a concurrent caller created first",
    );
    if (retry) ids.push(retry.id as string);
  }

  return ids;
}

/** Replace a post's tag links with exactly the given set. */
export async function syncPostTags(
  postId: string,
  tagIds: string[],
): Promise<void> {
  const supabase = createServiceRoleClient();
  // Checked: this clears the post's existing tags before the new set is
  // written, so an unchecked failure leaves the old tags in place and the post
  // ends up carrying both (#847).
  await assertNoWriteError(
    supabase.from("blog_post_tags").delete().eq("post_id", postId),
    "the removal of a post's existing tags",
  );
  if (tagIds.length === 0) return;
  const rows = tagIds.map((tag_id) => ({ post_id: postId, tag_id }));
  const { error } = await supabase.from("blog_post_tags").insert(rows);
  if (error) console.error("[blog] syncPostTags failed:", error.message);
}
