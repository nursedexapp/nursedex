/**
 * Email sending utilities.
 *
 * Sends emails via internal Route Handler to avoid Turbopack ESM
 * resolution issues with `resend` and `@react-email/components`.
 */

import { headers } from "next/headers";

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function sendProfileSetupEmail(
  to: string,
  firstName: string | undefined,
  slug: string,
): Promise<void> {
  const baseUrl = await getBaseUrl();

  const res = await fetch(`${baseUrl}/api/email/profile-setup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ to, firstName, slug }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Profile setup email failed:", res.status, body);
  }
}
