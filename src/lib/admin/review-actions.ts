"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/helpers";
import { guardedStatusUpdate } from "@/lib/db/guarded-status-update";
import { sendDisputeDecisionEmail } from "@/lib/email/send";

export type AdminReviewError =
  | "invalid"
  | "not_found"
  | "wrong_state"
  | "unknown";

export interface AdminReviewResult {
  success: boolean;
  error?: AdminReviewError;
  fieldErrors?: Record<string, string>;
}

const reviewIdSchema = z.object({ review_id: z.string().uuid() });

/**
 * Approve a pending review. Triggers the recalc trigger which updates
 * avg_rating + review_count. No emails, the nurse already got the
 * "new review received" email when the review was first submitted.
 */
export async function adminApproveReview(
  raw: unknown,
): Promise<AdminReviewResult> {
  const parsed = reviewIdSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("reviews")
    .select("id, status, nurse_user_id")
    .eq("id", parsed.data.review_id)
    .maybeSingle();
  if (!row) return { success: false, error: "not_found" };
  if (row.status !== "pending") {
    return { success: false, error: "wrong_state" };
  }

  // The pending check above is a stale read: two admins moderating the same
  // review both pass it. The guard that decides the race is in the UPDATE (#652).
  const guard = await guardedStatusUpdate(supabase, {
    table: "reviews",
    id: parsed.data.review_id,
    expectedStatus: "pending",
    patch: { status: "approved" },
  });
  if (guard.outcome === "error") {
    console.error("[admin] approve review failed:", guard.message);
    return { success: false, error: "unknown" };
  }
  if (guard.outcome === "already_resolved") {
    return { success: false, error: "wrong_state" };
  }

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "approve_review",
    target_review_id: parsed.data.review_id,
    target_user_id: row.nurse_user_id,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/reviews");
  // Bust the public profile cache so the new review appears.
  const { data: nurseSlug } = await supabase
    .from("nurse_profiles")
    .select("slug")
    .eq("user_id", row.nurse_user_id)
    .maybeSingle();
  if (nurseSlug?.slug) revalidatePath(`/nurses/${nurseSlug.slug}`);
  return { success: true };
}

export async function adminRejectReview(
  raw: unknown,
): Promise<AdminReviewResult> {
  const parsed = reviewIdSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("reviews")
    .select("id, status, nurse_user_id")
    .eq("id", parsed.data.review_id)
    .maybeSingle();
  if (!row) return { success: false, error: "not_found" };
  if (row.status !== "pending") {
    return { success: false, error: "wrong_state" };
  }

  const guard = await guardedStatusUpdate(supabase, {
    table: "reviews",
    id: parsed.data.review_id,
    expectedStatus: "pending",
    patch: { status: "rejected" },
  });
  if (guard.outcome === "error") {
    console.error("[admin] reject review failed:", guard.message);
    return { success: false, error: "unknown" };
  }
  if (guard.outcome === "already_resolved") {
    return { success: false, error: "wrong_state" };
  }

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "reject_review",
    target_review_id: parsed.data.review_id,
    target_user_id: row.nurse_user_id,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/reviews");
  return { success: true };
}

const removalDecisionSchema = z.object({
  review_id: z.string().uuid(),
  decision: z.enum(["honor", "deny"]),
});

/**
 * Resolve a family's removal request. "honor" rejects the review and
 * clears the request flag. "deny" just clears the flag and leaves the
 * review approved.
 */
export async function adminResolveRemovalRequest(
  raw: unknown,
): Promise<AdminReviewResult> {
  const parsed = removalDecisionSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("reviews")
    .select("id, status, removal_requested, nurse_user_id")
    .eq("id", parsed.data.review_id)
    .maybeSingle();
  if (!row) return { success: false, error: "not_found" };
  if (!row.removal_requested || row.status !== "approved") {
    return { success: false, error: "wrong_state" };
  }

  const update =
    parsed.data.decision === "honor"
      ? {
          status: "rejected" as const,
          removal_requested: false,
          removal_reason: null,
        }
      : { removal_requested: false, removal_reason: null };

  const { error } = await supabase
    .from("reviews")
    .update(update)
    .eq("id", parsed.data.review_id);
  if (error) {
    console.error("[admin] resolve removal failed:", error.message);
    return { success: false, error: "unknown" };
  }

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type:
      parsed.data.decision === "honor" ? "reject_review" : "approve_review",
    target_review_id: parsed.data.review_id,
    target_user_id: row.nurse_user_id,
    details: `removal_request:${parsed.data.decision}`,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/reviews");
  return { success: true };
}

const disputeDecisionSchema = z.object({
  review_id: z.string().uuid(),
  decision: z.enum(["keep", "remove"]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * Resolve a nurse's dispute. "keep" returns the review to approved
 * (visible, counted in rating). "remove" sets it to rejected (hidden,
 * not counted). Either way, both the nurse and the reviewer (if email
 * is on file) get a decision email.
 */
export async function adminResolveDispute(
  raw: unknown,
): Promise<AdminReviewResult> {
  const parsed = disputeDecisionSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("reviews")
    .select(
      `
      id, status, rating, reviewer_name, reviewer_email, nurse_user_id,
      users:nurse_user_id (first_name, email)
    `,
    )
    .eq("id", parsed.data.review_id)
    .maybeSingle();

  type ReviewJoin = {
    id: string;
    status: string;
    rating: number;
    reviewer_name: string;
    reviewer_email: string | null;
    nurse_user_id: string;
    users: { first_name: string | null; email: string } | null;
  };
  const r = row as unknown as ReviewJoin | null;
  if (!r) return { success: false, error: "not_found" };
  if (r.status !== "disputed") return { success: false, error: "wrong_state" };

  const newStatus = parsed.data.decision === "keep" ? "approved" : "rejected";
  const notes =
    parsed.data.notes && parsed.data.notes.length > 0
      ? parsed.data.notes
      : null;

  const { error } = await supabase
    .from("reviews")
    .update({
      status: newStatus,
      admin_decision: notes ?? `Dispute ${parsed.data.decision}`,
    })
    .eq("id", parsed.data.review_id);
  if (error) {
    console.error("[admin] resolve dispute failed:", error.message);
    return { success: false, error: "unknown" };
  }

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "resolve_dispute",
    target_review_id: parsed.data.review_id,
    target_user_id: r.nurse_user_id,
    details: `dispute:${parsed.data.decision}${notes ? `, ${notes}` : ""}`,
  });

  // Notify the nurse.
  if (r.users?.email) {
    const nurseUser = r.users;
    after(() =>
      sendDisputeDecisionEmail({
        to: nurseUser.email,
        recipientType: "nurse",
        recipientName: nurseUser.first_name ?? undefined,
        decision: parsed.data.decision,
        rating: r.rating,
        reviewerName: r.reviewer_name,
        notes,
      }).catch((err) =>
        console.error("[email] dispute decision (nurse) failed:", err),
      ),
    );
  }

  // Notify the reviewer if we have an email on file.
  if (r.reviewer_email) {
    const reviewerEmail = r.reviewer_email;
    after(() =>
      sendDisputeDecisionEmail({
        to: reviewerEmail,
        recipientType: "reviewer",
        recipientName: r.reviewer_name,
        decision: parsed.data.decision,
        rating: r.rating,
        reviewerName: r.reviewer_name,
        notes,
      }).catch((err) =>
        console.error("[email] dispute decision (reviewer) failed:", err),
      ),
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/disputes");
  return { success: true };
}
