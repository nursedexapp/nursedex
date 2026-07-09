"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentUser } from "@/lib/auth/helpers";
import { hasActiveFamilyAccess } from "@/lib/subscriptions/queries";
import { getNurseContactInfo } from "@/lib/profile/queries";
import { verifyTurnstileToken } from "@/lib/turnstile/verify";

export interface RevealResult {
  success: boolean;
  error?:
    | "not_authenticated"
    | "wrong_role"
    | "no_subscription"
    | "needs_captcha"
    | "captcha_failed"
    | "rate_limited"
    | "unknown";
  // The contact fields are only returned on success, same shape as the
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
 * contact info without bumping the rate-limit counter.
 *
 * Rate limiting:
 * - Hard cap at RATE_LIMITS.REVEALS_HARD_CAP per UTC day
 * - Turnstile CAPTCHA required at RATE_LIMITS.REVEALS_CAPTCHA_THRESHOLD
 * - Accounts with RATE_LIMITS.CONSECUTIVE_CAPTCHA_DAYS_FLAG consecutive
 *   captcha-trigger days get flagged for admin review
 */
export async function revealNurse(
  nurseUserId: string,
  turnstileToken?: string,
): Promise<RevealResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "not_authenticated" };
  if (user.role !== "family") return { success: false, error: "wrong_role" };

  const hasAccess = await hasActiveFamilyAccess(user.id);
  if (!hasAccess) return { success: false, error: "no_subscription" };

  const supabase = await createClient();

  // Already revealed? Idempotent, return contact without rate-limit bump.
  const { data: existing } = await supabase
    .from("reveals")
    .select("id")
    .eq("family_user_id", user.id)
    .eq("nurse_user_id", nurseUserId)
    .maybeSingle();

  if (existing) {
    return await fetchContactResult(nurseUserId);
  }

  // Rate limit check via DB function (atomic read).
  const { data: rate } = await supabase
    .rpc("check_reveal_rate_limit", { p_family_user_id: user.id })
    .single();
  type RateRow = {
    allowed: boolean | null;
    current_count: number | null;
    needs_captcha: boolean | null;
  };
  // Defensive: the RPC can return NULL fields for a family with no reveals
  // yet today (no rate_limit_reveals row). NULL means zero reveals, which is
  // allowed, so coerce rather than letting !null read as rate-limited.
  const raw = rate as RateRow | null;
  const rl = {
    allowed: raw?.allowed ?? true,
    current_count: raw?.current_count ?? 0,
    needs_captcha: raw?.needs_captcha ?? false,
  };

  if (!rl.allowed) {
    return { success: false, error: "rate_limited" };
  }

  if (rl.needs_captcha) {
    if (!turnstileToken) return { success: false, error: "needs_captcha" };
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      undefined;
    const ok = await verifyTurnstileToken(turnstileToken, ip);
    if (!ok) return { success: false, error: "captcha_failed" };
  }

  // Atomically consume a slot. This, not the advisory check above, is the
  // real cap gate: it increments and enforces the cap in one statement, so a
  // burst of concurrent reveals can neither lose an increment nor slip past
  // REVEALS_HARD_CAP between the check and the insert.
  const consumed = await consumeRateLimit(user.id, rl.needs_captcha);
  if (!consumed) return { success: false, error: "unknown" };
  if (!consumed.allowed) return { success: false, error: "rate_limited" };

  // Insert the reveal. Consuming first means a failed insert burns a slot
  // rather than reopening the race; over-counting is the safe direction.
  const { error: revealErr } = await supabase.from("reveals").insert({
    family_user_id: user.id,
    nurse_user_id: nurseUserId,
  });
  if (revealErr) return { success: false, error: "unknown" };

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

  // Invalidate the cached listing and dashboard so the new reveal shows up
  // (badge + bottom-sort, recent reveals) without a hard refresh when the
  // family navigates back.
  revalidatePath("/nurses");
  revalidatePath("/dashboard");

  return await fetchContactResult(nurseUserId);
}

async function fetchContactResult(nurseUserId: string): Promise<RevealResult> {
  // RLS doesn't grant a family read access to a nurse's users row, so a
  // direct join returns nothing. Go through the SECURITY DEFINER RPC, the
  // same gated path the public profile uses, now that the reveal row exists.
  const contact = await getNurseContactInfo(nurseUserId);
  if (!contact.email && !contact.phone) {
    return { success: false, error: "unknown" };
  }
  return { success: true, contact };
}

/**
 * Atomically claim one reveal against today's cap.
 *
 * Delegates the whole read-increment-guard sequence to the
 * consume_reveal_rate_limit RPC, which performs it as a single upsert. Doing
 * the increment in JavaScript was a lost-update race, and checking the cap
 * before the insert was a check-then-act race (issue #563).
 *
 * Returns null when the RPC fails, so the caller can fail loud rather than
 * treating an unknown counter state as a granted reveal.
 */
async function consumeRateLimit(
  familyUserId: string,
  triggeredCaptcha: boolean,
): Promise<{ allowed: boolean } | null> {
  // The daily counter is system-managed: rate_limit_reveals has no INSERT
  // RLS policy (families must not be able to write their own limit), and the
  // RPC only grants EXECUTE to service_role, so go through that client.
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .rpc("consume_reveal_rate_limit", {
      p_family_user_id: familyUserId,
      p_triggered_captcha: triggeredCaptcha,
    })
    .single();

  if (error || !data) return null;

  // Fail closed: an unexpectedly NULL `allowed` denies the reveal rather
  // than granting it.
  return { allowed: (data as { allowed: boolean | null }).allowed ?? false };
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
