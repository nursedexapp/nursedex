"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/helpers";
import { getStripe } from "@/lib/stripe/server";
import {
  sendAccountSuspendedEmail,
  sendAccountRemovedEmail,
} from "@/lib/email/send";

export type AccountActionError =
  | "invalid"
  | "not_found"
  | "self_action"
  | "wrong_state"
  | "unknown";

export interface AccountActionResult {
  success: boolean;
  error?: AccountActionError;
}

const userIdSchema = z.object({ user_id: z.string().uuid() });
const removeSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export async function suspendAccount(
  raw: unknown,
): Promise<AccountActionResult> {
  const parsed = userIdSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const admin = await requireAdmin();
  if (admin.id === parsed.data.user_id) {
    return { success: false, error: "self_action" };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("users")
    .select("id, email, first_name, role, is_suspended, is_deleted")
    .eq("id", parsed.data.user_id)
    .maybeSingle();

  if (!target) return { success: false, error: "not_found" };
  if (target.is_deleted) return { success: false, error: "wrong_state" };
  if (target.is_suspended) return { success: false, error: "wrong_state" };

  const { error } = await supabase
    .from("users")
    .update({ is_suspended: true })
    .eq("id", parsed.data.user_id);
  if (error) {
    console.error("[admin] suspend failed:", error.message);
    return { success: false, error: "unknown" };
  }

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "suspend_user",
    target_user_id: parsed.data.user_id,
  });

  sendAccountSuspendedEmail({
    to: target.email,
    firstName: target.first_name ?? undefined,
  }).catch((err) => console.error("[email] account suspended failed:", err));

  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  return { success: true };
}

export async function unsuspendAccount(
  raw: unknown,
): Promise<AccountActionResult> {
  const parsed = userIdSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("users")
    .select("id, is_suspended")
    .eq("id", parsed.data.user_id)
    .maybeSingle();
  if (!target) return { success: false, error: "not_found" };
  if (!target.is_suspended) return { success: false, error: "wrong_state" };

  const { error } = await supabase
    .from("users")
    .update({ is_suspended: false })
    .eq("id", parsed.data.user_id);
  if (error) {
    console.error("[admin] unsuspend failed:", error.message);
    return { success: false, error: "unknown" };
  }

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "unsuspend_user",
    target_user_id: parsed.data.user_id,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  return { success: true };
}

/**
 * Remove (soft delete) an account. Cancels any active Stripe
 * subscriptions, marks the user as deleted, and adds the email to
 * blocked_emails so the same address can't sign up again.
 *
 * Stripe cancellation runs through service-role + Stripe SDK directly.
 * Each subscription cancel is best-effort: if Stripe is unavailable we
 * still mark the user deleted so the account is hidden, and surface a
 * server log for follow-up. Webhook handlers will sync state if Stripe
 * eventually emits cancellation events.
 */
export async function removeAccount(
  raw: unknown,
): Promise<AccountActionResult> {
  const parsed = removeSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const admin = await requireAdmin();
  if (admin.id === parsed.data.user_id) {
    return { success: false, error: "self_action" };
  }

  // Service-role for the cascade of writes, since some tables (e.g.
  // blocked_emails insert by admin) are still permission-tight under
  // RLS edge cases. Admin gate is enforced above.
  const service = createServiceRoleClient();

  const { data: target } = await service
    .from("users")
    .select("id, email, first_name, is_deleted")
    .eq("id", parsed.data.user_id)
    .maybeSingle();
  if (!target) return { success: false, error: "not_found" };
  if (target.is_deleted) return { success: false, error: "wrong_state" };

  // Cancel any active Stripe subscriptions.
  const { data: subs } = await service
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", parsed.data.user_id);
  const stripe = getStripe();
  for (const sub of (subs ?? []) as Array<{
    stripe_subscription_id: string | null;
    status: string;
  }>) {
    if (!sub.stripe_subscription_id) continue;
    if (sub.status === "canceled" || sub.status === "incomplete_expired") {
      continue;
    }
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (err) {
      console.error(
        "[admin] stripe cancel failed for",
        sub.stripe_subscription_id,
        err,
      );
    }
  }

  // Soft delete the user and block the email.
  const { error: updateErr } = await service
    .from("users")
    .update({ is_deleted: true, is_suspended: false })
    .eq("id", parsed.data.user_id);
  if (updateErr) {
    console.error("[admin] remove failed:", updateErr.message);
    return { success: false, error: "unknown" };
  }

  await service.from("blocked_emails").upsert(
    {
      email: target.email.toLowerCase(),
      reason: parsed.data.reason,
    },
    { onConflict: "email" },
  );

  await service.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "remove_user",
    target_user_id: parsed.data.user_id,
    details: parsed.data.reason,
  });

  // Sign them out everywhere by revoking auth sessions. Best-effort.
  await service.auth.admin.signOut(parsed.data.user_id).catch((err) => {
    console.error("[admin] auth.signOut failed:", err);
  });

  sendAccountRemovedEmail({
    to: target.email,
    firstName: target.first_name ?? undefined,
    reason: parsed.data.reason,
  }).catch((err) => console.error("[email] account removed failed:", err));

  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  return { success: true };
}
