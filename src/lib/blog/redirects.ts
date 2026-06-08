import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Record that a post's slug changed from oldSlug to newSlug so the old URL
 * keeps working. No-op when the slug did not actually change. Uses the
 * service-role client (writes bypass RLS, and old_slug is UNIQUE). To avoid
 * multi-hop chains, any existing redirects that pointed at oldSlug are
 * re-pointed at newSlug.
 */
export async function saveBlogSlugRedirect(
  oldSlug: string,
  newSlug: string,
  postId: string,
): Promise<void> {
  if (!oldSlug || oldSlug === newSlug) return;
  const supabase = createServiceRoleClient();

  // Collapse chains: X -> oldSlug becomes X -> newSlug.
  await supabase
    .from("blog_slug_redirects")
    .update({ new_slug: newSlug })
    .eq("new_slug", oldSlug);

  const { error } = await supabase.from("blog_slug_redirects").upsert(
    { old_slug: oldSlug, new_slug: newSlug, post_id: postId },
    { onConflict: "old_slug" },
  );
  if (error) {
    console.error("[blog] saveBlogSlugRedirect failed:", error.message);
  }
}

/** The current slug an old slug redirects to, or null if there is none. */
export async function getBlogSlugRedirect(
  oldSlug: string,
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("blog_slug_redirects")
    .select("new_slug")
    .eq("old_slug", oldSlug)
    .maybeSingle();
  return (data?.new_slug as string | undefined) ?? null;
}

/**
 * Like getBlogSlugRedirect, but only returns the target when it resolves to
 * a published post. A redirect can point at a slug whose post was later
 * unpublished or archived (deletes cascade the row away, but unpublishing
 * does not), and following it would send the reader to a 404. In that case
 * we return null so the caller can 404 directly instead.
 */
export async function getLiveBlogSlugRedirect(
  oldSlug: string,
): Promise<string | null> {
  const newSlug = await getBlogSlugRedirect(oldSlug);
  if (!newSlug) return null;

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("slug")
    .eq("slug", newSlug)
    .eq("status", "published")
    .maybeSingle();
  return data ? newSlug : null;
}
