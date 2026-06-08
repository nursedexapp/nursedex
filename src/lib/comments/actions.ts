"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/helpers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { blogCommentSchema } from "@/lib/schemas/comment";
import { sendCommentSubmittedEmail } from "@/lib/email/send";

export interface CommentResult {
  success: boolean;
  error?: "invalid" | "unknown";
  fieldErrors?: Record<string, string>;
}

/** Revalidate a post's public page so newly approved/removed comments show. */
async function revalidatePostById(postId: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("slug")
    .eq("id", postId)
    .maybeSingle();
  if (data?.slug) revalidatePath(`/blog/${data.slug}`);
}

/**
 * Submit a comment. Stored as `pending` (pre-moderation) so nothing appears
 * publicly until an admin approves it. A filled honeypot is silently
 * accepted; only comments on a currently-published post are stored.
 */
export async function submitComment(raw: unknown): Promise<CommentResult> {
  const parsed = blogCommentSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input = parsed.data;

  if (input.website) return { success: true }; // honeypot

  const supabase = createServiceRoleClient();

  // Only accept comments on a published post.
  const { data: post } = await supabase
    .from("blog_posts")
    .select("status, title")
    .eq("id", input.post_id)
    .maybeSingle();
  const postRow = post as { status: string; title: string } | null;
  if (postRow?.status !== "published") {
    return { success: false, error: "invalid" };
  }

  const { error } = await supabase.from("blog_comments").insert({
    post_id: input.post_id,
    author_name: input.author_name,
    author_email: input.author_email,
    body: input.body,
    status: "pending",
  });
  if (error) {
    console.error("[comments] submit failed:", error.message);
    return { success: false, error: "unknown" };
  }

  // Notify admins after the response (an un-awaited send dies on freeze).
  after(() =>
    sendCommentSubmittedEmail({
      postTitle: postRow.title,
      authorName: input.author_name,
      body: input.body,
    }),
  );

  return { success: true };
}

async function setStatus(
  id: string,
  status: "approved" | "rejected",
): Promise<CommentResult> {
  await requireAdmin();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("blog_comments")
    .update({ status })
    .eq("id", id)
    .select("post_id")
    .single();
  if (error || !data) {
    console.error("[comments] moderation failed:", error?.message);
    return { success: false, error: "unknown" };
  }
  await revalidatePostById(data.post_id as string);
  return { success: true };
}

/** Approve a comment so it shows publicly. */
export async function approveComment(id: string): Promise<CommentResult> {
  return setStatus(id, "approved");
}

/** Reject a comment (kept for the record, hidden publicly). */
export async function rejectComment(id: string): Promise<CommentResult> {
  return setStatus(id, "rejected");
}

/** Permanently delete a comment. */
export async function deleteComment(id: string): Promise<CommentResult> {
  await requireAdmin();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("blog_comments")
    .delete()
    .eq("id", id)
    .select("post_id")
    .single();
  if (error) {
    console.error("[comments] delete failed:", error.message);
    return { success: false, error: "unknown" };
  }
  if (data) await revalidatePostById(data.post_id as string);
  return { success: true };
}
