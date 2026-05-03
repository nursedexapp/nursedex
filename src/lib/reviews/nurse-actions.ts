"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/helpers";
import { UserRole } from "@/types/enums";
import {
  nurseResponseSchema,
  disputeReviewSchema,
  type NurseResponseInput,
  type DisputeReviewInput,
} from "@/lib/schemas/review";
import { containsProfanity } from "./profanity";

export type NurseResponseError =
  | "invalid"
  | "profanity"
  | "not_found"
  | "unknown";

export interface NurseResponseResult {
  success: boolean;
  error?: NurseResponseError;
  fieldErrors?: Record<string, string>;
}

/**
 * Create or replace the nurse's response on a review they own. The
 * existing RLS policy `reviews_update_nurse_response` allows updates
 * when nurse_user_id = auth.uid(), so the server action just runs as
 * the user.
 *
 * Profanity check happens before the DB write so the user sees the
 * exact field error inline. PRD: "auto moderation only (profanity
 * filter), 500 char limit."
 */
export async function saveNurseResponse(
  raw: unknown,
): Promise<NurseResponseResult> {
  const parsed = nurseResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input: NurseResponseInput = parsed.data;

  if (containsProfanity(input.text)) {
    return {
      success: false,
      error: "profanity",
      fieldErrors: {
        text: "Please remove any profanity before posting your response.",
      },
    };
  }

  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("reviews")
    .select("id, nurse_user_id")
    .eq("id", input.review_id)
    .maybeSingle();

  if (!row || row.nurse_user_id !== user.id) {
    return { success: false, error: "not_found" };
  }

  const { error } = await supabase
    .from("reviews")
    .update({
      nurse_response: input.text,
      nurse_response_at: new Date().toISOString(),
    })
    .eq("id", input.review_id);

  if (error) {
    console.error("[reviews] save response failed:", error.message);
    return { success: false, error: "unknown" };
  }

  revalidatePath("/dashboard/reviews");
  return { success: true };
}

export type DisputeReviewError =
  | "invalid"
  | "not_eligible"
  | "unknown";

export interface DisputeReviewResult {
  success: boolean;
  error?: DisputeReviewError;
  fieldErrors?: Record<string, string>;
}

export async function disputeReview(
  raw: unknown,
): Promise<DisputeReviewResult> {
  const parsed = disputeReviewSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input: DisputeReviewInput = parsed.data;

  await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  const { error } = await supabase.rpc("dispute_review", {
    p_review_id: input.review_id,
    p_reason: input.reason,
    p_text: input.text,
  });

  if (error) {
    if (error.code === "42501") {
      return { success: false, error: "not_eligible" };
    }
    console.error("[reviews] dispute failed:", error.message);
    return { success: false, error: "unknown" };
  }

  revalidatePath("/dashboard/reviews");
  return { success: true };
}

export async function deleteNurseResponse(
  reviewId: string,
): Promise<NurseResponseResult> {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("reviews")
    .select("id, nurse_user_id")
    .eq("id", reviewId)
    .maybeSingle();

  if (!row || row.nurse_user_id !== user.id) {
    return { success: false, error: "not_found" };
  }

  const { error } = await supabase
    .from("reviews")
    .update({
      nurse_response: null,
      nurse_response_at: null,
    })
    .eq("id", reviewId);

  if (error) {
    console.error("[reviews] delete response failed:", error.message);
    return { success: false, error: "unknown" };
  }

  revalidatePath("/dashboard/reviews");
  return { success: true };
}
