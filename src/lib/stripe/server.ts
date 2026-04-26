import "server-only";
import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Lazy-initialized Stripe server client. Throws if STRIPE_SECRET_KEY isn't
 * set — that's intentional, callers should fail loudly rather than silently
 * no-op a payment-related action.
 *
 * We don't pin apiVersion explicitly so we inherit whatever the installed
 * SDK ships with. Bump the SDK to upgrade.
 */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — cannot make Stripe API calls.",
    );
  }
  cached = new Stripe(key, { typescript: true });
  return cached;
}
