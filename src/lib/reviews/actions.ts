"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/helpers";
import {
  familyReviewSchema,
  removalRequestSchema,
  type FamilyReviewInput,
  type RemovalRequestInput,
} from "@/lib/schemas/review";
import { sendNewReviewEmail } from "@/lib/email/send";

export type ReviewActionError =
  | "not_authenticated"
  | "wrong_role"
  | "not_revealed"
  | "already_reviewed"
  | "not_found"
  | "not_editable"
  | "invalid"
  | "unknown";

export interface ReviewActionResult {
  success: boolean;
  error?: ReviewActionError;
  fieldErrors?: Record<string, string>;
  reviewId?: string;
}

/**
 * Family submits a platform review for a nurse they've revealed.
 *
 * Eligibility:
 * - Must be signed in as a family
 * - Must have an existing reveal of this nurse
 * - Cannot already have a platform review for this nurse (DB unique index
 *   enforces this; we surface a friendlier error here)
 */
export async function submitFamilyReview(
  raw: unknown,
): Promise<ReviewActionResult> {
  const parsed = familyReviewSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input: FamilyReviewInput = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "not_authenticated" };
  if (user.role !== "family") return { success: false, error: "wrong_role" };

  const supabase = await createClient();

  const { data: reveal } = await supabase
    .from("reveals")
    .select("id")
    .eq("family_user_id", user.id)
    .eq("nurse_user_id", input.nurse_user_id)
    .maybeSingle();
  if (!reveal) return { success: false, error: "not_revealed" };

  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("reviewer_user_id", user.id)
    .eq("nurse_user_id", input.nurse_user_id)
    .eq("is_external", false)
    .maybeSingle();
  if (existing) return { success: false, error: "already_reviewed" };

  const { data: inserted, error } = await supabase
    .from("reviews")
    .insert({
      nurse_user_id: input.nurse_user_id,
      reviewer_user_id: user.id,
      reviewer_email: user.email,
      reviewer_name: input.reviewer_name,
      rating: input.rating,
      text: input.text,
      testimonial_opt_in: input.testimonial_opt_in,
      is_external: false,
      email_verified: true,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    if (error?.code === "23505") {
      return { success: false, error: "already_reviewed" };
    }
    console.error("[reviews] insert failed:", error?.message);
    return { success: false, error: "unknown" };
  }

  // Best-effort: notify the nurse a new review came in.
  after(() =>
    sendNewReviewEmail({
      nurseUserId: input.nurse_user_id,
      rating: input.rating,
      reviewerName: input.reviewer_name,
    }).catch((err) => console.error("[reviews] new-review email failed:", err)),
  );

  revalidatePath("/dashboard/revealed");
  revalidatePath("/dashboard");

  return { success: true, reviewId: inserted.id };
}

/**
 * Family edits their own pending review. RLS already blocks edits once
 * the review is approved/disputed; we double-check the current status to
 * return a clean error.
 */
export async function updateFamilyReview(
  reviewId: string,
  raw: unknown,
): Promise<ReviewActionResult> {
  const parsed = familyReviewSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input: FamilyReviewInput = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "not_authenticated" };
  if (user.role !== "family") return { success: false, error: "wrong_role" };

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("reviews")
    .select("id, status, reviewer_user_id, nurse_user_id, is_external")
    .eq("id", reviewId)
    .maybeSingle();

  if (!row || row.reviewer_user_id !== user.id || row.is_external) {
    return { success: false, error: "not_found" };
  }
  if (row.status !== "pending") {
    return { success: false, error: "not_editable" };
  }
  if (row.nurse_user_id !== input.nurse_user_id) {
    return { success: false, error: "invalid" };
  }

  const { error } = await supabase
    .from("reviews")
    .update({
      reviewer_name: input.reviewer_name,
      rating: input.rating,
      text: input.text,
      testimonial_opt_in: input.testimonial_opt_in,
    })
    .eq("id", reviewId);

  if (error) {
    console.error("[reviews] update failed:", error.message);
    return { success: false, error: "unknown" };
  }

  revalidatePath("/dashboard/revealed");
  revalidatePath("/dashboard");
  return { success: true, reviewId };
}

/**
 * Family asks an admin to remove an already-approved review. Goes through
 * a SECURITY DEFINER RPC that enforces ownership + status=approved.
 */
export async function requestReviewRemoval(
  raw: unknown,
): Promise<ReviewActionResult> {
  const parsed = removalRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input: RemovalRequestInput = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "not_authenticated" };
  if (user.role !== "family") return { success: false, error: "wrong_role" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_review_removal", {
    p_review_id: input.review_id,
    p_reason: input.reason,
  });

  if (error) {
    if (error.code === "42501") {
      return { success: false, error: "not_editable" };
    }
    console.error("[reviews] removal request failed:", error.message);
    return { success: false, error: "unknown" };
  }

  revalidatePath("/dashboard/revealed");
  revalidatePath("/dashboard");
  return { success: true, reviewId: input.review_id };
}
