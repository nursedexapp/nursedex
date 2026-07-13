"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/helpers";
import { guardedStatusUpdate } from "@/lib/db/guarded-status-update";
import { cancelActiveStripeSubscriptions } from "@/lib/stripe/cancel-subscriptions";
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

  // Guard on the flag itself, so a second suspend cannot land and cannot mail
  // this person a second "your account has been suspended" (#652).
  const guard = await guardedStatusUpdate(supabase, {
    table: "users",
    id: parsed.data.user_id,
    statusColumn: "is_suspended",
    expectedStatus: false,
    patch: { is_suspended: true },
  });
  if (guard.outcome === "error") {
    console.error("[admin] suspend failed:", guard.message);
    return { success: false, error: "unknown" };
  }
  if (guard.outcome === "already_resolved") {
    return { success: false, error: "wrong_state" };
  }

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "suspend_user",
    target_user_id: parsed.data.user_id,
  });

  // Ban the user at the auth level so their tokens stop validating. Best
  // effort: the real enforcement is getCurrentUser treating is_suspended as
  // logged out. (admin.signOut takes a JWT, not a user id, so it can't be
  // used here.)
  const service = createServiceRoleClient();
  await service.auth.admin
    .updateUserById(parsed.data.user_id, { ban_duration: "876000h" })
    .catch((err) => console.error("[admin] auth ban on suspend failed:", err));

  after(() =>
    sendAccountSuspendedEmail({
      to: target.email,
      firstName: target.first_name ?? undefined,
    }).catch((err) => console.error("[email] account suspended failed:", err)),
  );

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

  const guard = await guardedStatusUpdate(supabase, {
    table: "users",
    id: parsed.data.user_id,
    statusColumn: "is_suspended",
    expectedStatus: true,
    patch: { is_suspended: false },
  });
  if (guard.outcome === "error") {
    console.error("[admin] unsuspend failed:", guard.message);
    return { success: false, error: "unknown" };
  }
  if (guard.outcome === "already_resolved") {
    return { success: false, error: "wrong_state" };
  }

  await supabase.from("admin_actions").insert({
    admin_user_id: admin.id,
    action_type: "unsuspend_user",
    target_user_id: parsed.data.user_id,
  });

  // Lift the auth-level ban applied on suspend.
  const service = createServiceRoleClient();
  await service.auth.admin
    .updateUserById(parsed.data.user_id, { ban_duration: "none" })
    .catch((err) => console.error("[admin] auth unban failed:", err));

  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  return { success: true };
}

/**
 * Remove (soft delete) an account. Cancels any active Stripe
 * subscriptions (shared with the self-serve delete path, see
 * cancelActiveStripeSubscriptions), marks the user as deleted, and adds
 * the email to blocked_emails so the same address can't sign up again.
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

  // Claim the row FIRST, before anything irreversible. Suspend and unsuspend
  // were moved onto the guard in #652 and remove was left behind (#663): it read
  // is_deleted, compared it here, then wrote by id alone, so two admins clicking
  // at once both passed the check and both went on to cancel this person's Stripe
  // subscriptions and mail them that their account was gone. The cancel used to
  // run above this write, which meant even the LOSER reached Stripe.
  const guard = await guardedStatusUpdate(service, {
    table: "users",
    id: parsed.data.user_id,
    statusColumn: "is_deleted",
    expectedStatus: false,
    patch: { is_deleted: true, is_suspended: false },
  });
  if (guard.outcome === "error") {
    console.error("[admin] remove failed:", guard.message);
    return { success: false, error: "unknown" };
  }
  if (guard.outcome === "already_resolved") {
    return { success: false, error: "wrong_state" };
  }

  // Only the winner gets here, so the cancellation runs exactly once.
  await cancelActiveStripeSubscriptions(service, parsed.data.user_id);

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

  // Ban them at the auth level so their tokens stop validating. Best-effort;
  // getCurrentUser also treats is_deleted as logged out. (admin.signOut takes
  // a JWT, not a user id, so it can't revoke by id.)
  await service.auth.admin
    .updateUserById(parsed.data.user_id, { ban_duration: "876000h" })
    .catch((err) => console.error("[admin] auth ban on remove failed:", err));

  after(() =>
    sendAccountRemovedEmail({
      to: target.email,
      firstName: target.first_name ?? undefined,
      reason: parsed.data.reason,
    }).catch((err) => console.error("[email] account removed failed:", err)),
  );

  revalidatePath("/admin");
  revalidatePath("/admin/accounts");
  return { success: true };
}
