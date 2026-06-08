import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { slugify } from "./slug";

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
  const existing = await supabase
    .from("blog_categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing.data) return existing.data.id as string;

  const inserted = await supabase
    .from("blog_categories")
    .insert({ name: trimmed, slug })
    .select("id")
    .single();
  if (!inserted.error && inserted.data) return inserted.data.id as string;

  const retry = await supabase
    .from("blog_categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return (retry.data?.id as string) ?? null;
}

/** Resolve tag names to ids, creating any that do not exist. */
export async function findOrCreateTags(names: string[]): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const ids: string[] = [];

  for (const name of normalizeNames(names)) {
    const slug = slugify(name);
    if (!slug) continue;

    const existing = await supabase
      .from("blog_tags")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing.data) {
      ids.push(existing.data.id as string);
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

    const retry = await supabase
      .from("blog_tags")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (retry.data) ids.push(retry.data.id as string);
  }

  return ids;
}

/** Replace a post's tag links with exactly the given set. */
export async function syncPostTags(
  postId: string,
  tagIds: string[],
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("blog_post_tags").delete().eq("post_id", postId);
  if (tagIds.length === 0) return;
  const rows = tagIds.map((tag_id) => ({ post_id: postId, tag_id }));
  const { error } = await supabase.from("blog_post_tags").insert(rows);
  if (error) console.error("[blog] syncPostTags failed:", error.message);
}
