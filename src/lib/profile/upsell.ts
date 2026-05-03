import type { SupabaseClient } from "@supabase/supabase-js";
import type { NurseProfile } from "@/types/database";

export const UPSELL_SAVE_THRESHOLD = 1;
export const UPSELL_COOLDOWN_DAYS = 14;

type UpsellGateInput = Pick<
  NurseProfile,
  "tier" | "verification_status" | "save_count_for_upsell" | "last_upsell_shown_at"
>;

/**
 * Decide whether to surface the Featured upsell toast after a profile save.
 *
 * Pure function — easy to unit test. Caller passes `now` for determinism.
 */
export function shouldShowFeaturedUpsell(
  profile: UpsellGateInput,
  now: Date = new Date(),
): boolean {
  if (profile.tier === "featured") return false;
  if (profile.verification_status === "rejected") return false;
  if (profile.save_count_for_upsell < UPSELL_SAVE_THRESHOLD) return false;

  if (profile.last_upsell_shown_at) {
    const shownAt = new Date(profile.last_upsell_shown_at).getTime();
    const cooldownMs = UPSELL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (now.getTime() - shownAt < cooldownMs) return false;
  }

  return true;
}

export async function markUpsellShown(
  supabase: SupabaseClient,
  nurseUserId: string,
): Promise<void> {
  await supabase
    .from("nurse_profiles")
    .update({ last_upsell_shown_at: new Date().toISOString() })
    .eq("user_id", nurseUserId);
}
