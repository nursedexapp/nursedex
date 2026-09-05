"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/helpers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { slugify } from "./slug";
import { tagRelinkPostIds } from "./taxonomy";
import { saveTaxonomyRedirect } from "./taxonomy-redirects";

import { toTypedFailure } from "@/lib/db/results";
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
  // Renames/merges change which archive URLs the sitemap lists.
  revalidatePath("/sitemap.xml");
}

/** Rename a category or tag (regenerating its slug). */
async function rename(
  kind: Kind,
  id: string,
  name: string,
): Promise<TaxonomyResult> {
  await requireAdmin();
  const trimmed = name.trim();
  const slug = slugify(trimmed);
  if (!trimmed || !slug) return { success: false, error: "invalid" };

  const supabase = createServiceRoleClient();
  const clashRead = await toTypedFailure(
    supabase
      .from(TABLE[kind])
      .select("id")
      .eq("slug", slug)
      .neq("id", id)
      .maybeSingle(),
    "the database (rename)",
  );
  if (!clashRead.ok) return { success: false, error: "unknown" };
  const clash = clashRead.data;
  if (clash) return { success: false, error: "duplicate" };

  // Remember the old slug so we can record a redirect if it changes.
  const beforeRead = await toTypedFailure(
    supabase.from(TABLE[kind]).select("slug").eq("id", id).maybeSingle(),
    "the database (rename)",
  );
  if (!beforeRead.ok) return { success: false, error: "unknown" };
  const before = beforeRead.data;
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

  const rowsRead = await toTypedFailure(
    supabase
      .from("blog_categories")
      .select("id, slug")
      .in("id", [sourceId, targetId]),
    "blog_categories (mergeCategory)",
  );
  if (!rowsRead.ok) return { success: false, error: "unknown" };
  const rows = rowsRead.data;
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
  // Checked: the posts have already been repointed at the target above, so an
  // unchecked failure here leaves the source category standing with nothing in
  // it, and the merge reports success (#847).
  const deleteSource = await toTypedFailure(
    supabase.from("blog_categories").delete().eq("id", sourceId),
    "the removal of the merged category",
  );
  if (!deleteSource.ok) return { success: false, error: "unknown" };
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

  const tagRowsRead = await toTypedFailure(
    supabase
      .from("blog_tags")
      .select("id, slug")
      .in("id", [sourceId, targetId]),
    "blog_tags (mergeTag)",
  );
  if (!tagRowsRead.ok) return { success: false, error: "unknown" };
  const tagRows = tagRowsRead.data;
  const tagSlugs = (tagRows ?? []) as { id: string; slug: string }[];
  const sourceSlug = tagSlugs.find((s) => s.id === sourceId)?.slug;
  const targetSlug = tagSlugs.find((s) => s.id === targetId)?.slug;

  // Wrapped INSIDE the Promise.all: an element of one has no destructuring for
  // any rule to inspect, and `?? []` below reads a failed read as "this tag is
  // on no posts", which would silently drop every post the source tag carried
  // rather than relinking it to the target (#847, #991).
  const [src, tgt] = await Promise.all([
    toTypedFailure(
      supabase.from("blog_post_tags").select("post_id").eq("tag_id", sourceId),
      "the posts carrying the tag being merged away",
    ),
    toTypedFailure(
      supabase.from("blog_post_tags").select("post_id").eq("tag_id", targetId),
      "the posts already carrying the target tag",
    ),
  ]);
  if (!src.ok || !tgt.ok) return { success: false, error: "unknown" };
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
  // Checked: the posts have already been repointed at the target above, so an
  // unchecked failure here leaves the source tag standing with nothing in
  // it, and the merge reports success (#847).
  const deleteSource = await toTypedFailure(
    supabase.from("blog_tags").delete().eq("id", sourceId),
    "the removal of the merged tag",
  );
  if (!deleteSource.ok) return { success: false, error: "unknown" };
  if (sourceSlug && targetSlug) {
    await saveTaxonomyRedirect("tag", sourceSlug, targetSlug);
  }
  revalidate();
  return { success: true };
}
