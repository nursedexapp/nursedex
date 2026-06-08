import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { BlogPost } from "@/types/database";
import { authorDisplayName } from "./author";

/**
 * Display name for a post's author, or null if there is no author (the FK
 * is ON DELETE SET NULL) or no usable name. Read with the service-role
 * client so a public, sessionless request can resolve it, the same way the
 * post itself is fetched. We query the author separately rather than
 * embedding to avoid PostgREST relationship-detection surprises.
 */
export async function getAuthorName(
  authorId: string | null,
): Promise<string | null> {
  if (!authorId) return null;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("users")
    .select("first_name, last_name")
    .eq("id", authorId)
    .maybeSingle();

  if (error) {
    console.error("[blog] getAuthorName failed:", error.message);
    return null;
  }
  return authorDisplayName(
    data as { first_name: string | null; last_name: string | null } | null,
  );
}

/** Default number of posts shown per page on the public blog index. */
export const BLOG_PAGE_SIZE = 9;

export interface PublishedPostsPage {
  posts: BlogPost[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * One page of published posts, newest first. Mirrors the public nurse
 * index and sitemap: reads with the service-role client (no viewer
 * session required) and filters to published rows in the query. The RLS
 * public-read policy is the backstop, but filtering here keeps drafts and
 * scheduled posts out regardless. `page` is 1 based and clamped to >= 1;
 * `total` is the full published count (not just this page) so callers can
 * render page navigation.
 */
export async function getPublishedPostsPage(
  page: number,
  pageSize: number = BLOG_PAGE_SIZE,
): Promise<PublishedPostsPage> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = createServiceRoleClient();
  const { data, error, count } = await supabase
    .from("blog_posts")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .order("publish_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[blog] getPublishedPostsPage failed:", error.message);
    return { posts: [], total: 0, page: safePage, pageSize, totalPages: 0 };
  }

  const total = count ?? 0;
  return {
    posts: (data ?? []) as BlogPost[],
    total,
    page: safePage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** A single published post by slug, or null if not found / not published. */
export async function getPublishedPostBySlug(
  slug: string,
): Promise<BlogPost | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("[blog] getPublishedPostBySlug failed:", error.message);
    return null;
  }
  return (data as BlogPost | null) ?? null;
}

/**
 * Every post for the admin list (all statuses), newest first. Uses the
 * user client so RLS enforces admin-only access; the /admin layout has
 * already gated the route with requireAdmin().
 */
export async function getAllPostsForAdmin(): Promise<BlogPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[blog] getAllPostsForAdmin failed:", error.message);
    return [];
  }
  return (data ?? []) as BlogPost[];
}

/** A single post by id for the admin editor (any status). */
export async function getPostById(id: string): Promise<BlogPost | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[blog] getPostById failed:", error.message);
    return null;
  }
  return (data as BlogPost | null) ?? null;
}
