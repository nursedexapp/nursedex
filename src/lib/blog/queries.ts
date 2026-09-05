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

import { unwrapOrThrow } from "@/lib/db/results";
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
  const data = await unwrapOrThrow(
    supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", authorId)
      .maybeSingle(),
    "the author of a blog post",
  );
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
  const pageResult = await supabase
    .from("blog_posts")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .order("pinned", { ascending: false })
    .order("publish_at", { ascending: false })
    .range(from, to);
  // Both halves come off one result, so it is held and handed to the
  // helper rather than destructured (#1000).
  const data = await unwrapOrThrow(
    pageResult,
    "one page of the published blog posts",
  );
  const count = pageResult.count;

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
  const pageResult = await supabase
    .from("blog_posts")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .textSearch("search_vector", query, {
      type: "websearch",
      config: "english",
    })
    .order("publish_at", { ascending: false })
    .range(from, from + pageSize - 1);
  // Both halves come off one result, so it is held and handed to the
  // helper rather than destructured (#1000).
  const data = await unwrapOrThrow(
    pageResult,
    "one page of blog search results",
  );
  const count = pageResult.count;

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
  const data = await unwrapOrThrow(
    supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle(),
    "the published blog post at this slug",
  );
  return (data as BlogPost | null) ?? null;
}

/**
 * Every post for the admin list (all statuses), newest first. Uses the
 * user client so RLS enforces admin-only access; the /admin layout has
 * already gated the route with requireAdmin().
 */
export async function getAllPostsForAdmin(): Promise<BlogPost[]> {
  const supabase = await createClient();
  const data = await unwrapOrThrow(
    supabase
      .from("blog_posts")
      .select("*")
      .order("updated_at", { ascending: false }),
    "every blog post, for the admin list",
  );
  return (data ?? []) as BlogPost[];
}

/** A single post by id for the admin editor (any status). */
export async function getPostById(id: string): Promise<BlogPost | null> {
  const supabase = await createClient();
  const data = await unwrapOrThrow(
    supabase.from("blog_posts").select("*").eq("id", id).maybeSingle(),
    "the blog post being edited",
  );
  return (data as BlogPost | null) ?? null;
}

// ─── Taxonomy reads ─────────────────────────────────────────

/** All categories, alphabetical. Service role: public, sessionless read. */
export async function getCategories(): Promise<BlogCategory[]> {
  const supabase = createServiceRoleClient();
  const data = await unwrapOrThrow(
    supabase.from("blog_categories").select("*").order("name"),
    "the blog categories",
  );
  return (data ?? []) as BlogCategory[];
}

/** All tags, alphabetical. */
export async function getTags(): Promise<BlogTag[]> {
  const supabase = createServiceRoleClient();
  const data = await unwrapOrThrow(
    supabase.from("blog_tags").select("*").order("name"),
    "the blog tags",
  );
  return (data ?? []) as BlogTag[];
}

export interface CategoryWithCount extends BlogCategory {
  postCount: number;
}
export interface TagWithCount extends BlogTag {
  postCount: number;
}

/**
 * Categories and tags with how many posts (any status) use each, for the
 * admin taxonomy manager. Counts are tallied from two bulk reads rather
 * than a query per row.
 */
export async function getTaxonomyForAdmin(): Promise<{
  categories: CategoryWithCount[];
  tags: TagWithCount[];
}> {
  const supabase = createServiceRoleClient();
  // Wrapped inside the Promise.all: an element of one has no destructuring for
  // any rule to inspect (#847, #991). Each `?? []` below reads a failed query
  // as an empty list, so the admin taxonomy screen showed no categories, no
  // tags, and a post count of zero against every one that survived.
  const [catsRes, tagsRes, postCats, postTags] = await Promise.all([
    unwrapOrThrow(
      supabase.from("blog_categories").select("*").order("name"),
      "the blog categories",
    ),
    unwrapOrThrow(
      supabase.from("blog_tags").select("*").order("name"),
      "the blog tags",
    ),
    unwrapOrThrow(
      supabase.from("blog_posts").select("category_id"),
      "the category of every blog post",
    ),
    unwrapOrThrow(
      supabase.from("blog_post_tags").select("tag_id"),
      "the tags on every blog post",
    ),
  ]);

  const catCount = new Map<string, number>();
  for (const r of (postCats ?? []) as { category_id: string | null }[]) {
    if (r.category_id)
      catCount.set(r.category_id, (catCount.get(r.category_id) ?? 0) + 1);
  }
  const tagCount = new Map<string, number>();
  for (const r of (postTags ?? []) as { tag_id: string }[]) {
    tagCount.set(r.tag_id, (tagCount.get(r.tag_id) ?? 0) + 1);
  }

  const categories = ((catsRes ?? []) as BlogCategory[]).map((c) => ({
    ...c,
    postCount: catCount.get(c.id) ?? 0,
  }));
  const tags = ((tagsRes ?? []) as BlogTag[]).map((t) => ({
    ...t,
    postCount: tagCount.get(t.id) ?? 0,
  }));
  return { categories, tags };
}

/**
 * Categories and tags that have at least one published post. Used by the
 * sitemap so empty/draft-only archives (thin pages) are not listed.
 */
export async function getIndexableTaxonomy(): Promise<{
  categories: { slug: string; updated_at: string }[];
  tags: { slug: string }[];
}> {
  const supabase = createServiceRoleClient();

  const posts = await unwrapOrThrow(
    supabase
      .from("blog_posts")
      .select("id, category_id")
      .eq("status", "published"),
    "blog_posts (getIndexableTaxonomy)",
  );
  const pub = (posts ?? []) as { id: string; category_id: string | null }[];
  const catIds = [
    ...new Set(
      pub.map((p) => p.category_id).filter((id): id is string => !!id),
    ),
  ];
  const postIds = pub.map((p) => p.id);

  let tagIds: string[] = [];
  if (postIds.length > 0) {
    const pt = await unwrapOrThrow(
      supabase.from("blog_post_tags").select("tag_id").in("post_id", postIds),
      "blog_post_tags (getIndexableTaxonomy)",
    );
    tagIds = [
      ...new Set(((pt ?? []) as { tag_id: string }[]).map((r) => r.tag_id)),
    ];
  }

  const categories: { slug: string; updated_at: string }[] = [];
  if (catIds.length > 0) {
    const cats = await unwrapOrThrow(
      supabase
        .from("blog_categories")
        .select("slug, updated_at")
        .in("id", catIds),
      "blog_categories (getIndexableTaxonomy)",
    );
    categories.push(
      ...((cats ?? []) as { slug: string; updated_at: string }[]),
    );
  }

  const tags: { slug: string }[] = [];
  if (tagIds.length > 0) {
    const tg = await unwrapOrThrow(
      supabase.from("blog_tags").select("slug").in("id", tagIds),
      "blog_tags (getIndexableTaxonomy)",
    );
    tags.push(...((tg ?? []) as { slug: string }[]));
  }

  return { categories, tags };
}

export async function getCategoryById(
  id: string | null,
): Promise<BlogCategory | null> {
  if (!id) return null;
  const supabase = createServiceRoleClient();
  const data = await unwrapOrThrow(
    supabase.from("blog_categories").select("*").eq("id", id).maybeSingle(),
    "blog_categories (getCategoryById)",
  );
  return (data as BlogCategory | null) ?? null;
}

/** Tags attached to a post, alphabetical. */
export async function getTagsForPost(postId: string): Promise<BlogTag[]> {
  const supabase = createServiceRoleClient();
  const data = await unwrapOrThrow(
    supabase
      .from("blog_post_tags")
      .select("blog_tags(*)")
      .eq("post_id", postId),
    "the tags on this blog post",
  );
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

  const pageResult = await supabase
    .from("blog_posts")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .eq("author_id", authorId)
    .order("publish_at", { ascending: false })
    .range(from, from + pageSize - 1);
  // Both halves come off one result, so it is held and handed to the helper
  // rather than destructured: `count ?? 0` below reads a failed count as an
  // empty archive, and an empty archive renders as a 404.
  const data = await unwrapOrThrow(
    pageResult,
    "blog_posts, one page of an author archive",
  );
  const count = pageResult.count;

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
  const category = await unwrapOrThrow(
    supabase.from("blog_categories").select("*").eq("slug", slug).maybeSingle(),
    "blog_categories (getPublishedPostsByCategory)",
  );
  if (!category) return null;

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * pageSize;
  const pageResult = await supabase
    .from("blog_posts")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .eq("category_id", (category as BlogCategory).id)
    .order("publish_at", { ascending: false })
    .range(from, from + pageSize - 1);
  // Both halves come off one result, so it is held and handed to the helper
  // rather than destructured: `count ?? 0` below reads a failed count as an
  // empty archive, and an empty archive renders as a 404.
  const data = await unwrapOrThrow(
    pageResult,
    "blog_posts, one page of a category archive",
  );
  const count = pageResult.count;

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
  const tag = await unwrapOrThrow(
    supabase.from("blog_tags").select("*").eq("slug", slug).maybeSingle(),
    "blog_tags (getPublishedPostsByTag)",
  );
  if (!tag) return null;

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * pageSize;
  const pageResult = await supabase
    .from("blog_posts")
    // !inner makes the join a filter: only posts linked to this tag.
    .select("*, blog_post_tags!inner(tag_id)", { count: "exact" })
    .eq("status", "published")
    .eq("blog_post_tags.tag_id", (tag as BlogTag).id)
    .order("publish_at", { ascending: false })
    .range(from, from + pageSize - 1);
  // Both halves come off one result, so it is held and handed to the helper
  // rather than destructured: `count ?? 0` below reads a failed count as an
  // empty archive, and an empty archive renders as a 404.
  const data = await unwrapOrThrow(
    pageResult,
    "blog_posts, one page of a tag archive",
  );
  const count = pageResult.count;

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
    const data = await unwrapOrThrow(
      supabase
        .from("blog_post_tags")
        .select("blog_posts!inner(*)")
        .in("tag_id", tagIds)
        .eq("blog_posts.status", "published")
        .neq("post_id", post.id),
      "blog_post_tags (getRelatedPosts)",
    );
    tagMatches = ((data ?? []) as unknown as { blog_posts: BlogPost | null }[])
      .map((r) => r.blog_posts)
      .filter((p): p is BlogPost => p !== null);
  }

  // Recency fallback pool (a few extra so de-duping still leaves enough).
  const recent = await unwrapOrThrow(
    supabase
      .from("blog_posts")
      .select("*")
      .eq("status", "published")
      .neq("id", post.id)
      .order("publish_at", { ascending: false })
      .limit(limit + 5),
    "blog_posts (getRelatedPosts)",
  );

  const chosen = selectRelatedPosts(tagMatches, (recent ?? []) as BlogPost[], {
    selfId: post.id,
    categoryId: post.category_id,
    limit,
  });
  return toListItems(chosen);
}
