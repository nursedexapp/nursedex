import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { BlogComment } from "@/types/database";

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
  const { data, error } = await supabase
    .from("blog_comments")
    .select("id, author_name, body, created_at")
    .eq("post_id", postId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[comments] getApprovedComments failed:", error.message);
    return [];
  }
  return (data ?? []) as PublicComment[];
}

/** Every comment for the admin moderation queue, newest first. */
export async function getCommentsForAdmin(): Promise<BlogComment[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("blog_comments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[comments] getCommentsForAdmin failed:", error.message);
    return [];
  }
  return (data ?? []) as BlogComment[];
}

/** Count of comments awaiting moderation. */
export async function getPendingCommentCount(): Promise<number> {
  const supabase = createServiceRoleClient();
  const { count } = await supabase
    .from("blog_comments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
