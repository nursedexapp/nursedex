"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/helpers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  newsletterSchema,
  newsletterIssueSchema,
  unsubscribeEmailSchema,
} from "@/lib/schemas/newsletter";
import { clientIpFrom, hashIp } from "@/lib/rate-limit";
import { chunk } from "@/lib/chunk";
import { getConfirmedSubscribers } from "./queries";
import {
  sendNewsletterConfirmEmail,
  sendNewsletterWelcomeEmail,
  sendNewsletterBatch,
} from "@/lib/email/send";

import { toTypedFailure, toTypedCount } from "@/lib/db/results";
export interface NewsletterResult {
  success: boolean;
  // "email_unsent" is distinct from "unknown" on purpose (#977): the row was
  // written and only the confirmation email failed, so the person can act on
  // it by submitting again, and the screen can say what actually went wrong
  // rather than "check your email" for an email that is not coming.
  error?: "invalid" | "unknown" | "rate_limited" | "email_unsent";
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
  // A failed count is NOT "nobody has subscribed from here recently" (#847).
  // The `count !== null` test reads a missing count as under the limit, which
  // opens the one gate stopping this endpoint being used to blast confirmation
  // emails at many addresses. A gate that opens when it cannot be read is not
  // a gate.
  const recent = await toTypedCount(
    supabase
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", oneHourAgo),
    "recent newsletter subscriptions from this network",
  );
  if (!recent.ok) return { success: false, error: "unknown" };
  if (recent.count >= RATE_LIMIT_PER_HOUR) {
    return { success: false, error: "rate_limited" };
  }

  const existingRead = await toTypedFailure(
    supabase
      .from("newsletter_subscribers")
      .select("id, confirmed_at, unsubscribed_at")
      .eq("email", input.email)
      .maybeSingle(),
    "an existing newsletter subscription for this address",
  );
  if (!existingRead.ok) return { success: false, error: "unknown" };
  const ex = existingRead.data as {
    id: string;
    confirmed_at: string | null;
    unsubscribed_at: string | null;
  } | null;
  if (ex?.unsubscribed_at) {
    // Re-subscribing after opting out: re-establish consent through the
    // double opt-in. Reset to unconfirmed, clear the unsubscribe, and send
    // a fresh confirmation email so the address is only re-activated once
    // the owner confirms again.
    const token = crypto.randomUUID();
    // Still-unsubscribed is the precondition, and it belongs in the WHERE clause
    // (#663). Two rapid submits both read unsubscribed_at as set, both wrote a
    // DIFFERENT confirmation token, and both mailed one: the first token was
    // already dead by the time its email arrived.
    const { data: claimed, error } = await supabase
      .from("newsletter_subscribers")
      .update({
        confirmation_token: token,
        confirmed_at: null,
        unsubscribed_at: null,
      })
      .eq("id", ex.id)
      .not("unsubscribed_at", "is", null)
      .select("id");
    if (error) {
      console.error("[newsletter] resubscribe failed:", error.message);
      return { success: false, error: "unknown" };
    }
    // A concurrent submit already re-opened the subscription and sent a live
    // token. Sending a second one would invalidate theirs.
    if (!claimed || claimed.length === 0) return { success: true };

    // Telling somebody to check their inbox for an email that did not go out
    // is the one answer they cannot act on (#977). A retry re-issues a fresh
    // token through the branch below, so saying so is safe as well as honest.
    if (!(await sendNewsletterConfirmEmail(input.email, token))) {
      return { success: false, error: "email_unsent" };
    }
    return { success: true };
  }
  if (ex?.confirmed_at) {
    // Already an active subscriber: nothing to do, and no enumeration.
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

  if (!(await sendNewsletterConfirmEmail(input.email, token))) {
    return { success: false, error: "email_unsent" };
  }
  return { success: true };
}

// "unavailable" is distinct from "invalid" on purpose (#847): "invalid" is a
// claim about the token in somebody's email, and a read that fell over cannot
// make it. Telling a real subscriber their confirmation link is bad is the one
// answer they cannot act on, because the link is all they have.
export type ConfirmResult = "confirmed" | "already" | "invalid" | "unavailable";

/**
 * Confirm a subscription from the emailed link. Idempotent: re-visiting the
 * link after confirming reports "already" without re-sending the welcome.
 */
export async function confirmNewsletter(token: string): Promise<ConfirmResult> {
  if (!token) return "invalid";
  const supabase = createServiceRoleClient();

  const subRead = await toTypedFailure(
    supabase
      .from("newsletter_subscribers")
      .select("id, email, confirmed_at")
      .eq("confirmation_token", token)
      .maybeSingle(),
    "the newsletter subscriber behind this link",
  );
  // Not "invalid": that is a claim about the token in somebody's email.
  if (!subRead.ok) return "unavailable";
  const sub = subRead.data;
  const row = sub as {
    id: string;
    email: string;
    confirmed_at: string | null;
  } | null;
  if (!row) return "invalid";
  if (row.confirmed_at) return "already";

  // Confirm only if still unconfirmed, in the UPDATE's own WHERE clause (#663).
  // The read above cannot be the guard: mail clients prefetch links, so the same
  // confirmation link is routinely fetched twice within milliseconds, and under
  // check-then-write both callers saw confirmed_at as null and both sent the
  // welcome email.
  const { data: claimed, error } = await supabase
    .from("newsletter_subscribers")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("confirmed_at", null)
    .select("id");
  if (error) {
    console.error("[newsletter] confirm failed:", error.message);
    return "invalid";
  }
  // Zero rows: a concurrent fetch of the same link confirmed it first and has
  // already sent the welcome.
  if (!claimed || claimed.length === 0) return "already";

  // The welcome is a courtesy and they are already confirmed, so a failure
  // does not change what this reports. The sender says so itself (#977).
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

// "unavailable" is distinct from "invalid" (#847): "invalid" is a claim about
// the token in somebody's email footer, and telling them their unsubscribe
// link is bad, when the read simply failed, leaves them with no way out.
export type UnsubscribeResult = "ok" | "invalid" | "unavailable";

/** Unsubscribe by token (from the email footer). Idempotent. */
export interface UnsubscribeByEmailResult {
  success: boolean;
  error?: "invalid" | "unknown";
}

/**
 * Unsubscribe by email, for the generic footer link present in every email
 * (no per-recipient token). Always reports success for a valid email so the
 * page cannot be used to probe whether an address is subscribed.
 */
export async function unsubscribeByEmail(
  raw: unknown,
): Promise<UnsubscribeByEmailResult> {
  const parsed = unsubscribeEmailSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "invalid" };

  const supabase = createServiceRoleClient();
  // Checked: this reported success on a write that never landed, so somebody
  // who asked to stop receiving the newsletter was told they had, and kept
  // receiving it (#847).
  const write = await toTypedFailure(
    supabase
      .from("newsletter_subscribers")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("email", parsed.data.email)
      .is("unsubscribed_at", null),
    "the unsubscribe write for this address",
  );
  if (!write.ok) return { success: false, error: "unknown" };

  return { success: true };
}

export async function unsubscribeNewsletter(
  token: string,
): Promise<UnsubscribeResult> {
  if (!token) return "invalid";
  const supabase = createServiceRoleClient();

  const subRead = await toTypedFailure(
    supabase
      .from("newsletter_subscribers")
      .select("id, unsubscribed_at")
      .eq("unsubscribe_token", token)
      .maybeSingle(),
    "the newsletter subscriber behind this link",
  );
  // Not "invalid": that is a claim about the token in somebody's email.
  if (!subRead.ok) return "unavailable";
  const sub = subRead.data;
  const row = sub as { id: string; unsubscribed_at: string | null } | null;
  if (!row) return "invalid";

  if (!row.unsubscribed_at) {
    const write = await toTypedFailure(
      supabase
        .from("newsletter_subscribers")
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq("id", row.id),
      "the unsubscribe write for this link",
    );
    // "ok" would tell somebody they are unsubscribed when they are not.
    if (!write.ok) return "unavailable";
  }
  return "ok";
}
