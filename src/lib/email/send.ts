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

interface SendNewReviewArgs {
  nurseUserId: string;
  rating: number;
  reviewerName: string;
}

export async function sendNewReviewEmail(
  args: SendNewReviewArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();

  const res = await fetch(`${baseUrl}/api/email/new-review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] New review email failed:", res.status, body);
  }
}

interface SendVerificationApprovedArgs {
  to: string;
  firstName?: string;
  slug: string;
}

export async function sendVerificationApprovedEmail(
  args: SendVerificationApprovedArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/verification-approved`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(
      "[email] Verification approved email failed:",
      res.status,
      body,
    );
  }
}

interface SendVerificationRejectedArgs {
  to: string;
  firstName?: string;
  reason: string;
}

export async function sendVerificationRejectedEmail(
  args: SendVerificationRejectedArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/verification-rejected`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(
      "[email] Verification rejected email failed:",
      res.status,
      body,
    );
  }
}

interface SendVerifyReviewArgs {
  to: string;
  reviewerName: string;
  verificationToken: string;
}

export async function sendVerifyReviewEmail(
  args: SendVerifyReviewArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();

  const res = await fetch(`${baseUrl}/api/email/verify-review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Verify review email failed:", res.status, body);
  }
}
