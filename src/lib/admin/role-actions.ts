"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth/helpers";

import { toTypedFailure } from "@/lib/db/results";
export type RoleActionError =
  | "invalid"
  | "not_found"
  | "self_action"
  | "wrong_state"
  // The database could not be read, so nothing is known either way (#847).
  // Distinct from not_found, which is a claim about the row.
  | "lookup_failed"
  // The action applied but was not recorded in the admin log (#982). Retrying
  // cannot help, which is why it says something different.
  | "audit_unwritten"
  | "unknown";

export interface RoleActionResult {
  success: boolean;
  error?: RoleActionError;
}

const promoteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "super_admin"]),
});

const demoteSchema = z.object({
  user_id: z.string().uuid(),
});

/**
 * Look up a user by email and grant them admin or super_admin. Replaces
 * their existing role since the role column is a single value, so this
 * doubles as "promote a regular user" and "promote an admin to super
 * admin." Self-promotion of an already-super-admin is a no-op.
 */
export async function promoteToAdmin(raw: unknown): Promise<RoleActionResult> {
  const parsed = promoteSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  await requireSuperAdmin();
  const supabase = await createClient();

  const targetRead = await toTypedFailure(
    supabase
      .from("users")
      .select("id, role, is_deleted, is_suspended")
      .eq("email", parsed.data.email)
      .maybeSingle(),
    "users (promoteToAdmin)",
  );
  if (!targetRead.ok) return { success: false, error: "lookup_failed" };
  const target = targetRead.data;
  if (!target) return { success: false, error: "not_found" };
  if (target.is_deleted || target.is_suspended) {
    return { success: false, error: "wrong_state" };
  }
  if (target.role === parsed.data.role) {
    return { success: true }; // already at this role; no-op
  }

  const { error } = await supabase
    .from("users")
    .update({ role: parsed.data.role })
    .eq("id", target.id);
  if (error) {
    console.error("[admin] promote failed:", error.message);
    return { success: false, error: "unknown" };
  }

  revalidatePath("/admin/admins");
  return { success: true };
}

/**
 * Demote an admin/super_admin back to a regular user role. We default
 * demoted accounts to 'family' since that's the lowest-privilege role
 * they can navigate the app with; a true demotion to "no role" would
 * lock them out of the dashboard.
 */
export async function demoteAdmin(raw: unknown): Promise<RoleActionResult> {
  const parsed = demoteSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const me = await requireSuperAdmin();
  if (me.id === parsed.data.user_id) {
    return { success: false, error: "self_action" };
  }

  const supabase = await createClient();
  const targetRead = await toTypedFailure(
    supabase
      .from("users")
      .select("id, role")
      .eq("id", parsed.data.user_id)
      .maybeSingle(),
    "users (demoteAdmin)",
  );
  if (!targetRead.ok) return { success: false, error: "lookup_failed" };
  const target = targetRead.data;
  if (!target) return { success: false, error: "not_found" };
  if (target.role !== "admin" && target.role !== "super_admin") {
    return { success: false, error: "wrong_state" };
  }

  const { error } = await supabase
    .from("users")
    .update({ role: "family" })
    .eq("id", target.id);
  if (error) {
    console.error("[admin] demote failed:", error.message);
    return { success: false, error: "unknown" };
  }

  revalidatePath("/admin/admins");
  return { success: true };
}
