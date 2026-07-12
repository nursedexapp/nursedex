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

export type VerifyActionError =
  | "invalid"
  | "not_found"
  | "wrong_state"
  | "unknown";

export interface VerifyActionResult {
  success: boolean;
  error?: VerifyActionError;
  fieldErrors?: Record<string, string>;
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

  const { data: profile } = await supabase
    .from("nurse_profiles")
    .select(
      "user_id, slug, verification_status, users!inner(first_name, email)",
    )
    .eq("user_id", input.user_id)
    .maybeSingle();

  type ProfileRow = {
    user_id: string;
    slug: string;
    verification_status: "pending" | "verified" | "rejected";
    users: { first_name: string | null; email: string } | null;
  };
  const row = profile as unknown as ProfileRow | null;

  if (!row || !row.users) return { success: false, error: "not_found" };

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

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "verify_nurse",
    target_user_id: input.user_id,
  });

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

  const { data: profile } = await supabase
    .from("nurse_profiles")
    .select("user_id, slug, users!inner(first_name, email)")
    .eq("user_id", input.user_id)
    .maybeSingle();

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

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "reject_nurse",
    target_user_id: input.user_id,
    details: reasonText,
  });

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
  return { success: true };
}
