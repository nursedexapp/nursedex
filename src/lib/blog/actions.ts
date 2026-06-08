"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  blogPostSchema,
  blogAutosaveSchema,
  blogCategorySchema,
} from "@/lib/schemas/blog";
import { ensureUniqueSlug } from "./slug";
import { collectImagePaths, removeBlogImagePaths } from "./images";
import { extractPlainText, readingTimeFromText } from "./text";
import {
  findOrCreateTags,
  syncPostTags,
  findOrCreateCategory,
} from "./taxonomy";
import { saveBlogSlugRedirect } from "./redirects";
import { snapshotRevision, getRevision } from "./revisions";
import { toDraft, toPublished, toArchived, toScheduled } from "./transitions";
import type { StatusPatch } from "./transitions";
import type { TiptapDoc } from "@/types/database";

export interface BlogActionResult {
  success: boolean;
  error?: string;
  slug?: string;
  id?: string;
  fieldErrors?: Record<string, string>;
}

/** Revalidate every surface a post can appear on. */
function revalidateBlog(slug?: string) {
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/admin/blog");
}

/**
 * Create or update a post. The `intent` field (draft, publish, schedule)
 * decides the status + publish_at via the pure transition helpers. Writes
 * go through the user client so RLS enforces admin-only access; the route
 * is already gated by requireAdmin(), and we re-check here so the action
 * is safe to call on its own.
 */
export async function savePost(raw: unknown): Promise<BlogActionResult> {
  const user = await requireAdmin();

  const parsed = blogPostSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input = parsed.data;

  let patch: StatusPatch;
  if (input.intent === "publish") {
    patch = toPublished(new Date());
  } else if (input.intent === "schedule") {
    const result = toScheduled(input.publish_at || null, new Date());
    if (!result.ok) {
      return {
        success: false,
        error: "invalid",
        fieldErrors: { publish_at: result.error },
      };
    }
    patch = result.patch;
  } else {
    patch = toDraft();
  }

  const slug = await ensureUniqueSlug(input.slug || input.title, input.id);

  const supabase = await createClient();
  const contentText = extractPlainText(input.content as unknown as TiptapDoc);
  const fields = {
    title: input.title,
    slug,
    excerpt: input.excerpt || null,
    content: input.content,
    cover_image_url: input.cover_image_url || null,
    seo_title: input.seo_title || null,
    seo_description: input.seo_description || null,
    category_id: input.category_id || null,
    content_text: contentText,
    reading_time_minutes: readingTimeFromText(contentText),
    status: patch.status,
    publish_at: patch.publish_at,
  };

  let postId: string;
  if (input.id) {
    // Read the current slug/status first so we can record a redirect if a
    // published post's public URL is about to change.
    const { data: prev } = await supabase
      .from("blog_posts")
      .select("slug, status")
      .eq("id", input.id)
      .maybeSingle();

    const { error } = await supabase
      .from("blog_posts")
      .update(fields)
      .eq("id", input.id);
    if (error) {
      console.error("[blog] update failed:", error.message);
      return { success: false, error: "unknown" };
    }
    postId = input.id;

    const prevSlug = (prev as { slug: string; status: string } | null)?.slug;
    const wasPublished =
      (prev as { status: string } | null)?.status === "published";
    if (wasPublished && prevSlug && prevSlug !== slug) {
      await saveBlogSlugRedirect(prevSlug, slug, postId);
      revalidatePath(`/blog/${prevSlug}`);
    }
  } else {
    const { data, error } = await supabase
      .from("blog_posts")
      .insert({ ...fields, author_id: user.id })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[blog] insert failed:", error?.message);
      return { success: false, error: "unknown" };
    }
    postId = data.id as string;
  }

  const tagIds = await findOrCreateTags(input.tags ?? []);
  await syncPostTags(postId, tagIds);

  // Snapshot this saved version so it can be viewed/restored later.
  await snapshotRevision(
    postId,
    {
      title: input.title,
      excerpt: input.excerpt || null,
      content: input.content as unknown as TiptapDoc,
    },
    user.id,
  );

  revalidateBlog(slug);
  return { success: true, slug, id: postId };
}

/**
 * Restore a post's body (title, excerpt, content) to a prior revision. The
 * restore is itself snapshotted, so it can be undone like any other save.
 */
export async function restoreRevision(
  revisionId: string,
): Promise<BlogActionResult> {
  const user = await requireAdmin();
  const rev = await getRevision(revisionId);
  if (!rev) return { success: false, error: "unknown" };

  const supabase = await createClient();

  // Snapshot the current content first (it may include un-snapshotted
  // autosave changes) so restoring never loses the present version.
  const { data: current } = await supabase
    .from("blog_posts")
    .select("title, excerpt, content")
    .eq("id", rev.post_id)
    .maybeSingle();
  if (current) {
    await snapshotRevision(
      rev.post_id,
      {
        title: current.title as string,
        excerpt: (current.excerpt as string | null) ?? null,
        content: current.content as TiptapDoc,
      },
      user.id,
    );
  }

  const revContentText = extractPlainText(rev.content);
  const { data: post, error } = await supabase
    .from("blog_posts")
    .update({
      title: rev.title,
      excerpt: rev.excerpt,
      content: rev.content,
      content_text: revContentText,
      reading_time_minutes: readingTimeFromText(revContentText),
    })
    .eq("id", rev.post_id)
    .select("slug")
    .single();
  if (error || !post) {
    console.error("[blog] restoreRevision failed:", error?.message);
    return { success: false, error: "unknown" };
  }

  const slug = post.slug as string;
  revalidateBlog(slug);
  return { success: true, slug, id: rev.post_id };
}

export interface AutosaveResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Background autosave. Persists the editable fields without ever touching
 * `status` or `publish_at`, so an autosave can never unpublish or
 * reschedule a post. A new post (no id) is created as a draft and its id
 * is returned so the editor can keep updating the same row. Does not
 * revalidate: drafts are not public, and published edits surface on the
 * next explicit save (which revalidates) or the page's revalidate window.
 */
export async function autosavePost(raw: unknown): Promise<AutosaveResult> {
  const user = await requireAdmin();

  const parsed = blogAutosaveSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };
  const input = parsed.data;

  const slug = await ensureUniqueSlug(input.slug || input.title, input.id);
  const supabase = await createClient();

  const contentText = extractPlainText(input.content as unknown as TiptapDoc);
  const fields = {
    title: input.title,
    slug,
    excerpt: input.excerpt || null,
    content: input.content,
    cover_image_url: input.cover_image_url || null,
    seo_title: input.seo_title || null,
    seo_description: input.seo_description || null,
    category_id: input.category_id || null,
    content_text: contentText,
    reading_time_minutes: readingTimeFromText(contentText),
  };

  let postId: string;
  if (input.id) {
    const { error } = await supabase
      .from("blog_posts")
      .update(fields)
      .eq("id", input.id);
    if (error) {
      console.error("[blog] autosave update failed:", error.message);
      return { success: false, error: "unknown" };
    }
    postId = input.id;
  } else {
    const { data, error } = await supabase
      .from("blog_posts")
      .insert({
        ...fields,
        status: "draft",
        publish_at: null,
        author_id: user.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[blog] autosave insert failed:", error?.message);
      return { success: false, error: "unknown" };
    }
    postId = data.id as string;
  }

  const tagIds = await findOrCreateTags(input.tags ?? []);
  await syncPostTags(postId, tagIds);

  return { success: true, id: postId };
}

async function patchStatus(
  id: string,
  patch: StatusPatch,
): Promise<BlogActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .update(patch)
    .eq("id", id)
    .select("slug")
    .single();
  if (error || !data) {
    console.error("[blog] status change failed:", error?.message);
    return { success: false, error: "unknown" };
  }
  revalidateBlog(data.slug as string);
  return { success: true, id, slug: data.slug as string };
}

/** Pull a published post back to draft. */
export async function unpublishPost(id: string): Promise<BlogActionResult> {
  return patchStatus(id, toDraft());
}

/** Archive a post (hidden from the public index, kept in the admin list). */
export async function archivePost(id: string): Promise<BlogActionResult> {
  return patchStatus(id, toArchived());
}

/** Toggle whether a post is pinned (featured) to the top of the index. */
export async function togglePinned(id: string): Promise<BlogActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("blog_posts")
    .select("pinned")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("blog_posts")
    .update({ pinned: !(current as { pinned: boolean } | null)?.pinned })
    .eq("id", id)
    .select("slug")
    .single();
  if (error || !data) {
    console.error("[blog] togglePinned failed:", error?.message);
    return { success: false, error: "unknown" };
  }
  revalidateBlog(data.slug as string);
  return { success: true, id, slug: data.slug as string };
}

/** Permanently delete a post and remove the images it owned. */
export async function deletePost(id: string): Promise<BlogActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  // Capture the post's images before deleting the row so we can clean up
  // storage. The GC cron is the backstop, but this frees them immediately.
  const { data: existing } = await supabase
    .from("blog_posts")
    .select("cover_image_url, content")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) {
    console.error("[blog] delete failed:", error.message);
    return { success: false, error: "unknown" };
  }

  if (existing) {
    const paths = collectImagePaths(
      existing as { cover_image_url: string | null; content: TiptapDoc | null },
    );
    await removeBlogImagePaths(supabase, paths);
  }

  revalidateBlog();
  return { success: true, id };
}

export interface CreateCategoryResult {
  success: boolean;
  category?: { id: string; name: string };
  error?: string;
}

/**
 * Create a category from the editor (or return the existing one with the
 * same slug). Categories are created explicitly so autosave never coins a
 * category from a half-typed name.
 */
export async function createCategory(
  name: string,
): Promise<CreateCategoryResult> {
  await requireAdmin();
  const parsed = blogCategorySchema.safeParse({ name });
  if (!parsed.success) return { success: false, error: "invalid" };
  const id = await findOrCreateCategory(parsed.data.name);
  if (!id) return { success: false, error: "unknown" };
  return { success: true, category: { id, name: parsed.data.name } };
}
