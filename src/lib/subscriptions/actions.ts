"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import {
  STRIPE_PLANS,
  familyAccessPriceId,
  STRIPE_FAMILY_ACCESS_ANNUAL_COUPON_ID,
  type StripePlanType,
  type BillingInterval,
} from "@/lib/stripe/config";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "./queries";

interface CheckoutResult {
  url?: string;
  error?: string;
}

/**
 * Create a Stripe Checkout Session for one of our subscription plans.
 * Returns the hosted URL; caller redirects the browser there.
 *
 * The plan_type goes into both metadata and client_reference_id so the
 * webhook can attribute the resulting subscription back to the right user
 * and plan without an extra DB lookup.
 */
async function createCheckoutSession(
  planType: StripePlanType,
  successPath: string,
  cancelPath: string,
  opts?: { priceId?: string; couponId?: string },
): Promise<CheckoutResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const plan = STRIPE_PLANS[planType];
  const priceId = opts?.priceId ?? plan.priceId;
  if (!priceId) {
    return {
      error: `Stripe price ID is not configured for ${planType}.`,
    };
  }

  // Block double-subscribing.
  const existing = await getActiveSubscription(user.id, planType);
  if (existing) {
    return {
      error:
        "You already have an active subscription. Visit the billing portal to manage it.",
    };
  }

  // Reuse the customer if we've ever made one for this user.
  let customerId: string | undefined;
  const supabase = await createClient();
  const { data: anyExisting } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (anyExisting?.stripe_customer_id) {
    customerId = anyExisting.stripe_customer_id;
  }

  const origin = await siteOrigin();

  // successPath may already carry a query string (e.g. the Featured flow
  // passes ?next=/dashboard?upgraded=featured). Pick the right separator so
  // we don't produce a second "?", which would fold session_id into the
  // last param and break the celebration's exact upgraded=featured check.
  const successSep = successPath.includes("?") ? "&" : "?";

  // Catching here keeps Stripe failures (bad coupon, misconfigured price,
  // network) as a toast-able { error } instead of an unhandled action crash.
  // Sentry's global handler never sees caught errors, so capture explicitly.
  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}${successPath}${successSep}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}`,
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      client_reference_id: user.id,
      metadata: { user_id: user.id, plan_type: planType },
      subscription_data: {
        metadata: { user_id: user.id, plan_type: planType },
      },
      // Stripe rejects allow_promotion_codes alongside an explicit discount, so
      // a fixed coupon (the annual first-year promo) and the open promo-code
      // field are mutually exclusive.
      ...(opts?.couponId
        ? { discounts: [{ coupon: opts.couponId }] }
        : { allow_promotion_codes: true }),
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "createCheckoutSession", plan_type: planType },
    });
    return { error: "Couldn't start checkout. Please try again." };
  }

  if (!session.url) return { error: "Stripe didn't return a checkout URL." };
  return { url: session.url };
}

/**
 * Family Access: lets families reveal nurse contact info.
 *   - monthly: $9.99/mo
 *   - annual:  $39.99 first year (via the promo coupon), then $99/yr
 * Caller is the paywall modal and the pricing page "Get Family Access" buttons.
 */
export async function createFamilyAccessCheckout(args: {
  // Where to come back to after success, usually the nurse profile they
  // were trying to reveal so we can immediately reveal it.
  returnTo?: string;
  // Billing cadence. Defaults to monthly.
  interval?: BillingInterval;
}): Promise<CheckoutResult> {
  const interval = args.interval ?? "month";
  // Land back where they were, with a flag so FamilyAccessCelebration fires
  // the "Welcome to Family Access" confetti + toast once. Pick the right
  // separator so we never produce a double "?".
  const base = args.returnTo ?? "/dashboard";
  const sep = base.includes("?") ? "&" : "?";
  const next = `${base}${sep}subscribed=family`;
  const successPath = `/api/stripe/checkout-success?next=${encodeURIComponent(next)}`;
  const cancelPath = args.returnTo ?? "/dashboard";
  return createCheckoutSession("family_access", successPath, cancelPath, {
    priceId: familyAccessPriceId(interval),
    couponId:
      interval === "year"
        ? STRIPE_FAMILY_ACCESS_ANNUAL_COUPON_ID || undefined
        : undefined,
  });
}

/**
 * Nurse Featured: $29/mo, gives nurses priority placement.
 */
export async function createNurseFeaturedCheckout(): Promise<CheckoutResult> {
  const successPath = `/api/stripe/checkout-success?next=${encodeURIComponent(
    "/dashboard?upgraded=featured",
  )}`;
  return createCheckoutSession("nurse_featured", successPath, "/dashboard");
}

/**
 * Returns a Stripe billing portal URL for the current user. Use for
 * "Manage subscription" CTAs on dashboards.
 */
export async function getCustomerPortalUrl(): Promise<CheckoutResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row?.stripe_customer_id) {
    return { error: "No Stripe customer record found." };
  }

  const origin = await siteOrigin();
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    });
    return { url: session.url };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "getCustomerPortalUrl" },
    });
    return { error: "Couldn't open the billing portal. Please try again." };
  }
}

/**
 * Helper for redirecting the browser to a Checkout URL. Server action
 * callers should `await redirectToCheckout(result)` rather than handling
 * the URL themselves.
 */
export async function redirectToCheckout(
  result: CheckoutResult,
): Promise<never> {
  if (result.url) redirect(result.url);
  // No URL means there was an error. Caller should surface it.
  throw new Error(result.error ?? "Checkout could not be created");
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "nursedex.com";
  return `${proto}://${host}`;
}
