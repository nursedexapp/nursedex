"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { newsletterSchema } from "@/lib/schemas/newsletter";

export interface NewsletterResult {
  success: boolean;
  error?: "invalid" | "unknown";
  fieldErrors?: Record<string, string>;
}

/**
 * Subscribe an email to the blog newsletter. Single opt-in: the email is
 * stored and an already-subscribed address returns success (no enumeration
 * of who is on the list). A filled honeypot is silently accepted. Uses the
 * service-role client so the unique constraint is the arbiter and a
 * duplicate (23505) is treated as success.
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

  // Honeypot filled: pretend success without storing.
  if (input.website) return { success: true };

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("newsletter_subscribers")
    .insert({ email: input.email, source: input.source || null });

  // 23505 = unique violation: already subscribed, which is fine.
  if (error && error.code !== "23505") {
    console.error("[newsletter] subscribe failed:", error.message);
    return { success: false, error: "unknown" };
  }

  return { success: true };
}
