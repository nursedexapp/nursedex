import "server-only";

/**
 * Parse the rows from a PostHog HogQL query (each row is [post_id, count])
 * into a post_id -> view count map. Pure, so it is unit testable; tolerant
 * of unexpected shapes.
 */
export function parseViewRows(results: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(results)) return out;
  for (const row of results) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const [postId, count] = row;
    if (typeof postId === "string" && typeof count === "number") {
      out[postId] = count;
    }
  }
  return out;
}

/**
 * Per-post view counts from PostHog's blog_post_viewed events, as a
 * post_id -> count map. Requires a PostHog personal API key + project id
 * (POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID, optional POSTHOG_API_HOST);
 * returns {} when unconfigured or on any error, so the admin page degrades
 * gracefully. Cached for 5 minutes.
 */
export async function getBlogPostViews(): Promise<Record<string, number>> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const host = process.env.POSTHOG_API_HOST ?? "https://us.posthog.com";
  if (!apiKey || !projectId) return {};

  try {
    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query:
            "SELECT properties.post_id AS post_id, count() AS views " +
            "FROM events WHERE event = 'blog_post_viewed' " +
            "AND properties.post_id IS NOT NULL GROUP BY post_id",
        },
      }),
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      console.error("[analytics] post views query failed:", res.status);
      return {};
    }
    const data = (await res.json()) as { results?: unknown };
    return parseViewRows(data.results);
  } catch (err) {
    console.error("[analytics] post views query error:", err);
    return {};
  }
}
