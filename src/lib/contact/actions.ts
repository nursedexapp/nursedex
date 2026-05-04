"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile/verify";
import { contactSchema, type ContactInput } from "@/lib/schemas/contact";
import { sendContactReceivedEmail } from "@/lib/email/send";

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
  const { error } = await supabase.from("contact_submissions").insert({
    name: input.name,
    email: input.email,
    message: input.message,
  });
  if (error) {
    console.error("[contact] insert failed:", error.message);
    return { success: false, error: "unknown" };
  }

  // Fire-and-forget notification to the support inbox.
  sendContactReceivedEmail({
    name: input.name,
    email: input.email,
    message: input.message,
  }).catch((err) =>
    console.error("[email] contact received notify failed:", err),
  );

  return { success: true };
}
