import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { slugify } from "./slugify";

import { unwrapOrThrow } from "@/lib/db/results";
// Re-exported so existing server-side importers keep working; client code
// should import from "./slugify" directly to avoid the service-role taint.
export { slugify };

/**
 * Produce a slug for a post title that is unique across blog_posts.
 *
 * Uses the service-role client for the duplicate lookup so it sees every
 * row regardless of status or RLS (the public-read policy hides drafts,
 * so a plain client would miss collisions). The DB UNIQUE constraint is
 * the real backstop; this only avoids a predictable collision. When
 * editing an existing post, pass excludeId so it does not collide with
 * itself.
 *
 * See memory: slug uniqueness RLS blind spot (PR #141).
 */
export async function ensureUniqueSlug(
  title: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(title) || "post";
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("blog_posts")
    .select("slug")
    .like("slug", `${base}%`);
  if (excludeId) query = query.neq("id", excludeId);

  // A failed read is NOT "no slug starts with this base" (#847). It would hand
  // back the bare base as available, and the insert that follows then loses to
  // the unique constraint on a slug that is genuinely taken.
  const data = await unwrapOrThrow(query, "the slugs already near this one");
  const taken = new Set((data ?? []).map((r) => r.slug as string));

  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
