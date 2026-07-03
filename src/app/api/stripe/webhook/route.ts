import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { getStripe } from "@/lib/stripe/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { GRACE_PERIODS } from "@/lib/constants";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { captureServerEvent } from "@/lib/analytics/server";
import { shouldSendOnce } from "@/lib/cron/email-log";
import { slackPost, OPS_CHANNEL_ID } from "@/lib/slack/client";
import {
  sendSubscriptionConfirmedEmail,
  sendRenewalSuccessEmail,
  sendCancellationConfirmationEmail,
} from "@/lib/email/send";

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
        await handleCheckoutCompleted(event.data.object, event.created);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpserted(event.data.object, event.created);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object, event.created);
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
    Sentry.captureException(err, {
      tags: { action: "stripe-webhook", event_type: event.type },
      extra: { event_id: event.id },
    });
    // Best-effort: a failed alert must not mask the real 500, which is
    // what actually tells Stripe to retry (#396).
    await alertOpsSlack(event, err).catch((slackErr) =>
      console.error("[stripe-webhook] slack alert failed:", slackErr),
    );
    return NextResponse.json(
      { error: "Internal error processing webhook" },
      { status: 500 },
    );
  }
}

async function alertOpsSlack(event: Stripe.Event, err: unknown): Promise<void> {
  // Stripe retries a failing event repeatedly over hours to days; only
  // alert once per event id so a stuck webhook doesn't flood the channel
  // with the same failure. Sentry capture (above) isn't deduped here since
  // Sentry already groups identical errors into one issue by fingerprint.
  const supabase = createServiceRoleClient();
  const { data: alreadyAlerted } = await supabase
    .from("webhook_alert_log")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (alreadyAlerted) return;

  const message = err instanceof Error ? err.message : String(err);
  await slackPost("chat.postMessage", {
    channel: OPS_CHANNEL_ID,
    text: `🚨 Stripe webhook failed: \`${event.type}\` (event \`${event.id}\`)\n${message}`,
  });
  await supabase.from("webhook_alert_log").insert({ event_id: event.id });
}

// ── Handlers ──────────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventCreated: number,
) {
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
  await upsertSubscription(
    { userId, planType, customerId, subscription: sub },
    eventCreated,
  );

  // Welcome email, dedup by subscription id so a retried webhook
  // doesn't fire it twice.
  await maybeNotifyConfirmed({ userId, planType, subscription: sub });

  // Funnel completion. Captured here rather than on the client because the
  // buyer may close the tab on Stripe's confirmation page and never return.
  await captureServerEvent({
    distinctId: userId,
    event: ANALYTICS_EVENTS.SUBSCRIPTION_COMPLETED,
    properties: {
      plan: planType,
      interval:
        sub.items.data[0]?.price?.recurring?.interval === "year"
          ? "year"
          : "month",
      source: "stripe_webhook",
    },
  });
}

async function handleSubscriptionUpserted(
  sub: Stripe.Subscription,
  eventCreated: number,
) {
  // sub.metadata may carry user_id + plan_type if we created it via
  // Checkout (see createCheckoutSession). For older subs we may need to
  // look up by stripe_subscription_id.
  const supabase = createServiceRoleClient();
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("user_id, plan_type, cancel_at_period_end")
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
  const applied = await upsertSubscription(
    { userId, planType, customerId, subscription: sub },
    eventCreated,
  );
  // An out-of-order event that was ignored didn't change stored state, so
  // its cancel_at_period_end can't be trusted as a real transition either.
  if (!applied) return;

  // Cancellation confirmation: fires the moment cancel_at_period_end
  // transitions from false (or undefined for a brand new row) to true.
  // The user-initiated cancel via Customer Portal triggers this update.
  const wasCancelling = existing?.cancel_at_period_end === true;
  const isCancelling = sub.cancel_at_period_end === true;
  if (!wasCancelling && isCancelling) {
    await maybeNotifyCancellation({ userId, planType, subscription: sub });
  }
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  eventCreated: number,
) {
  const supabase = createServiceRoleClient();
  const { data: row } = await supabase
    .from("subscriptions")
    .select("user_id, plan_type, last_event_at")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  // Fall back to the event's own metadata when no row exists yet (e.g. a
  // delete delivered before its create), so cleanup can proceed regardless
  // of event order rather than silently skipping (#428).
  const userId =
    row?.user_id ?? (sub.metadata?.user_id as string | undefined);
  const planType =
    row?.plan_type ??
    (sub.metadata?.plan_type as "nurse_featured" | "family_access" | undefined);
  if (!userId || !planType) {
    console.warn(
      "[stripe-webhook] subscription.deleted without user_id/plan_type",
      { subId: sub.id },
    );
    return;
  }

  if (row?.last_event_at && eventCreated < toUnixSeconds(row.last_event_at)) {
    // Stale/out-of-order delete: a newer event already superseded it.
    return;
  }

  assertNoWriteError(
    await supabase
      .from("subscriptions")
      .update({
        status: "cancelled",
        cancel_at_period_end: false,
        last_event_at: new Date(eventCreated * 1000).toISOString(),
      })
      .eq("stripe_subscription_id", sub.id),
    "subscriptions update (subscription deleted)",
  );

  // Tier sync: if a featured nurse's sub goes away, drop them to free.
  if (planType === "nurse_featured") {
    assertNoWriteError(
      await supabase
        .from("nurse_profiles")
        .update({ tier: "free" })
        .eq("user_id", userId),
      "nurse_profiles tier downgrade (subscription deleted)",
    );
  }

  // Family cancellation: set 60-day access window on existing reveals so
  // they can still see contact info for nurses they revealed before.
  if (planType === "family_access") {
    const expires = new Date();
    expires.setUTCDate(
      expires.getUTCDate() + GRACE_PERIODS.CANCELLED_ACCESS_DAYS,
    );
    assertNoWriteError(
      await supabase
        .from("reveals")
        .update({ access_expires_at: expires.toISOString() })
        .eq("family_user_id", userId)
        .is("access_expires_at", null),
      "reveals access window (subscription deleted)",
    );
  }

  await captureServerEvent({
    distinctId: userId,
    event: ANALYTICS_EVENTS.SUBSCRIPTION_CANCELLED,
    properties: { plan: planType, source: "stripe_webhook" },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;
  const supabase = createServiceRoleClient();

  // Retrieve up front (not just on the renewal-email path below) so the
  // period dates refresh on every paid invoice, not only once a separate
  // customer.subscription.updated event happens to arrive (#423).
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subId);
  const item = sub.items.data[0];

  assertNoWriteError(
    await supabase
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: new Date(
          item.current_period_start * 1000,
        ).toISOString(),
        current_period_end: new Date(item.current_period_end * 1000).toISOString(),
      })
      .eq("stripe_subscription_id", subId),
    "subscriptions status update (invoice paid)",
  );

  // Renewal email: fire only on recurring renewals, not the initial
  // subscription_create invoice (the welcome email handles that).
  if (invoice.billing_reason !== "subscription_cycle") return;

  const { data: row } = await supabase
    .from("subscriptions")
    .select("user_id, plan_type")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (!row) return;

  await maybeNotifyRenewal({
    userId: row.user_id,
    planType: row.plan_type as "nurse_featured" | "family_access",
    subscription: sub,
    invoiceId: invoice.id ?? subId,
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;
  const supabase = createServiceRoleClient();
  assertNoWriteError(
    await supabase
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("stripe_subscription_id", subId),
    "subscriptions status update (payment failed)",
  );
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * A Supabase write returning {error} does not throw, so an unchecked write
 * failure here would return {received:true} 200 and Stripe would never
 * retry, silently diverging billing state from the DB. Throwing sends the
 * error through POST's catch, which returns 500 so Stripe retries.
 */
function assertNoWriteError(
  result: { error: { message: string } | null },
  context: string,
): void {
  if (result.error) {
    throw new Error(`${context} failed: ${result.error.message}`);
  }
}

/** Stripe event timestamps are unix seconds; last_event_at is stored as an ISO string. */
function toUnixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

interface UpsertArgs {
  userId: string;
  planType: "nurse_featured" | "family_access";
  customerId: string;
  subscription: Stripe.Subscription;
}

/**
 * Returns whether the write was applied. Stripe gives no ordering guarantee
 * on webhook delivery, so an older event arriving after a newer one has
 * already been applied is ignored rather than reverting state (#414).
 */
async function upsertSubscription(
  args: UpsertArgs,
  eventCreated: number,
): Promise<boolean> {
  const { userId, planType, customerId, subscription } = args;
  const supabase = createServiceRoleClient();

  const { data: current } = await supabase
    .from("subscriptions")
    .select("last_event_at")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (current?.last_event_at && eventCreated < toUnixSeconds(current.last_event_at)) {
    return false;
  }

  const status = mapStripeStatus(subscription.status);
  // In Stripe API 2025-x, current_period_start/end moved from the
  // Subscription onto each SubscriptionItem. Our subscriptions have one
  // item, so the first item's period is the subscription's period.
  const item = subscription.items.data[0];
  const periodStart = new Date(item.current_period_start * 1000).toISOString();
  const periodEnd = new Date(item.current_period_end * 1000).toISOString();
  // Billing cadence drives renewal-reminder amounts and MRR. Stripe reports
  // 'month' or 'year' (or 'day'/'week', which we don't sell); anything other
  // than 'year' is treated as monthly to satisfy the column's check constraint.
  const billingInterval =
    item.price?.recurring?.interval === "year" ? "year" : "month";

  // Upsert by stripe_subscription_id so retries don't create duplicates.
  const upsertResult = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan_type: planType,
      status,
      billing_interval: billingInterval,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      last_event_at: new Date(eventCreated * 1000).toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (upsertResult.error?.code === "23505") {
    // A concurrent checkout already landed an active/past_due subscription
    // for this user+plan (uniq_subscriptions_active_per_plan, #417). This is
    // a genuine race, not a transient failure: retrying would hit the same
    // conflict forever. Cancel the newly-created duplicate on Stripe's side
    // so it doesn't keep billing, and skip the write.
    console.warn(
      "[stripe-webhook] duplicate active subscription rejected, cancelling",
      { subId: subscription.id, userId, planType },
    );
    try {
      await getStripe().subscriptions.cancel(subscription.id);
    } catch (err) {
      console.error(
        "[stripe-webhook] failed to cancel duplicate subscription",
        subscription.id,
        err,
      );
    }
    return false;
  }
  assertNoWriteError(upsertResult, "subscriptions upsert");

  // Tier sync for nurses: any active or trialing sub flips them to featured.
  if (planType === "nurse_featured") {
    const tier =
      status === "active" || status === "past_due" ? "featured" : "free";
    assertNoWriteError(
      await supabase.from("nurse_profiles").update({ tier }).eq("user_id", userId),
      "nurse_profiles tier sync",
    );
  }

  return true;
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

// ── Lifecycle email helpers ───────────────────────────────────

interface NotifyArgs {
  userId: string;
  planType: "nurse_featured" | "family_access";
  subscription: Stripe.Subscription;
}

function planLabel(planType: "nurse_featured" | "family_access"): string {
  return planType === "nurse_featured" ? "Featured" : "Family Access";
}

function planAmount(subscription: Stripe.Subscription): string {
  // Derive from the actual subscription price so monthly ($9.99) and annual
  // ($99/yr) render correctly. This is the recurring price; a first-year
  // annual subscriber is charged the promo amount on their first invoice but
  // the confirmation reflects the standard renewal price.
  const cents = subscription.items.data[0]?.price?.unit_amount ?? 0;
  return `$${(cents / 100).toFixed(2)}`;
}

function nextRenewalLabel(subscription: Stripe.Subscription): string {
  const item = subscription.items.data[0];
  return new Date(item.current_period_end * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function maybeNotifyConfirmed({
  userId,
  planType,
  subscription,
}: NotifyArgs): Promise<void> {
  const supabase = createServiceRoleClient();
  const ok = await shouldSendOnce(supabase, {
    recipientUserId: userId,
    emailType: "subscription_confirmed",
    dedupKey: subscription.id,
  });
  if (!ok) return;

  const { data: user } = await supabase
    .from("users")
    .select("email, first_name")
    .eq("id", userId)
    .maybeSingle();
  if (!user?.email) return;

  await sendSubscriptionConfirmedEmail({
    to: user.email,
    firstName: user.first_name ?? undefined,
    planType,
    amount: planAmount(subscription),
    nextRenewalLabel: nextRenewalLabel(subscription),
  });
}

async function maybeNotifyRenewal(
  args: NotifyArgs & { invoiceId: string },
): Promise<void> {
  const supabase = createServiceRoleClient();
  const ok = await shouldSendOnce(supabase, {
    recipientUserId: args.userId,
    emailType: "renewal_success",
    dedupKey: args.invoiceId,
  });
  if (!ok) return;

  const { data: user } = await supabase
    .from("users")
    .select("email, first_name")
    .eq("id", args.userId)
    .maybeSingle();
  if (!user?.email) return;

  await sendRenewalSuccessEmail({
    to: user.email,
    firstName: user.first_name ?? undefined,
    planLabel: planLabel(args.planType),
    amount: planAmount(args.subscription),
    nextRenewalLabel: nextRenewalLabel(args.subscription),
  });
}

async function maybeNotifyCancellation({
  userId,
  planType,
  subscription,
}: NotifyArgs): Promise<void> {
  const supabase = createServiceRoleClient();
  // Dedup by sub_id + period_end so resubscribe-then-cancel-again on a
  // future period correctly sends a fresh confirmation.
  const item = subscription.items.data[0];
  const dedupKey = `${subscription.id}:${item.current_period_end}`;
  const ok = await shouldSendOnce(supabase, {
    recipientUserId: userId,
    emailType: "cancellation_confirmation",
    dedupKey,
  });
  if (!ok) return;

  const { data: user } = await supabase
    .from("users")
    .select("email, first_name")
    .eq("id", userId)
    .maybeSingle();
  if (!user?.email) return;

  await sendCancellationConfirmationEmail({
    to: user.email,
    firstName: user.first_name ?? undefined,
    planLabel: planLabel(planType),
    accessUntilLabel: nextRenewalLabel(subscription),
    isFamily: planType === "family_access",
  });
}
