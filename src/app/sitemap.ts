import type { MetadataRoute } from "next";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { applyVisibleNurseFilter } from "@/lib/nurses/visibility";
import { getIndexableTaxonomy } from "@/lib/blog/queries";

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

  let nurseEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceRoleClient();
    const nurseQuery = supabase
      .from("nurse_profiles")
      .select(
        `
        slug,
        updated_at,
        users!inner ( is_deleted, is_suspended )
      `,
      );
    const { data } = await applyVisibleNurseFilter(nurseQuery);

    type Row = {
      slug: string;
      updated_at: string;
      users: { is_deleted: boolean; is_suspended: boolean } | null;
    };

    nurseEntries = ((data ?? []) as unknown as Row[])
      .filter((r) => r.users && !r.users.is_deleted && !r.users.is_suspended)
      .map((r) => ({
        url: `${BASE_URL}/nurses/${r.slug}`,
        lastModified: new Date(r.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
  } catch (err) {
    // Sitemap requests should never break; if Supabase is unreachable,
    // ship just the static entries.
    console.error("[sitemap] failed to fetch nurse profiles:", err);
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
