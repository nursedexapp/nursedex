import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_type: "nurse_featured" | "family_access";
  status: "active" | "past_due" | "cancelled" | "expired";
  current_period_end: string;
  cancel_at_period_end: boolean;
  stripe_customer_id: string;
  stripe_subscription_id: string;
}

/**
 * Returns the user's active or past_due subscription for a given plan, or
 * null. past_due is treated as still-active during the grace period; the
 * payment-failure cron downgrades to expired after that.
 */
export async function getActiveSubscription(
  userId: string,
  planType: "nurse_featured" | "family_access",
): Promise<SubscriptionRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, user_id, plan_type, status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id",
    )
    .eq("user_id", userId)
    .eq("plan_type", planType)
    .in("status", ["active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A failed read is NOT "no subscription". This used to ignore `error`, so any
  // failure to read the table came back as a confident "this family has no
  // subscription": a paying family would be shown the paywall, and revealNurse
  // would refuse them with no_subscription, with nothing anywhere reporting a
  // fault. It decides whether somebody who has paid gets what they paid for
  // (L215, L10), and it is the same defect fixed in hasRevealedNurse.
  if (error) {
    throw new Error(
      `The ${planType} subscription for ${userId} could not be read: ` +
        `${error.message}`,
    );
  }

  return (data as SubscriptionRow | null) ?? null;
}

/**
 * Convenience: a family is considered to have access if they have an active
 * (or past_due grace) Family Access subscription. Cancelled subs in the
 * 60-day window do NOT grant new reveals, they only preserve access to
 * already-revealed nurses (handled per-row via reveals.access_expires_at).
 */
export async function hasActiveFamilyAccess(userId: string): Promise<boolean> {
  const sub = await getActiveSubscription(userId, "family_access");
  return sub !== null;
}
