import "server-only";
import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Pinned to the version both webhook endpoints (sandbox and live) were
 * created with, so outgoing API calls and incoming webhook payloads always
 * share a shape. Stripe doesn't allow changing api_version on an existing
 * webhook endpoint: to upgrade, recreate the endpoints at the new version,
 * rotate STRIPE_WEBHOOK_SECRET, and bump this constant in the same change.
 */
const STRIPE_API_VERSION = "2026-03-25.dahlia";

/**
 * Lazy-initialized Stripe server client. Throws if STRIPE_SECRET_KEY isn't
 * set, that's intentional, callers should fail loudly rather than silently
 * no-op a payment-related action.
 */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set, cannot make Stripe API calls.",
    );
  }
  cached = new Stripe(key, {
    typescript: true,
    apiVersion: STRIPE_API_VERSION,
  });
  return cached;
}
