import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  BlogPost,
  BlogCategory,
  BlogTag,
  BlogPostListItem,
} from "@/types/database";
import { authorDisplayName } from "./author";
import { selectRelatedPosts } from "./related";

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
    .order("pinned", { ascending: false })
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

/**
 * Full text search over published posts (title, excerpt, body), newest
 * first. Uses the generated search_vector column with websearch parsing,
 * so multi-word and quoted queries work. Same shape as the index page so
 * the results reuse the list and pagination.
 */
export async function searchPublishedPosts(
  query: string,
  page: number,
  pageSize: number = BLOG_PAGE_SIZE,
): Promise<PublishedPostsPage> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * pageSize;

  const supabase = createServiceRoleClient();
  const { data, error, count } = await supabase
    .from("blog_posts")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .textSearch("search_vector", query, { type: "websearch", config: "english" })
    .order("publish_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    console.error("[blog] searchPublishedPosts failed:", error.message);
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

// ─── Taxonomy reads ─────────────────────────────────────────

/** All categories, alphabetical. Service role: public, sessionless read. */
export async function getCategories(): Promise<BlogCategory[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("blog_categories")
    .select("*")
    .order("name");
  if (error) {
    console.error("[blog] getCategories failed:", error.message);
    return [];
  }
  return (data ?? []) as BlogCategory[];
}

/** All tags, alphabetical. */
export async function getTags(): Promise<BlogTag[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("blog_tags")
    .select("*")
    .order("name");
  if (error) {
    console.error("[blog] getTags failed:", error.message);
    return [];
  }
  return (data ?? []) as BlogTag[];
}

export async function getCategoryById(
  id: string | null,
): Promise<BlogCategory | null> {
  if (!id) return null;
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("blog_categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as BlogCategory | null) ?? null;
}

/** Tags attached to a post, alphabetical. */
export async function getTagsForPost(postId: string): Promise<BlogTag[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("blog_post_tags")
    .select("blog_tags(*)")
    .eq("post_id", postId);
  if (error) {
    console.error("[blog] getTagsForPost failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as { blog_tags: BlogTag | null }[];
  return rows
    .map((r) => r.blog_tags)
    .filter((t): t is BlogTag => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Archive listings ───────────────────────────────────────

export interface CategoryArchive extends PublishedPostsPage {
  category: BlogCategory;
}

export interface TagArchive extends PublishedPostsPage {
  tag: BlogTag;
}

export interface AuthorArchive extends PublishedPostsPage {
  authorId: string;
  authorName: string | null;
}

/**
 * Published posts by a given author, or null if the author has none (so an
 * arbitrary id does not render an empty page). Author display name is
 * resolved separately, the same way the byline is.
 */
export async function getPublishedPostsByAuthor(
  authorId: string,
  page: number,
  pageSize: number = BLOG_PAGE_SIZE,
): Promise<AuthorArchive | null> {
  const supabase = createServiceRoleClient();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * pageSize;

  const { data, count } = await supabase
    .from("blog_posts")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .eq("author_id", authorId)
    .order("publish_at", { ascending: false })
    .range(from, from + pageSize - 1);

  const total = count ?? 0;
  if (total === 0) return null;

  return {
    authorId,
    authorName: await getAuthorName(authorId),
    posts: (data ?? []) as BlogPost[],
    total,
    page: safePage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Published posts in a category by slug, or null if the category is unknown. */
export async function getPublishedPostsByCategory(
  slug: string,
  page: number,
  pageSize: number = BLOG_PAGE_SIZE,
): Promise<CategoryArchive | null> {
  const supabase = createServiceRoleClient();
  const { data: category } = await supabase
    .from("blog_categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!category) return null;

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * pageSize;
  const { data, count } = await supabase
    .from("blog_posts")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .eq("category_id", (category as BlogCategory).id)
    .order("publish_at", { ascending: false })
    .range(from, from + pageSize - 1);

  const total = count ?? 0;
  return {
    category: category as BlogCategory,
    posts: (data ?? []) as BlogPost[],
    total,
    page: safePage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Published posts with a tag by slug, or null if the tag is unknown. */
export async function getPublishedPostsByTag(
  slug: string,
  page: number,
  pageSize: number = BLOG_PAGE_SIZE,
): Promise<TagArchive | null> {
  const supabase = createServiceRoleClient();
  const { data: tag } = await supabase
    .from("blog_tags")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!tag) return null;

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * pageSize;
  const { data, count } = await supabase
    .from("blog_posts")
    // !inner makes the join a filter: only posts linked to this tag.
    .select("*, blog_post_tags!inner(tag_id)", { count: "exact" })
    .eq("status", "published")
    .eq("blog_post_tags.tag_id", (tag as BlogTag).id)
    .order("publish_at", { ascending: false })
    .range(from, from + pageSize - 1);

  const total = count ?? 0;
  return {
    tag: tag as BlogTag,
    posts: (data ?? []) as unknown as BlogPost[],
    total,
    page: safePage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Map posts to list items hydrated with their category name/slug. */
export async function toListItems(
  posts: BlogPost[],
): Promise<BlogPostListItem[]> {
  if (posts.length === 0) return [];
  const categories = await getCategories();
  const byId = new Map(categories.map((c) => [c.id, c]));
  return posts.map((post) => {
    const cat = post.category_id ? byId.get(post.category_id) : undefined;
    return {
      ...post,
      categoryName: cat?.name ?? null,
      categorySlug: cat?.slug ?? null,
    };
  });
}

/**
 * Up to `limit` related posts for a post: those sharing the most tags
 * first, then recent posts (same category preferred) to fill. Excludes the
 * post itself. The ranking is the pure selectRelatedPosts helper.
 */
export async function getRelatedPosts(
  post: BlogPost,
  limit = 3,
): Promise<BlogPostListItem[]> {
  const supabase = createServiceRoleClient();

  // Posts reached through a shared tag: one row per shared tag, so a post
  // that shares two tags shows up twice and scores higher.
  let tagMatches: BlogPost[] = [];
  const tagIds = (await getTagsForPost(post.id)).map((t) => t.id);
  if (tagIds.length > 0) {
    const { data } = await supabase
      .from("blog_post_tags")
      .select("blog_posts!inner(*)")
      .in("tag_id", tagIds)
      .eq("blog_posts.status", "published")
      .neq("post_id", post.id);
    tagMatches = ((data ?? []) as unknown as { blog_posts: BlogPost | null }[])
      .map((r) => r.blog_posts)
      .filter((p): p is BlogPost => p !== null);
  }

  // Recency fallback pool (a few extra so de-duping still leaves enough).
  const { data: recent } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("status", "published")
    .neq("id", post.id)
    .order("publish_at", { ascending: false })
    .limit(limit + 5);

  const chosen = selectRelatedPosts(tagMatches, (recent ?? []) as BlogPost[], {
    selfId: post.id,
    categoryId: post.category_id,
    limit,
  });
  return toListItems(chosen);
}
