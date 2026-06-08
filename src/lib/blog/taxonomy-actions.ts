"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/helpers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { slugify } from "./slug";
import { tagRelinkPostIds } from "./taxonomy";
import { saveTaxonomyRedirect } from "./taxonomy-redirects";

export interface TaxonomyResult {
  success: boolean;
  error?: "invalid" | "duplicate" | "unknown";
}

const TABLE = {
  category: "blog_categories",
  tag: "blog_tags",
} as const;

type Kind = keyof typeof TABLE;

function revalidate() {
  // Covers the index (chips), every archive, and the manager.
  revalidatePath("/blog", "layout");
  revalidatePath("/admin/blog/taxonomy");
}

/** Rename a category or tag (regenerating its slug). */
async function rename(kind: Kind, id: string, name: string): Promise<TaxonomyResult> {
  await requireAdmin();
  const trimmed = name.trim();
  const slug = slugify(trimmed);
  if (!trimmed || !slug) return { success: false, error: "invalid" };

  const supabase = createServiceRoleClient();
  const { data: clash } = await supabase
    .from(TABLE[kind])
    .select("id")
    .eq("slug", slug)
    .neq("id", id)
    .maybeSingle();
  if (clash) return { success: false, error: "duplicate" };

  // Remember the old slug so we can record a redirect if it changes.
  const { data: before } = await supabase
    .from(TABLE[kind])
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  const oldSlug = (before as { slug: string } | null)?.slug;

  const { error } = await supabase
    .from(TABLE[kind])
    .update({ name: trimmed, slug })
    .eq("id", id);
  if (error) {
    console.error(`[blog] rename ${kind} failed:`, error.message);
    return { success: false, error: "unknown" };
  }
  if (oldSlug) await saveTaxonomyRedirect(kind, oldSlug, slug);
  revalidate();
  return { success: true };
}

export async function renameCategory(id: string, name: string) {
  return rename("category", id, name);
}
export async function renameTag(id: string, name: string) {
  return rename("tag", id, name);
}

/**
 * Delete a category or tag. The FKs handle cleanup: a deleted category sets
 * its posts' category_id to null; a deleted tag cascades its post links.
 */
async function remove(kind: Kind, id: string): Promise<TaxonomyResult> {
  await requireAdmin();
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from(TABLE[kind]).delete().eq("id", id);
  if (error) {
    console.error(`[blog] delete ${kind} failed:`, error.message);
    return { success: false, error: "unknown" };
  }
  revalidate();
  return { success: true };
}

export async function deleteCategory(id: string) {
  return remove("category", id);
}
export async function deleteTag(id: string) {
  return remove("tag", id);
}

/** Merge category `sourceId` into `targetId`: repoint posts, drop the source. */
export async function mergeCategory(
  sourceId: string,
  targetId: string,
): Promise<TaxonomyResult> {
  await requireAdmin();
  if (sourceId === targetId) return { success: false, error: "invalid" };
  const supabase = createServiceRoleClient();

  const { data: rows } = await supabase
    .from("blog_categories")
    .select("id, slug")
    .in("id", [sourceId, targetId]);
  const slugs = (rows ?? []) as { id: string; slug: string }[];
  const sourceSlug = slugs.find((s) => s.id === sourceId)?.slug;
  const targetSlug = slugs.find((s) => s.id === targetId)?.slug;

  const { error: upErr } = await supabase
    .from("blog_posts")
    .update({ category_id: targetId })
    .eq("category_id", sourceId);
  if (upErr) {
    console.error("[blog] mergeCategory repoint failed:", upErr.message);
    return { success: false, error: "unknown" };
  }
  await supabase.from("blog_categories").delete().eq("id", sourceId);
  if (sourceSlug && targetSlug) {
    await saveTaxonomyRedirect("category", sourceSlug, targetSlug);
  }
  revalidate();
  return { success: true };
}

/** Merge tag `sourceId` into `targetId`: relink posts (no dupes), drop source. */
export async function mergeTag(
  sourceId: string,
  targetId: string,
): Promise<TaxonomyResult> {
  await requireAdmin();
  if (sourceId === targetId) return { success: false, error: "invalid" };
  const supabase = createServiceRoleClient();

  const { data: tagRows } = await supabase
    .from("blog_tags")
    .select("id, slug")
    .in("id", [sourceId, targetId]);
  const tagSlugs = (tagRows ?? []) as { id: string; slug: string }[];
  const sourceSlug = tagSlugs.find((s) => s.id === sourceId)?.slug;
  const targetSlug = tagSlugs.find((s) => s.id === targetId)?.slug;

  const [src, tgt] = await Promise.all([
    supabase.from("blog_post_tags").select("post_id").eq("tag_id", sourceId),
    supabase.from("blog_post_tags").select("post_id").eq("tag_id", targetId),
  ]);
  const toAdd = tagRelinkPostIds(
    ((src.data ?? []) as { post_id: string }[]).map((r) => r.post_id),
    ((tgt.data ?? []) as { post_id: string }[]).map((r) => r.post_id),
  );
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("blog_post_tags")
      .insert(toAdd.map((post_id) => ({ post_id, tag_id: targetId })));
    if (error) {
      console.error("[blog] mergeTag relink failed:", error.message);
      return { success: false, error: "unknown" };
    }
  }
  // Deleting the source tag cascades its now-redundant post links.
  await supabase.from("blog_tags").delete().eq("id", sourceId);
  if (sourceSlug && targetSlug) {
    await saveTaxonomyRedirect("tag", sourceSlug, targetSlug);
  }
  revalidate();
  return { success: true };
}
