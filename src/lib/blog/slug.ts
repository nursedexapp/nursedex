import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Turn a title into a URL slug. Pure string transform, no IO, so it is
 * unit testable on its own. Decomposes accented characters and drops the
 * combining marks (so "café" becomes "cafe", not "cafe-"), lowercases,
 * replaces any run of non alphanumeric characters with a single hyphen,
 * and trims hyphens from the ends.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

  const { data } = await query;
  const taken = new Set((data ?? []).map((r) => r.slug as string));

  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
