import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type TaxonomyKind = "category" | "tag";

const TABLE: Record<TaxonomyKind, string> = {
  category: "blog_categories",
  tag: "blog_tags",
};

/**
 * Record that a taxonomy slug changed (old -> new) so old archive URLs keep
 * working. No-op when unchanged. Collapses chains (X -> oldSlug becomes
 * X -> newSlug) so a lookup is always a single hop. Mirrors
 * saveBlogSlugRedirect for posts.
 */
export async function saveTaxonomyRedirect(
  kind: TaxonomyKind,
  oldSlug: string,
  newSlug: string,
): Promise<void> {
  if (!oldSlug || oldSlug === newSlug) return;
  const supabase = createServiceRoleClient();

  await supabase
    .from("blog_taxonomy_redirects")
    .update({ new_slug: newSlug })
    .eq("kind", kind)
    .eq("new_slug", oldSlug);

  const { error } = await supabase.from("blog_taxonomy_redirects").upsert(
    { kind, old_slug: oldSlug, new_slug: newSlug },
    { onConflict: "kind,old_slug" },
  );
  if (error) {
    console.error("[blog] saveTaxonomyRedirect failed:", error.message);
  }
}

/**
 * The current slug an old taxonomy slug redirects to, but only when that
 * target still resolves to an existing category/tag (so we never redirect a
 * reader to a 404). Null if there is no redirect or the target is gone.
 */
export async function getLiveTaxonomyRedirect(
  kind: TaxonomyKind,
  oldSlug: string,
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("blog_taxonomy_redirects")
    .select("new_slug")
    .eq("kind", kind)
    .eq("old_slug", oldSlug)
    .maybeSingle();
  const newSlug = (data?.new_slug as string | undefined) ?? null;
  if (!newSlug) return null;

  const { data: target } = await supabase
    .from(TABLE[kind])
    .select("slug")
    .eq("slug", newSlug)
    .maybeSingle();
  return target ? newSlug : null;
}
