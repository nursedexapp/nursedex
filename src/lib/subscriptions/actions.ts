"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe/server";
import { STRIPE_PLANS, type StripePlanType } from "@/lib/stripe/config";
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
): Promise<CheckoutResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const plan = STRIPE_PLANS[planType];
  if (!plan.priceId) {
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

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${cancelPath}`,
    customer: customerId,
    customer_email: customerId ? undefined : user.email,
    client_reference_id: user.id,
    metadata: { user_id: user.id, plan_type: planType },
    subscription_data: {
      metadata: { user_id: user.id, plan_type: planType },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) return { error: "Stripe didn't return a checkout URL." };
  return { url: session.url };
}

/**
 * Family Access: $19.99/mo, lets families reveal nurse contact info.
 * Caller is the paywall modal "Subscribe" button.
 */
export async function createFamilyAccessCheckout(args: {
  // Where to come back to after success — usually the nurse profile they
  // were trying to reveal so we can immediately reveal it.
  returnTo?: string;
}): Promise<CheckoutResult> {
  const successPath = args.returnTo
    ? `/api/stripe/checkout-success?next=${encodeURIComponent(args.returnTo)}`
    : "/api/stripe/checkout-success";
  const cancelPath = args.returnTo ?? "/dashboard";
  return createCheckoutSession("family_access", successPath, cancelPath);
}

/**
 * Nurse Featured: $29/mo, gives nurses priority placement.
 */
export async function createNurseFeaturedCheckout(): Promise<CheckoutResult> {
  return createCheckoutSession(
    "nurse_featured",
    "/api/stripe/checkout-success",
    "/dashboard",
  );
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
  const session = await getStripe().billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${origin}/dashboard`,
  });
  return { url: session.url };
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
