"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { newsletterSchema } from "@/lib/schemas/newsletter";
import {
  sendNewsletterConfirmEmail,
  sendNewsletterWelcomeEmail,
} from "@/lib/email/send";

export interface NewsletterResult {
  success: boolean;
  error?: "invalid" | "unknown";
  fieldErrors?: Record<string, string>;
}

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

  const { data: existing } = await supabase
    .from("newsletter_subscribers")
    .select("confirmed_at")
    .eq("email", input.email)
    .maybeSingle();
  if ((existing as { confirmed_at: string | null } | null)?.confirmed_at) {
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
