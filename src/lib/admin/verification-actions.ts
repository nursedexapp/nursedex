"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/helpers";
import { guardedStatusUpdate } from "@/lib/db/guarded-status-update";
import {
  verifyApproveSchema,
  verifyRejectSchema,
  type VerifyApproveInput,
  type VerifyRejectInput,
} from "@/lib/schemas/admin";
import {
  sendVerificationApprovedEmail,
  sendVerificationRejectedEmail,
} from "@/lib/email/send";
import {
  getOnboardingStatus,
  ONBOARDING_STEP_LABELS,
} from "@/lib/profile/onboarding-status";
import type { NurseProfile, User } from "@/types/database";

import { toTypedFailure } from "@/lib/db/results";
export type VerifyActionError =
  | "invalid"
  | "not_found"
  | "wrong_state"
  | "incomplete"
  // The database could not be read, so nothing is known either way (#847).
  // Distinct from not_found, which is a claim about the row.
  | "lookup_failed"
  // The action applied but was not recorded in the admin log (#982). Retrying
  // cannot help, which is why it says something different.
  | "audit_unwritten"
  | "unknown";

export interface VerifyActionResult {
  success: boolean;
  error?: VerifyActionError;
  fieldErrors?: Record<string, string>;
  /**
   * Which step of her profile is still empty, when the refusal is
   * "incomplete". The queue says it, because the generic "please try again"
   * names an action that cannot fix this one: only the nurse can (#912).
   */
  missingStep?: string;
}

export async function approveVerification(
  raw: unknown,
): Promise<VerifyActionResult> {
  const parsed = verifyApproveSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "invalid" };
  }
  const input: VerifyApproveInput = parsed.data;

  const admin = await requireAdmin();
  const supabase = await createClient();

  // Every field the onboarding floor reads comes back with the row (#912).
  // Verification is the product's promise that somebody checked her, and it
  // could be granted to a profile with nothing in it: 29 of the 32 verified
  // HHAs have no licence number, which is the one field onboarding requires
  // of an HHA and the one the check is supposed to rest on.
  const profileRead = await toTypedFailure(
    supabase
      .from("nurse_profiles")
      .select(
        `user_id, slug, verification_status, years_experience, languages,
         credential, license_number, care_types, skills,
         availability_commitment, time_slots, bio, photos, travel_radius_miles,
         users!inner(first_name, last_name, email, zip_code)`,
      )
      .eq("user_id", input.user_id)
      .maybeSingle(),
    "nurse_profiles (approveVerification)",
  );
  if (!profileRead.ok) return { success: false, error: "lookup_failed" };
  const profile = profileRead.data;

  type ProfileRow = {
    user_id: string;
    slug: string;
    verification_status: "pending" | "verified" | "rejected";
    users: {
      first_name: string | null;
      last_name: string | null;
      email: string;
      zip_code: string | null;
    } | null;
  };
  const row = profile as unknown as ProfileRow | null;

  if (!row || !row.users) return { success: false, error: "not_found" };

  // The floor is the wizard's own definition of a finished profile, read
  // through the same helper the dashboard gates on, so there is one
  // definition rather than a second one written here. Checked before the
  // status guard: a nurse below the floor must not be approved from any
  // status, and nothing at all is written or emailed.
  const onboarding = getOnboardingStatus(
    row as unknown as NurseProfile,
    row.users as unknown as User,
  );
  if (!onboarding.complete) {
    return {
      success: false,
      error: "incomplete",
      missingStep: ONBOARDING_STEP_LABELS[onboarding.nextStep],
    };
  }

  // The status guard lives in the UPDATE, not in a JavaScript check above it
  // (#652). Reading the status and then updating by user_id alone let two admins
  // clicking at once both pass the check and both write, and each then went on
  // to mail this nurse that she had been approved. Approving is legal from
  // pending and from rejected (an admin reversing a rejection), so both are
  // named here; verified is what must not be re-applied.
  const guard = await guardedStatusUpdate(supabase, {
    table: "nurse_profiles",
    id: input.user_id,
    idColumn: "user_id",
    statusColumn: "verification_status",
    expectedStatus: ["pending", "rejected"],
    patch: {
      verification_status: "verified",
      verification_rejected_reason: null,
      verified_at: new Date().toISOString(),
    },
  });

  if (guard.outcome === "error") {
    console.error("[admin] approve failed:", guard.message);
    return { success: false, error: "unknown" };
  }
  // Either she was already verified, or a concurrent admin just verified her.
  // Both mean: do not send the email or write the audit row a second time.
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
      action_type: "verify_nurse",
      target_user_id: input.user_id,
    }),
    "the admin_actions record for this decision",
  );

  const approvedUser = row.users;
  after(() =>
    sendVerificationApprovedEmail({
      to: approvedUser.email,
      firstName: approvedUser.first_name ?? undefined,
      slug: row.slug,
    }).catch((err) =>
      console.error("[email] verification approved failed:", err),
    ),
  );

  revalidatePath("/admin");
  revalidatePath("/admin/verifications");
  revalidatePath(`/nurses/${row.slug}`);
  if (!audit.ok) return { success: false, error: "audit_unwritten" };
  return { success: true };
}

export async function rejectVerification(
  raw: unknown,
): Promise<VerifyActionResult> {
  const parsed = verifyRejectSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input: VerifyRejectInput = parsed.data;

  const admin = await requireAdmin();
  const supabase = await createClient();

  const profileRead = await toTypedFailure(
    supabase
      .from("nurse_profiles")
      .select("user_id, slug, users!inner(first_name, email)")
      .eq("user_id", input.user_id)
      .maybeSingle(),
    "nurse_profiles (rejectVerification)",
  );
  if (!profileRead.ok) return { success: false, error: "lookup_failed" };
  const profile = profileRead.data;

  type ProfileRow = {
    user_id: string;
    slug: string;
    users: { first_name: string | null; email: string } | null;
  };
  const row = profile as unknown as ProfileRow | null;

  if (!row || !row.users) return { success: false, error: "not_found" };

  const reasonText = input.details
    ? `${input.reason}: ${input.details}`
    : input.reason;

  // Same guard as approve (#652): a rejection mails the nurse, so a second one
  // must not be able to land. Rejecting is legal from pending and from verified
  // (an admin revoking a verification); rejecting an already-rejected nurse is
  // the double-apply this refuses.
  const guard = await guardedStatusUpdate(supabase, {
    table: "nurse_profiles",
    id: input.user_id,
    idColumn: "user_id",
    statusColumn: "verification_status",
    expectedStatus: ["pending", "verified"],
    patch: {
      verification_status: "rejected",
      verification_rejected_reason: reasonText,
    },
  });

  if (guard.outcome === "error") {
    console.error("[admin] reject failed:", guard.message);
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
      action_type: "reject_nurse",
      target_user_id: input.user_id,
      details: reasonText,
    }),
    "the admin_actions record for this decision",
  );

  const rejectedUser = row.users;
  after(() =>
    sendVerificationRejectedEmail({
      to: rejectedUser.email,
      firstName: rejectedUser.first_name ?? undefined,
      reason: reasonText,
    }).catch((err) =>
      console.error("[email] verification rejected failed:", err),
    ),
  );

  revalidatePath("/admin");
  revalidatePath("/admin/verifications");
  if (!audit.ok) return { success: false, error: "audit_unwritten" };
  return { success: true };
}
