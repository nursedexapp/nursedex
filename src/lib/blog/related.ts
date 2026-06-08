import type { BlogPost } from "@/types/database";

interface SelectOpts {
  selfId: string;
  categoryId: string | null;
  limit: number;
}

/**
 * Pick related posts for a post. Ranks candidates that share tags highest
 * (more shared tags first, then more recent), then fills any remaining
 * slots from recent posts, preferring the same category. Excludes the post
 * itself and never repeats a post. Pure, so it is unit testable.
 *
 * `tagMatches` is the flattened list of posts reached through a shared tag:
 * a post that shares N tags appears N times, which is how its score is
 * counted. `recentPosts` is a recency-ordered fallback pool.
 */
export function selectRelatedPosts(
  tagMatches: BlogPost[],
  recentPosts: BlogPost[],
  { selfId, categoryId, limit }: SelectOpts,
): BlogPost[] {
  const scored = new Map<string, { post: BlogPost; count: number }>();
  for (const post of tagMatches) {
    if (!post || post.id === selfId) continue;
    const entry = scored.get(post.id) ?? { post, count: 0 };
    entry.count += 1;
    scored.set(post.id, entry);
  }

  const bySharedTags = [...scored.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        (b.post.publish_at ?? "").localeCompare(a.post.publish_at ?? ""),
    )
    .map((e) => e.post);

  const chosen: BlogPost[] = [];
  const seen = new Set<string>([selfId]);
  const take = (post: BlogPost) => {
    if (chosen.length >= limit || seen.has(post.id)) return;
    chosen.push(post);
    seen.add(post.id);
  };

  bySharedTags.forEach(take);

  if (chosen.length < limit) {
    const sameCategory = recentPosts.filter(
      (p) => categoryId !== null && p.category_id === categoryId,
    );
    const rest = recentPosts.filter(
      (p) => !(categoryId !== null && p.category_id === categoryId),
    );
    [...sameCategory, ...rest].forEach(take);
  }

  return chosen;
}
