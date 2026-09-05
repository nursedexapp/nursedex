"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile/verify";
import { contactSchema, type ContactInput } from "@/lib/schemas/contact";
import { sendContactReceivedEmail } from "@/lib/email/send";
import { isUniqueViolation } from "@/lib/db/postgres-errors";

export type ContactActionError = "invalid" | "captcha_failed" | "unknown";

export interface ContactActionResult {
  success: boolean;
  error?: ContactActionError;
  fieldErrors?: Record<string, string>;
}

/**
 * Public contact form submission. Verifies the Turnstile token,
 * inserts a row into contact_submissions (RLS allows anonymous insert),
 * and fires a notification email to the support inbox.
 */
export async function submitContact(
  raw: unknown,
): Promise<ContactActionResult> {
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0]);
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return { success: false, error: "invalid", fieldErrors };
  }
  const input: ContactInput = parsed.data;

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    undefined;
  const ok = await verifyTurnstileToken(input.turnstile_token, ip);
  if (!ok) return { success: false, error: "captcha_failed" };

  const supabase = await createClient();
  // The id comes from the form, not the database (#708). This insert used to let
  // Postgres invent the id, so a double-click wrote two rows and mailed support
  // twice, and nothing could tell the second write from a genuine second message.
  // Carrying the form's id makes the insert itself the gate.
  const { error } = await supabase.from("contact_submissions").insert({
    id: input.submission_id,
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: input.message,
  });
  if (error) {
    // Not a failure: this exact submission is already in the inbox, so the
    // support team has it and has already been emailed about it. Report success,
    // because from the sender's side the message did go through, and an error
    // here would only invite a third attempt.
    if (isUniqueViolation(error)) return { success: true };

    console.error("[contact] insert failed:", error.message);
    return { success: false, error: "unknown" };
  }

  // Fire-and-forget notification to the support inbox.
  after(() =>
    sendContactReceivedEmail({
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
    }),
  );

  return { success: true };
}
