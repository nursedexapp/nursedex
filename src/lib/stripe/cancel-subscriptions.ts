import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "./server";

/**
 * Cancels every Stripe subscription still active in our DB for a user.
 * Shared by both account-removal paths (admin remove, self-serve delete)
 * so they can't diverge again. Each cancel is best-effort: a Stripe
 * failure is logged, not thrown, so the caller's account-removal flow
 * still completes even if Stripe is briefly unavailable; webhook handlers
 * will sync state if Stripe eventually emits a cancellation event.
 */
export async function cancelActiveStripeSubscriptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId);

  const stripe = getStripe();
  for (const sub of (subs ?? []) as Array<{
    stripe_subscription_id: string | null;
    status: string;
  }>) {
    if (!sub.stripe_subscription_id) continue;
    // App-stored enum values ('cancelled'/'expired'), not Stripe's own
    // spelling ('canceled') — see #424.
    if (sub.status === "cancelled" || sub.status === "expired") continue;
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (err) {
      console.error(
        "[stripe] cancel failed for",
        sub.stripe_subscription_id,
        err,
      );
    }
  }
}
