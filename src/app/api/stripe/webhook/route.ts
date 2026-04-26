import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { GRACE_PERIODS } from "@/lib/constants";

// Stripe requires the raw body for signature verification.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${msg}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpserted(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      default:
        // Unhandled events: ignore but ack so Stripe doesn't retry.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // Returning a non-2xx tells Stripe to retry. We log and rethrow only
    // for genuinely transient issues; everything else should be acked.
    console.error("[stripe-webhook]", event.type, err);
    return NextResponse.json(
      { error: "Internal error processing webhook" },
      { status: 500 },
    );
  }
}

// ── Handlers ──────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // We rely on the Stripe-hosted Checkout to attach the user id as
  // client_reference_id and the plan_type via metadata.
  const userId = session.client_reference_id;
  const planType = session.metadata?.plan_type as
    | "nurse_featured"
    | "family_access"
    | undefined;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!userId || !planType || !customerId || !subscriptionId) {
    console.warn("[stripe-webhook] checkout.session.completed missing fields", {
      userId,
      planType,
      customerId,
      subscriptionId,
    });
    return;
  }

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertSubscription({ userId, planType, customerId, subscription: sub });
}

async function handleSubscriptionUpserted(sub: Stripe.Subscription) {
  // sub.metadata may carry user_id + plan_type if we created it via
  // Checkout (see createCheckoutSession). For older subs we may need to
  // look up by stripe_subscription_id.
  const supabase = createServiceRoleClient();
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("user_id, plan_type")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  const userId =
    existing?.user_id ?? (sub.metadata?.user_id as string | undefined);
  const planType =
    existing?.plan_type ??
    (sub.metadata?.plan_type as "nurse_featured" | "family_access" | undefined);

  if (!userId || !planType) {
    console.warn(
      "[stripe-webhook] subscription event without user_id/plan_type",
      { subId: sub.id },
    );
    return;
  }

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await upsertSubscription({ userId, planType, customerId, subscription: sub });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const supabase = createServiceRoleClient();
  const { data: row } = await supabase
    .from("subscriptions")
    .select("user_id, plan_type")
    .eq("stripe_subscription_id", sub.id)
    .single();
  if (!row) return;

  await supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancel_at_period_end: false,
    })
    .eq("stripe_subscription_id", sub.id);

  // Tier sync: if a featured nurse's sub goes away, drop them to free.
  if (row.plan_type === "nurse_featured") {
    await supabase
      .from("nurse_profiles")
      .update({ tier: "free" })
      .eq("user_id", row.user_id);
  }

  // Family cancellation: set 60-day access window on existing reveals so
  // they can still see contact info for nurses they revealed before.
  if (row.plan_type === "family_access") {
    const expires = new Date();
    expires.setUTCDate(
      expires.getUTCDate() + GRACE_PERIODS.CANCELLED_ACCESS_DAYS,
    );
    await supabase
      .from("reveals")
      .update({ access_expires_at: expires.toISOString() })
      .eq("family_user_id", row.user_id)
      .is("access_expires_at", null);
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;
  const supabase = createServiceRoleClient();
  await supabase
    .from("subscriptions")
    .update({ status: "active" })
    .eq("stripe_subscription_id", subId);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;
  const supabase = createServiceRoleClient();
  await supabase
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subId);
}

// ── Helpers ───────────────────────────────────────────────────

interface UpsertArgs {
  userId: string;
  planType: "nurse_featured" | "family_access";
  customerId: string;
  subscription: Stripe.Subscription;
}

async function upsertSubscription(args: UpsertArgs) {
  const { userId, planType, customerId, subscription } = args;
  const supabase = createServiceRoleClient();

  const status = mapStripeStatus(subscription.status);
  // In Stripe API 2025-x, current_period_start/end moved from the
  // Subscription onto each SubscriptionItem. Our subscriptions have one
  // item, so the first item's period is the subscription's period.
  const item = subscription.items.data[0];
  const periodStart = new Date(item.current_period_start * 1000).toISOString();
  const periodEnd = new Date(item.current_period_end * 1000).toISOString();

  // Upsert by stripe_subscription_id so retries don't create duplicates.
  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan_type: planType,
      status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    },
    { onConflict: "stripe_subscription_id" },
  );

  // Tier sync for nurses: any active or trialing sub flips them to featured.
  if (planType === "nurse_featured") {
    const tier =
      status === "active" || status === "past_due" ? "featured" : "free";
    await supabase
      .from("nurse_profiles")
      .update({ tier })
      .eq("user_id", userId);
  }
}

function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status,
): "active" | "past_due" | "cancelled" | "expired" {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    case "incomplete":
    case "paused":
      return "past_due";
    default:
      return "expired";
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // In Stripe API 2025-x, the subscription association moved under
  // invoice.parent.subscription_details.subscription.
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}
