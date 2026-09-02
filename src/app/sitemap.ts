import type { MetadataRoute } from "next";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
import { getIndexableTaxonomy } from "@/lib/blog/queries";
import { readAllRows } from "@/lib/blog/read-all-rows";

/**
 * A sitemap file may hold 50,000 URLs. Past that it is invalid and the
 * overflow is ignored, so the moment to split into a sitemap index is before
 * that arrives, not after. Reported at 90% because the remedy is a code change
 * (generateSitemaps), which needs notice (#442).
 */
const SITEMAP_URL_LIMIT = 50_000;
const SITEMAP_URL_WARNING = SITEMAP_URL_LIMIT * 0.9;

// Refresh at most hourly so scheduled publishes and taxonomy changes reach
// the sitemap without a deploy. Post mutations also revalidate it explicitly
// (see revalidateBlog) for an immediate update.
export const revalidate = 3600;

const BASE_URL = "https://nursedex.com";

const STATIC_PAGES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 0.9 },
  { path: "/nurses", changeFrequency: "daily", priority: 0.9 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.7 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/attributions", changeFrequency: "yearly", priority: 0.2 },
  { path: "/survey", changeFrequency: "monthly", priority: 0.6 },
];

/**
 * Dynamic sitemap. Static marketing pages are listed inline with
 * sensible change frequencies; verified nurse profiles are pulled
 * fresh on every request via the service-role client (bypasses RLS so
 * we don't need a logged-in viewer for the index). Soft-deleted and
 * suspended users are excluded. Public sitemaps don't need RLS.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${BASE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  type Row = {
    slug: string;
    updated_at: string;
    users: { is_deleted: boolean; is_suspended: boolean } | null;
  };

  let nurseEntries: MetadataRoute.Sitemap = [];
  // Read from the query's own count on the first page, so the file limit is
  // judged even on a run whose read then fails: the size of the marketplace is
  // knowable there, and it is the thing being judged.
  let reportedNurseTotal: number | null = null;

  try {
    const supabase = createServiceRoleClient();

    // Paged and completeness-checked (#442). This was a single unbounded
    // select, which PostgREST caps: past that cap it returned a healthy
    // looking PREFIX with no error, and every nurse after it silently stopped
    // being told to search engines. Nothing would have failed, the file would
    // just have been smaller and wrong.
    const rows = await readAllRows<Row>(
      async (from, to) => {
        const nurseQuery = supabase
          .from("nurse_profiles")
          .select(
            `
        slug,
        updated_at,
        users!inner ( is_deleted, is_suspended )
      `,
            { count: "exact" },
          )
          .range(from, to);

        const { data, error, count } = await applyVisibleNurseFilter(nurseQuery);
        if (error) throw new Error(error.message);
        if (reportedNurseTotal === null) reportedNurseTotal = count;
        return { rows: (data ?? []) as unknown as Row[], total: count };
      },
      1000,
      "a short read would quietly drop every nurse after the cap out of the sitemap, and out of search",
    );

    nurseEntries = rows
      .filter((r) => r.users && !r.users.is_deleted && !r.users.is_suspended)
      .map((r) => ({
        url: `${BASE_URL}/nurses/${r.slug}`,
        lastModified: new Date(r.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
  } catch (err) {
    // Sitemap requests should never break, so the static entries still ship.
    // The profiles are left out ENTIRELY rather than published as a prefix: a
    // partial list looks like a complete one to a search engine, and would
    // deindex whoever fell off the end (L10).
    console.error("[sitemap] failed to fetch nurse profiles:", err);
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { action: "sitemap" },
    });
  }

  if (reportedNurseTotal !== null && reportedNurseTotal >= SITEMAP_URL_WARNING) {
    // One file cannot hold them all for much longer, and the failure past the
    // limit is silent: the file is simply invalid and the overflow ignored.
    // Said while there is still room to act.
    Sentry.captureMessage(
      `The sitemap is approaching the ${SITEMAP_URL_LIMIT} URL per file limit ` +
        `(${reportedNurseTotal} nurse profiles). It needs splitting into a ` +
        "sitemap index with generateSitemaps before it gets there.",
      { level: "warning", tags: { action: "sitemap" } },
    );
  }

  let blogEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("blog_posts")
      .select("slug, updated_at")
      .eq("status", "published");

    type BlogRow = { slug: string; updated_at: string };
    blogEntries = ((data ?? []) as BlogRow[]).map((r) => ({
      url: `${BASE_URL}/blog/${r.slug}`,
      lastModified: new Date(r.updated_at),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.error("[sitemap] failed to fetch blog posts:", err);
  }

  let taxonomyEntries: MetadataRoute.Sitemap = [];
  try {
    // Only taxonomy with at least one published post (no thin archives).
    const { categories, tags } = await getIndexableTaxonomy();

    const catEntries: MetadataRoute.Sitemap = categories.map((c) => ({
      url: `${BASE_URL}/blog/category/${c.slug}`,
      lastModified: new Date(c.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.4,
    }));
    const tagEntries: MetadataRoute.Sitemap = tags.map((t) => ({
      url: `${BASE_URL}/blog/tag/${t.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.3,
    }));
    taxonomyEntries = [...catEntries, ...tagEntries];
  } catch (err) {
    console.error("[sitemap] failed to fetch blog taxonomy:", err);
  }

  let authorEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("blog_posts")
      .select("author_id")
      .eq("status", "published")
      .not("author_id", "is", null);
    const ids = [
      ...new Set(
        ((data ?? []) as { author_id: string | null }[])
          .map((r) => r.author_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    authorEntries = ids.map((id) => ({
      url: `${BASE_URL}/blog/author/${id}`,
      changeFrequency: "weekly" as const,
      priority: 0.3,
    }));
  } catch (err) {
    console.error("[sitemap] failed to fetch blog authors:", err);
  }

  return [
    ...staticEntries,
    ...nurseEntries,
    ...blogEntries,
    ...taxonomyEntries,
    ...authorEntries,
  ];
}
