"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/helpers";
import { hasActiveFamilyAccess } from "@/lib/subscriptions/queries";

export interface RevealResult {
  success: boolean;
  error?:
    | "not_authenticated"
    | "wrong_role"
    | "no_subscription"
    | "rate_limited"
    | "unknown";
  // The contact fields are only returned on success — same shape as the
  // public profile so the page can re-render with them.
  contact?: {
    email: string | null;
    phone: string | null;
    communication_preference: string | null;
  };
}

/**
 * Reveal a nurse's contact info to the current family user.
 *
 * Idempotent: re-revealing an already-revealed nurse just returns the
 * contact info without creating a new row.
 *
 * Rate limiting (Phase 4 next slice): the daily reveal counter check goes
 * here. For this slice we assume any active subscription = unlimited.
 */
export async function revealNurse(nurseUserId: string): Promise<RevealResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "not_authenticated" };
  if (user.role !== "family") return { success: false, error: "wrong_role" };

  const hasAccess = await hasActiveFamilyAccess(user.id);
  if (!hasAccess) return { success: false, error: "no_subscription" };

  const supabase = await createClient();

  // Already revealed?
  const { data: existing } = await supabase
    .from("reveals")
    .select("id")
    .eq("family_user_id", user.id)
    .eq("nurse_user_id", nurseUserId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("reveals").insert({
      family_user_id: user.id,
      nurse_user_id: nurseUserId,
    });
    if (error) {
      return { success: false, error: "unknown" };
    }
    // Best-effort analytics increment.
    await supabase
      .rpc("increment_nurse_analytics", {
        p_nurse_user_id: nurseUserId,
        p_field: "reveals",
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }

  // Fetch the nurse's contact fields. RLS on users only lets us read our
  // own row, so we go through nurse_profiles → users join with the
  // service-equivalent of "public profile" lookup. We re-use the existing
  // getNurseBySlug shape but by user_id.
  const { data: row } = await supabase
    .from("nurse_profiles")
    .select(
      `
      user_id,
      users!inner ( email, phone, communication_preference )
    `,
    )
    .eq("user_id", nurseUserId)
    .single();

  if (!row) return { success: false, error: "unknown" };

  type Joined = {
    user_id: string;
    users: {
      email: string;
      phone: string | null;
      communication_preference: string | null;
    } | null;
  };
  const u = (row as unknown as Joined).users;
  return {
    success: true,
    contact: {
      email: u?.email ?? null,
      phone: u?.phone ?? null,
      communication_preference: u?.communication_preference ?? null,
    },
  };
}

/**
 * Whether the current user has an unexpired reveal of this nurse. Used by
 * the public profile page to decide whether to render the contact-info
 * card vs the paywall.
 */
export async function hasRevealedNurse(nurseUserId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || user.role !== "family") return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("reveals")
    .select("access_expires_at")
    .eq("family_user_id", user.id)
    .eq("nurse_user_id", nurseUserId)
    .maybeSingle();

  if (!data) return false;
  if (!data.access_expires_at) return true;
  return new Date(data.access_expires_at) > new Date();
}
