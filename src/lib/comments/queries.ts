import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { BlogComment } from "@/types/database";

import { unwrapCountOrThrow, unwrapOrThrow } from "@/lib/db/results";
export interface PublicComment {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
}

/** Approved comments for a post, oldest first. Public, sessionless read. */
export async function getApprovedComments(
  postId: string,
): Promise<PublicComment[]> {
  const supabase = createServiceRoleClient();
  const data = await unwrapOrThrow(
    supabase
      .from("blog_comments")
      .select("id, author_name, body, created_at")
      .eq("post_id", postId)
      .eq("status", "approved")
      .order("created_at", { ascending: true }),
    "the approved comments on this post",
  );
  return (data ?? []) as PublicComment[];
}

/** Every comment for the admin moderation queue, newest first. */
export async function getCommentsForAdmin(): Promise<BlogComment[]> {
  const supabase = createServiceRoleClient();
  const data = await unwrapOrThrow(
    supabase
      .from("blog_comments")
      .select("*")
      .order("created_at", { ascending: false }),
    "the comment moderation queue",
  );
  return (data ?? []) as BlogComment[];
}

/** Count of comments awaiting moderation. */
export async function getPendingCommentCount(): Promise<number> {
  const supabase = createServiceRoleClient();
  // `count ?? 0` reads a failed count as a real zero (#847), and this one is
  // rendered as a number on an admin screen, so a database problem looks
  // exactly like an empty queue.
  return await unwrapCountOrThrow(
    supabase
      .from("blog_comments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    "the count of comments awaiting moderation",
  );
}
