"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/helpers";
import { hasActiveFamilyAccess } from "@/lib/subscriptions/queries";
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
    allowed: boolean;
    current_count: number;
    needs_captcha: boolean;
  };
  const rl = (rate as RateRow | null) ?? {
    allowed: true,
    current_count: 0,
    needs_captcha: false,
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

  // Insert the reveal.
  const { error: revealErr } = await supabase.from("reveals").insert({
    family_user_id: user.id,
    nurse_user_id: nurseUserId,
  });
  if (revealErr) return { success: false, error: "unknown" };

  // Bump today's counter + flag captcha day if applicable.
  await bumpRateLimit(user.id, rl.needs_captcha);

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

  return await fetchContactResult(nurseUserId);
}

async function fetchContactResult(nurseUserId: string): Promise<RevealResult> {
  const supabase = await createClient();
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
 * Upsert today's rate_limit_reveals row: increment count, set
 * captcha_triggered, and bump consecutive_captcha_days when this is the
 * first captcha-trigger of the day.
 */
async function bumpRateLimit(
  familyUserId: string,
  triggeredCaptcha: boolean,
): Promise<void> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  const { data: existing } = await supabase
    .from("rate_limit_reveals")
    .select("reveal_count, captcha_triggered, consecutive_captcha_days")
    .eq("family_user_id", familyUserId)
    .eq("date", today)
    .maybeSingle();

  if (existing) {
    // Existing row: just bump count, set captcha flag if needed. Don't
    // re-bump consecutive_captcha_days within the same day.
    await supabase
      .from("rate_limit_reveals")
      .update({
        reveal_count: existing.reveal_count + 1,
        captcha_triggered: existing.captcha_triggered || triggeredCaptcha,
      })
      .eq("family_user_id", familyUserId)
      .eq("date", today);
    return;
  }

  // No row for today, first reveal of the day.
  let consecutive = 0;
  if (triggeredCaptcha) {
    // Look at yesterday's row. If it had a captcha trigger, carry the
    // streak forward; otherwise this is day 1.
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayDate = yesterday.toISOString().slice(0, 10);
    const { data: prior } = await supabase
      .from("rate_limit_reveals")
      .select("captcha_triggered, consecutive_captcha_days")
      .eq("family_user_id", familyUserId)
      .eq("date", yesterdayDate)
      .maybeSingle();
    consecutive = prior?.captcha_triggered
      ? (prior.consecutive_captcha_days ?? 0) + 1
      : 1;
  }

  await supabase.from("rate_limit_reveals").insert({
    family_user_id: familyUserId,
    date: today,
    reveal_count: 1,
    captcha_triggered: triggeredCaptcha,
    consecutive_captcha_days: consecutive,
  });
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
