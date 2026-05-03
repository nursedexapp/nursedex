"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/helpers";
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
  if (row.verification_status === "verified") {
    return { success: false, error: "wrong_state" };
  }

  const { error: updateError } = await supabase
    .from("nurse_profiles")
    .update({
      verification_status: "verified",
      verification_rejected_reason: null,
    })
    .eq("user_id", input.user_id);

  if (updateError) {
    console.error("[admin] approve failed:", updateError.message);
    return { success: false, error: "unknown" };
  }

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "verify_nurse",
    target_user_id: input.user_id,
  });

  sendVerificationApprovedEmail({
    to: row.users.email,
    firstName: row.users.first_name ?? undefined,
    slug: row.slug,
  }).catch((err) =>
    console.error("[email] verification approved failed:", err),
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

  const { error: updateError } = await supabase
    .from("nurse_profiles")
    .update({
      verification_status: "rejected",
      verification_rejected_reason: reasonText,
    })
    .eq("user_id", input.user_id);

  if (updateError) {
    console.error("[admin] reject failed:", updateError.message);
    return { success: false, error: "unknown" };
  }

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "reject_nurse",
    target_user_id: input.user_id,
    details: reasonText,
  });

  sendVerificationRejectedEmail({
    to: row.users.email,
    firstName: row.users.first_name ?? undefined,
    reason: reasonText,
  }).catch((err) =>
    console.error("[email] verification rejected failed:", err),
  );

  revalidatePath("/admin");
  revalidatePath("/admin/verifications");
  return { success: true };
}
