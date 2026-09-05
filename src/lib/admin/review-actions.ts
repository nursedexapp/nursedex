"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/helpers";
import { guardedStatusUpdate } from "@/lib/db/guarded-status-update";
import { sendDisputeDecisionEmail } from "@/lib/email/send";

import { toTypedFailure } from "@/lib/db/results";
export type AdminReviewError =
  | "invalid"
  | "not_found"
  | "wrong_state"
  // The database could not be read, so nothing is known either way (#847).
  // Distinct from not_found, which is a claim about the row.
  | "lookup_failed"
  // The action applied but was not recorded in the admin log (#982). Retrying
  // cannot help, which is why it says something different.
  | "audit_unwritten"
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

  const rowRead = await toTypedFailure(
    supabase
      .from("reviews")
      .select("id, status, nurse_user_id")
      .eq("id", parsed.data.review_id)
      .maybeSingle(),
    "reviews (adminApproveReview)",
  );
  if (!rowRead.ok) return { success: false, error: "lookup_failed" };
  const row = rowRead.data;
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

  // The audit row. Discarded, this leaves no record that the action happened,
  // which is the one question an audit trail exists to answer (#847, #982).
  //
  // Checked but NOT returned on here: by this point the decision is applied,
  // and returning early would skip the revalidation and any notification that
  // follows, so the admin would be looking at a stale screen for a change that
  // did happen. The work finishes and the result says what is missing.
  const audit = await toTypedFailure(
    supabase.from("admin_actions").insert({
      admin_user_id: admin.id,
      action_type: "approve_review",
      target_review_id: parsed.data.review_id,
      target_user_id: row.nurse_user_id,
    }),
    "the admin_actions record for this decision",
  );

  revalidatePath("/admin");
  revalidatePath("/admin/reviews");
  // Bust the public profile cache so the new review appears.
  //
  // Reported, not refused. The approval has already applied by this point, so
  // returning a failure here would tell the admin their decision did not
  // happen when it did. What a failed read costs is a stale profile page until
  // the next revalidation, and toTypedFailure files it either way.
  const nurseSlugRead = await toTypedFailure(
    supabase
      .from("nurse_profiles")
      .select("slug")
      .eq("user_id", row.nurse_user_id)
      .maybeSingle(),
    "the slug of the nurse whose profile cache needs busting",
  );
  const nurseSlug = nurseSlugRead.ok ? nurseSlugRead.data : null;
  if (nurseSlug?.slug) revalidatePath(`/nurses/${nurseSlug.slug}`);
  if (!audit.ok) return { success: false, error: "audit_unwritten" };
  return { success: true };
}

export async function adminRejectReview(
  raw: unknown,
): Promise<AdminReviewResult> {
  const parsed = reviewIdSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const admin = await requireAdmin();
  const supabase = await createClient();

  const rowRead = await toTypedFailure(
    supabase
      .from("reviews")
      .select("id, status, nurse_user_id")
      .eq("id", parsed.data.review_id)
      .maybeSingle(),
    "reviews (adminRejectReview)",
  );
  if (!rowRead.ok) return { success: false, error: "lookup_failed" };
  const row = rowRead.data;
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

  // The audit row. Discarded, this leaves no record that the action happened,
  // which is the one question an audit trail exists to answer (#847, #982).
  //
  // Checked but NOT returned on here: by this point the decision is applied,
  // and returning early would skip the revalidation and any notification that
  // follows, so the admin would be looking at a stale screen for a change that
  // did happen. The work finishes and the result says what is missing.
  const audit = await toTypedFailure(
    supabase.from("admin_actions").insert({
      admin_user_id: admin.id,
      action_type: "reject_review",
      target_review_id: parsed.data.review_id,
      target_user_id: row.nurse_user_id,
    }),
    "the admin_actions record for this decision",
  );

  revalidatePath("/admin");
  revalidatePath("/admin/reviews");
  if (!audit.ok) return { success: false, error: "audit_unwritten" };
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

  const rowRead = await toTypedFailure(
    supabase
      .from("reviews")
      .select("id, status, removal_requested, nurse_user_id")
      .eq("id", parsed.data.review_id)
      .maybeSingle(),
    "reviews (adminResolveRemovalRequest)",
  );
  if (!rowRead.ok) return { success: false, error: "lookup_failed" };
  const row = rowRead.data;
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

  // The audit row. Discarded, this leaves no record that the action happened,
  // which is the one question an audit trail exists to answer (#847, #982).
  //
  // Checked but NOT returned on here: by this point the decision is applied,
  // and returning early would skip the revalidation and any notification that
  // follows, so the admin would be looking at a stale screen for a change that
  // did happen. The work finishes and the result says what is missing.
  const audit = await toTypedFailure(
    supabase.from("admin_actions").insert({
      admin_user_id: admin.id,
      action_type:
        parsed.data.decision === "honor" ? "reject_review" : "approve_review",
      target_review_id: parsed.data.review_id,
      target_user_id: row.nurse_user_id,
      details: `removal_request:${parsed.data.decision}`,
    }),
    "the admin_actions record for this decision",
  );

  revalidatePath("/admin");
  revalidatePath("/admin/reviews");
  if (!audit.ok) return { success: false, error: "audit_unwritten" };
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

  const rowRead = await toTypedFailure(
    supabase
      .from("reviews")
      .select(
        `
        id, status, rating, reviewer_name, reviewer_email, nurse_user_id,
        users:nurse_user_id (first_name, email)
      `,
      )
      .eq("id", parsed.data.review_id)
      .maybeSingle(),
    "reviews (adminResolveDispute)",
  );
  if (!rowRead.ok) return { success: false, error: "lookup_failed" };
  const row = rowRead.data;

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

  // Guard on `disputed` so a second resolve cannot land. This one mails BOTH the
  // nurse and the reviewer, so an unguarded double-apply sent four emails about a
  // decision that was made once (#663).
  const guard = await guardedStatusUpdate(supabase, {
    table: "reviews",
    id: parsed.data.review_id,
    expectedStatus: "disputed",
    patch: {
      status: newStatus,
      admin_decision: notes ?? `Dispute ${parsed.data.decision}`,
    },
  });
  if (guard.outcome === "error") {
    console.error("[admin] resolve dispute failed:", guard.message);
    return { success: false, error: "unknown" };
  }
  if (guard.outcome === "already_resolved") {
    return { success: false, error: "wrong_state" };
  }

  // The audit row. Discarded, this leaves no record that the action happened,
  // which is the one question an audit trail exists to answer (#847, #982).
  //
  // Checked but NOT returned on here: by this point the decision is applied,
  // and returning early would skip the revalidation and any notification that
  // follows, so the admin would be looking at a stale screen for a change that
  // did happen. The work finishes and the result says what is missing.
  const audit = await toTypedFailure(
    supabase.from("admin_actions").insert({
      admin_user_id: admin.id,
      action_type: "resolve_dispute",
      target_review_id: parsed.data.review_id,
      target_user_id: r.nurse_user_id,
      details: `dispute:${parsed.data.decision}${notes ? `, ${notes}` : ""}`,
    }),
    "the admin_actions record for this decision",
  );

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
  if (!audit.ok) return { success: false, error: "audit_unwritten" };
  return { success: true };
}
