import "server-only";
import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Pinned to the version the installed stripe SDK ships with (its types only
 * accept this literal), so bumping the SDK fails the typecheck until this
 * constant is consciously updated. The webhook endpoints (sandbox and live)
 * were created at 2026-03-25.dahlia, one monthly release behind: same major,
 * so payload shapes are compatible. Stripe doesn't allow changing api_version
 * on an existing webhook endpoint, so if an SDK bump ever crosses into a new
 * major version, recreate the endpoints at that version and rotate
 * STRIPE_WEBHOOK_SECRET in the same change.
 */
const STRIPE_API_VERSION = "2026-04-22.dahlia";

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
