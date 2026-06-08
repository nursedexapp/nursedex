"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/helpers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  newsletterSchema,
  newsletterIssueSchema,
} from "@/lib/schemas/newsletter";
import { clientIpFrom, hashIp } from "@/lib/rate-limit";
import { chunk } from "@/lib/chunk";
import { getConfirmedSubscribers } from "./queries";
import {
  sendNewsletterConfirmEmail,
  sendNewsletterWelcomeEmail,
  sendNewsletterBatch,
} from "@/lib/email/send";

export interface NewsletterResult {
  success: boolean;
  error?: "invalid" | "unknown" | "rate_limited";
  fieldErrors?: Record<string, string>;
}

// Max new subscriptions per IP per hour (each sends a confirmation email).
const RATE_LIMIT_PER_HOUR = 5;

/**
 * Subscribe an email to the blog newsletter (double opt-in). A new or
 * still-unconfirmed address is stored with a fresh confirmation token and
 * sent a confirmation email; an already-confirmed address succeeds silently
 * with no email (no enumeration, no duplicate confirmations). A filled
 * honeypot is silently accepted. Service-role, so the unique email
 * constraint is the arbiter.
 */
export async function subscribeNewsletter(
  raw: unknown,
): Promise<NewsletterResult> {
  const parsed = newsletterSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input = parsed.data;

  if (input.website) return { success: true }; // honeypot

  const supabase = createServiceRoleClient();

  // Rate limit new subscriptions per network so the endpoint cannot be used
  // to blast confirmation emails at many addresses.
  const ipHash = await hashIp(
    clientIpFrom((await headers()).get("x-forwarded-for")),
  );
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", oneHourAgo);
  if (count !== null && count >= RATE_LIMIT_PER_HOUR) {
    return { success: false, error: "rate_limited" };
  }

  const { data: existing } = await supabase
    .from("newsletter_subscribers")
    .select("id, confirmed_at, unsubscribed_at")
    .eq("email", input.email)
    .maybeSingle();
  const ex = existing as {
    id: string;
    confirmed_at: string | null;
    unsubscribed_at: string | null;
  } | null;
  if (ex?.confirmed_at) {
    // Already confirmed: re-subscribe silently if they had unsubscribed,
    // otherwise nothing to do (and no enumeration).
    if (ex.unsubscribed_at) {
      await supabase
        .from("newsletter_subscribers")
        .update({ unsubscribed_at: null })
        .eq("id", ex.id);
    }
    return { success: true };
  }

  // New or unconfirmed: (re)issue a token. confirmed_at is never in the
  // payload, so a confirmed row could not be reset by a racing upsert.
  const token = crypto.randomUUID();
  const { error } = await supabase.from("newsletter_subscribers").upsert(
    {
      email: input.email,
      source: input.source || null,
      confirmation_token: token,
      ip_hash: ipHash,
    },
    { onConflict: "email" },
  );
  if (error) {
    console.error("[newsletter] subscribe failed:", error.message);
    return { success: false, error: "unknown" };
  }

  await sendNewsletterConfirmEmail(input.email, token);
  return { success: true };
}

export type ConfirmResult = "confirmed" | "already" | "invalid";

/**
 * Confirm a subscription from the emailed link. Idempotent: re-visiting the
 * link after confirming reports "already" without re-sending the welcome.
 */
export async function confirmNewsletter(token: string): Promise<ConfirmResult> {
  if (!token) return "invalid";
  const supabase = createServiceRoleClient();

  const { data: sub } = await supabase
    .from("newsletter_subscribers")
    .select("id, email, confirmed_at")
    .eq("confirmation_token", token)
    .maybeSingle();
  const row = sub as
    | { id: string; email: string; confirmed_at: string | null }
    | null;
  if (!row) return "invalid";
  if (row.confirmed_at) return "already";

  const { error } = await supabase
    .from("newsletter_subscribers")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) {
    console.error("[newsletter] confirm failed:", error.message);
    return "invalid";
  }

  await sendNewsletterWelcomeEmail(row.email);
  return "confirmed";
}

export interface SendIssueResult {
  success: boolean;
  error?: "invalid" | "unknown";
  sent?: number;
  fieldErrors?: Record<string, string>;
}

const NEWSLETTER_BATCH_SIZE = 100; // Resend batch limit

/**
 * Send a newsletter issue to every confirmed, not-unsubscribed subscriber.
 * Admin only. Each email carries the recipient's unsubscribe link.
 */
export async function sendNewsletterIssue(
  raw: unknown,
): Promise<SendIssueResult> {
  await requireAdmin();

  const parsed = newsletterIssueSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const { subject, body } = parsed.data;

  const recipients = await getConfirmedSubscribers();
  if (recipients.length === 0) return { success: true, sent: 0 };

  let sent = 0;
  for (const batch of chunk(recipients, NEWSLETTER_BATCH_SIZE)) {
    const ok = await sendNewsletterBatch(subject, body, batch);
    if (ok) sent += batch.length;
  }
  return { success: true, sent };
}

export type UnsubscribeResult = "ok" | "invalid";

/** Unsubscribe by token (from the email footer). Idempotent. */
export async function unsubscribeNewsletter(
  token: string,
): Promise<UnsubscribeResult> {
  if (!token) return "invalid";
  const supabase = createServiceRoleClient();

  const { data: sub } = await supabase
    .from("newsletter_subscribers")
    .select("id, unsubscribed_at")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  const row = sub as { id: string; unsubscribed_at: string | null } | null;
  if (!row) return "invalid";

  if (!row.unsubscribed_at) {
    await supabase
      .from("newsletter_subscribers")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("id", row.id);
  }
  return "ok";
}
