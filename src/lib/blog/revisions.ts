import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { BlogPostRevision, TiptapDoc } from "@/types/database";

import { unwrapOrThrow, assertNoWriteError } from "@/lib/db/results";
export const REVISION_LIMIT = 30;

export interface RevisionSnapshot {
  title: string;
  excerpt: string | null;
  content: TiptapDoc;
}

/** Given revision ids newest-first, the ids to delete to keep only `limit`. */
export function idsBeyondLimit(
  idsNewestFirst: string[],
  limit: number,
): string[] {
  return idsNewestFirst.slice(limit);
}

/**
 * Snapshot a post's editable body as a revision, then prune older revisions
 * beyond REVISION_LIMIT. Best effort: a failure here is logged but never
 * blocks the save that triggered it.
 */
export async function snapshotRevision(
  postId: string,
  snap: RevisionSnapshot,
  userId: string | null,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("blog_post_revisions").insert({
    post_id: postId,
    title: snap.title,
    excerpt: snap.excerpt,
    content: snap.content,
    created_by: userId,
  });
  if (error) {
    console.error("[blog] snapshotRevision failed:", error.message);
    return;
  }

  const data = await unwrapOrThrow(
    supabase
      .from("blog_post_revisions")
      .select("id")
      .eq("post_id", postId)
      .order("created_at", { ascending: false }),
    "blog_post_revisions (snapshotRevision)",
  );
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const toDelete = idsBeyondLimit(ids, REVISION_LIMIT);
  if (toDelete.length > 0) {
    // Checked: a silently failed prune leaves the table growing without bound,
    // and nothing anywhere would say so (#847).
    await assertNoWriteError(
      supabase.from("blog_post_revisions").delete().in("id", toDelete),
      "the prune of old blog post revisions",
    );
  }
}

export async function getRevisions(
  postId: string,
): Promise<BlogPostRevision[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("blog_post_revisions")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[blog] getRevisions failed:", error.message);
    return [];
  }
  return (data ?? []) as BlogPostRevision[];
}

export async function getRevision(
  id: string,
): Promise<BlogPostRevision | null> {
  const supabase = createServiceRoleClient();
  const data = await unwrapOrThrow(
    supabase.from("blog_post_revisions").select("*").eq("id", id).maybeSingle(),
    "blog_post_revisions (getRevision)",
  );
  return (data as BlogPostRevision | null) ?? null;
}
