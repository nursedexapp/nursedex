"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireRole } from "@/lib/auth/helpers";
import { UserRole } from "@/types/enums";
import {
  externalReviewSchema,
  type ExternalReviewInput,
} from "@/lib/schemas/review";
import { sendVerifyReviewEmail, sendNewReviewEmail } from "@/lib/email/send";

import { toTypedFailure } from "@/lib/db/results";
const VERIFICATION_TTL_DAYS = 7;

export interface ReviewLinkRow {
  token: string;
  last_regenerated_at: string;
}

/**
 * Get the nurse's permanent review link, creating it on first read so
 * the dashboard never shows an empty state.
 */
export async function getOrCreateReviewLink(): Promise<{
  link?: ReviewLinkRow;
  error?: string;
}> {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  const existingRead = await toTypedFailure(
    supabase
      .from("nurse_review_links")
      .select("token, last_regenerated_at")
      .eq("nurse_user_id", user.id)
      .maybeSingle(),
    "nurse_review_links (getOrCreateReviewLink)",
  );
  if (!existingRead.ok)
    return { error: "We could not check that just now. Please try again." };
  const existing = existingRead.data;

  if (existing) return { link: existing as ReviewLinkRow };

  const { data: created, error } = await supabase
    .from("nurse_review_links")
    .insert({ nurse_user_id: user.id })
    .select("token, last_regenerated_at")
    .single();

  if (error || !created) {
    return { error: "Could not create your review link. Please try again." };
  }
  return { link: created as ReviewLinkRow };
}

/**
 * Rotate the nurse's review link. Old token immediately stops working.
 */
export async function regenerateReviewLink(): Promise<{
  link?: ReviewLinkRow;
  error?: string;
}> {
  const user = await requireRole(UserRole.NURSE);

  // Service-role client to ensure the UPDATE writes the new token even if
  // RLS evaluation hits an edge case; we still gate on the auth user id
  // explicitly via requireRole above.
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("nurse_review_links")
    .update({
      token: crypto.randomUUID(),
      last_regenerated_at: new Date().toISOString(),
    })
    .eq("nurse_user_id", user.id)
    .select("token, last_regenerated_at")
    .maybeSingle();

  if (error) {
    console.error("[reviews] regenerate link failed:", error.message);
    return { error: "Could not regenerate your link. Please try again." };
  }
  if (!data) {
    // Nothing to rotate yet, fall back to a fresh creation.
    return getOrCreateReviewLink();
  }

  revalidatePath("/dashboard");
  return { link: data as ReviewLinkRow };
}

export type ExternalReviewError =
  | "invalid"
  | "link_invalid"
  | "rate_limited"
  | "unknown";

export interface ExternalReviewResult {
  success: boolean;
  error?: ExternalReviewError;
  fieldErrors?: Record<string, string>;
  reviewId?: string;
}

/**
 * Anonymous submission via the public /reviews/[token] form.
 * Goes through the SECURITY DEFINER submit_external_review RPC because
 * the caller has no auth.uid().
 */
export async function submitExternalReview(
  raw: unknown,
): Promise<ExternalReviewResult> {
  const parsed = externalReviewSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input: ExternalReviewInput = parsed.data;

  const supabase = await createClient();
  const expiresAt = new Date(
    Date.now() + VERIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const { data, error } = await supabase
    .rpc("submit_external_review", {
      p_link_token: input.link_token,
      p_reviewer_name: input.reviewer_name,
      p_reviewer_email: input.reviewer_email,
      p_rating: input.rating,
      p_text: input.text,
      p_testimonial_opt_in: input.testimonial_opt_in,
      p_verification_expires_at: expiresAt.toISOString(),
    })
    .single();

  if (error) {
    if (error.code === "42501") {
      // Either the link is invalid or the cap is hit. Surface as
      // link_invalid since the user is already on the form page; the
      // friendlier UI is "this link isn't working right now."
      return { success: false, error: "link_invalid" };
    }
    console.error("[reviews] external submit failed:", error.message);
    return { success: false, error: "unknown" };
  }

  type Row = { review_id: string; verification_token: string };
  const row = data as unknown as Row;

  // Send the verification email after the response. after() keeps the
  // serverless function alive until it completes; a bare fire-and-forget
  // gets killed when the function freezes, so the email never sends.
  after(() =>
    sendVerifyReviewEmail({
      to: input.reviewer_email,
      reviewerName: input.reviewer_name,
      verificationToken: row.verification_token,
    }).catch((err) => console.error("[reviews] verify email failed:", err)),
  );

  return { success: true, reviewId: row.review_id };
}

export interface VerifyExternalReviewResult {
  success: boolean;
  reviewerName?: string;
  rating?: number;
  error?: "invalid" | "expired" | "unknown";
}

/**
 * Confirms the email verification token, flips email_verified=true on the
 * review, and notifies the nurse.
 */
export async function verifyExternalReview(
  token: string,
): Promise<VerifyExternalReviewResult> {
  if (!token) return { success: false, error: "invalid" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("verify_external_review", { p_token: token })
    .single();

  if (error) {
    if (error.code === "42501") {
      return { success: false, error: "invalid" };
    }
    console.error("[reviews] verify failed:", error.message);
    return { success: false, error: "unknown" };
  }

  type Row = {
    review_id: string;
    nurse_user_id: string;
    reviewer_name: string;
    rating: number;
  };
  const row = data as unknown as Row;

  // Now that the review is verified, notify the nurse (after the response,
  // so the send isn't killed by the function freezing).
  after(() =>
    sendNewReviewEmail({
      nurseUserId: row.nurse_user_id,
      rating: row.rating,
      reviewerName: row.reviewer_name,
    }).catch((err) => console.error("[reviews] new-review email failed:", err)),
  );

  return {
    success: true,
    reviewerName: row.reviewer_name,
    rating: row.rating,
  };
}
