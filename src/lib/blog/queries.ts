import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { BlogPost } from "@/types/database";

/**
 * Public list of published posts, newest first. Mirrors the public nurse
 * index and sitemap: reads with the service-role client (no viewer
 * session required) and filters to published rows in the query. The RLS
 * public-read policy is the backstop, but filtering here keeps drafts and
 * scheduled posts out regardless.
 */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("status", "published")
    .order("publish_at", { ascending: false });

  if (error) {
    console.error("[blog] getPublishedPosts failed:", error.message);
    return [];
  }
  return (data ?? []) as BlogPost[];
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
