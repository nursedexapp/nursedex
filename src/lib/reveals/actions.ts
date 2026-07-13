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
 * Rate limiting. The cap and captcha threshold are enforced by the
 * consume_reveal_rate_limit function, not by this file. The numbers in
 * RATE_LIMITS mirror it and are pinned to it by the live-database tests, so
 * changing one without a matching migration fails CI.
 * - Hard cap per UTC day (reveals reset at midnight UTC, not on a rolling
 *   24-hour window)
 * - Turnstile CAPTCHA required once the day's count reaches the threshold
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

  // Spend the slot and write the reveal in ONE database call (migration 059,
  // #691). They used to be two, and the gap between them was a real hole: two
  // attempts overlapping in it both passed the existing-reveal check above and
  // both paid, so the family lost two of their capped daily reveals and got one
  // nurse. `reveal_nurse` does the check, the spend and the write as one
  // transaction, and hands the slot back to whichever caller loses the race, so
  // a repeat, including a retry of a request still quietly in flight, spends
  // nothing.
  const revealed = await revealAtomically(
    user.id,
    nurseUserId,
    rl.needs_captcha,
  );
  if (!revealed) return { success: false, error: "unknown" };
  if (!revealed.allowed) return { success: false, error: "rate_limited" };

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
 * Claim one reveal against today's cap AND write the reveal, as one transaction.
 *
 * Spending the slot and writing the reveal used to be two round trips, and the
 * gap between them was a hole: two attempts that overlapped in it both passed
 * the existing-reveal check and both paid, so a family lost two of their capped
 * daily reveals and got one nurse (#691). The whole sequence now happens inside
 * `reveal_nurse` (migration 059), which spends nothing for a nurse the family
 * already has and hands the slot back to whichever caller loses the race.
 *
 * Returns null when the RPC fails, so the caller can fail loud rather than
 * treating an unknown counter state as a granted reveal.
 */
async function revealAtomically(
  familyUserId: string,
  nurseUserId: string,
  triggeredCaptcha: boolean,
): Promise<{ allowed: boolean; alreadyRevealed: boolean } | null> {
  // The daily counter is system-managed: rate_limit_reveals has no INSERT
  // RLS policy (families must not be able to write their own limit), and the
  // RPC only grants EXECUTE to service_role, so go through that client.
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .rpc("reveal_nurse", {
      p_family_user_id: familyUserId,
      p_nurse_user_id: nurseUserId,
      p_triggered_captcha: triggeredCaptcha,
    })
    .single();

  if (error || !data) return null;

  const row = data as {
    allowed: boolean | null;
    already_revealed: boolean | null;
  };

  // Fail closed: an unexpectedly NULL `allowed` denies the reveal rather
  // than granting it.
  return {
    allowed: row.allowed ?? false,
    alreadyRevealed: row.already_revealed ?? false,
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
