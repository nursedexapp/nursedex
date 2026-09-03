/**
 * Email sending utilities.
 *
 * Sends emails via internal Route Handler to avoid Turbopack ESM
 * resolution issues with `resend` and `@react-email/components`.
 */

import { headers } from "next/headers";

// The request host, used as the target for the internal /api/email/* POST so
// it reaches the same running deployment (including previews).
async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// The canonical public site URL, used for links that appear *inside* emails
// (confirm, unsubscribe, post, moderation). Never the request host: an email
// sent from a preview deployment must still link to the live site.
function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://nursedex.com").replace(
    /\/$/,
    "",
  );
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

interface SendCommentSubmittedArgs {
  postTitle: string;
  authorName: string;
  body: string;
}

/**
 * Notifies admins (support inbox) that a blog comment was submitted and is
 * awaiting moderation.
 */
/**
 * Tells a verified nurse whose profile is empty that families cannot see her
 * (#732).
 *
 * Unlike its neighbours this one REPORTS whether the email went out, because
 * the nudge cron claims a dedup row before sending and has to release it again
 * when the send fails, or she is marked as told and never hears from us. A
 * network failure is caught for the same reason: letting it escape would abort
 * the run partway and silently leave the remaining nurses untold.
 */
export async function sendNotListedNudgeEmail(args: {
  to: string;
  firstName?: string;
}): Promise<boolean> {
  const baseUrl = await getBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/api/email/not-listed-nudge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({ to: args.to, firstName: args.firstName }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[email] Not listed nudge failed:", res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Not listed nudge could not be sent:", err);
    return false;
  }
}

export async function sendCommentSubmittedEmail(
  args: SendCommentSubmittedArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const moderateUrl = `${getSiteUrl()}/admin/blog/comments`;

  const res = await fetch(`${baseUrl}/api/email/comment-submitted`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ ...args, moderateUrl }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Comment submitted email failed:", res.status, body);
  }
}

interface SendCommentApprovedArgs {
  to: string;
  postTitle: string;
  slug: string;
}

/** Notifies a commenter that their comment was approved and is now live. */
export async function sendCommentApprovedEmail(
  args: SendCommentApprovedArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const postUrl = `${getSiteUrl()}/blog/${args.slug}`;

  const res = await fetch(`${baseUrl}/api/email/comment-approved`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ to: args.to, postTitle: args.postTitle, postUrl }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Comment approved email failed:", res.status, body);
  }
}

interface BatchRecipient {
  email: string;
  unsubscribe_token: string;
}

/**
 * Sends one batch (<= 100) of a newsletter issue, building each recipient's
 * personal unsubscribe link. Caller is responsible for chunking.
 */
export async function sendNewsletterBatch(
  subject: string,
  body: string,
  recipients: BatchRecipient[],
): Promise<boolean> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/newsletter-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({
      subject,
      body,
      recipients: recipients.map((r) => {
        const token = encodeURIComponent(r.unsubscribe_token);
        return {
          email: r.email,
          // Visible footer link (friendly page).
          unsubscribeUrl: `${getSiteUrl()}/newsletter/unsubscribe?token=${token}`,
          // One-click target for the List-Unsubscribe header (accepts POST).
          listUnsubscribeUrl: `${getSiteUrl()}/api/newsletter/unsubscribe?token=${token}`,
        };
      }),
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error("[email] Newsletter batch failed:", res.status, errBody);
    return false;
  }
  return true;
}

/**
 * Sends the double opt-in confirmation email for the blog newsletter. The
 * confirm link carries the subscriber's token; clicking it confirms them.
 */
export async function sendNewsletterConfirmEmail(
  to: string,
  token: string,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const confirmUrl = `${getSiteUrl()}/newsletter/confirm?token=${encodeURIComponent(token)}`;

  const res = await fetch(`${baseUrl}/api/email/newsletter-confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ to, confirmUrl }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Newsletter confirm email failed:", res.status, body);
  }
}

/** Sends the welcome email once a newsletter subscriber confirms. */
export async function sendNewsletterWelcomeEmail(to: string): Promise<void> {
  const baseUrl = await getBaseUrl();

  const res = await fetch(`${baseUrl}/api/email/newsletter-welcome`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ to }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Newsletter welcome email failed:", res.status, body);
  }
}

interface SendAccountExistsNoticeArgs {
  to: string;
  firstName?: string;
}

/**
 * Notifies the owner of an existing account that someone tried to sign up
 * again with their email. Sent instead of revealing account existence on the
 * signup screen, so the response stays identical to the new-user path and the
 * email cannot be used to enumerate registered addresses.
 */
export async function sendAccountExistsNoticeEmail(
  args: SendAccountExistsNoticeArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();

  const res = await fetch(`${baseUrl}/api/email/account-exists-notice`, {
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
      "[email] Account exists notice email failed:",
      res.status,
      body,
    );
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

interface SendAccountSuspendedArgs {
  to: string;
  firstName?: string;
}
export async function sendAccountSuspendedEmail(
  args: SendAccountSuspendedArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/account-suspended`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Account suspended email failed:", res.status, body);
  }
}

interface SendAccountRemovedArgs {
  to: string;
  firstName?: string;
  reason: string;
}
export async function sendAccountRemovedEmail(
  args: SendAccountRemovedArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/account-removed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Account removed email failed:", res.status, body);
  }
}

interface SendPaymentFailureWarningArgs {
  to: string;
  firstName?: string;
  dayNumber: 1 | 2;
  planLabel: string;
  consequenceLabel: string;
  portalUrl: string;
}
export async function sendPaymentFailureWarningEmail(
  args: SendPaymentFailureWarningArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/payment-failure-warning`, {
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
      "[email] Payment failure warning email failed:",
      res.status,
      body,
    );
  }
}

interface SendPaymentFailureFinalArgs {
  to: string;
  firstName?: string;
  planLabel: string;
  consequenceSummary: string;
  portalUrl: string;
}
export async function sendPaymentFailureFinalEmail(
  args: SendPaymentFailureFinalArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/payment-failure-final`, {
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
      "[email] Payment failure final email failed:",
      res.status,
      body,
    );
  }
}

interface SendAccessExpiryReminderArgs {
  to: string;
  firstName?: string;
  daysUntilExpiry: number;
  expiryDateLabel: string;
}
export async function sendAccessExpiryReminderEmail(
  args: SendAccessExpiryReminderArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/access-expiry-reminder`, {
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
      "[email] Access expiry reminder email failed:",
      res.status,
      body,
    );
  }
}

interface SendSlaAlertAdminArgs {
  to: string;
  approachingCount: number;
  overdueCount: number;
}
export async function sendSlaAlertAdminEmail(
  args: SendSlaAlertAdminArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/sla-alert-admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] SLA alert admin email failed:", res.status, body);
  }
}

interface SendSubscriptionConfirmedArgs {
  to: string;
  firstName?: string;
  planType: "nurse_featured" | "family_access";
  amount: string;
  nextRenewalLabel: string;
}
export async function sendSubscriptionConfirmedEmail(
  args: SendSubscriptionConfirmedArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/subscription-confirmed`, {
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
      "[email] Subscription confirmed email failed:",
      res.status,
      body,
    );
  }
}

interface SendRenewalSuccessArgs {
  to: string;
  firstName?: string;
  planLabel: string;
  amount: string;
  nextRenewalLabel: string;
}
export async function sendRenewalSuccessEmail(
  args: SendRenewalSuccessArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/renewal-success`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Renewal success email failed:", res.status, body);
  }
}

interface SendCancellationConfirmationArgs {
  to: string;
  firstName?: string;
  planLabel: string;
  accessUntilLabel: string;
  isFamily: boolean;
}
export async function sendCancellationConfirmationEmail(
  args: SendCancellationConfirmationArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/cancellation-confirmation`, {
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
      "[email] Cancellation confirmation email failed:",
      res.status,
      body,
    );
  }
}

interface SendRenewalReminderArgs {
  to: string;
  firstName?: string;
  planLabel: string;
  amount: string;
  renewalDateLabel: string;
}
export async function sendRenewalReminderEmail(
  args: SendRenewalReminderArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/renewal-reminder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Renewal reminder email failed:", res.status, body);
  }
}

interface SendFeaturedAnalyticsArgs {
  to: string;
  firstName?: string;
  thisWeek: { profileViews: number; saves: number; reveals: number };
  lastWeek: { profileViews: number; saves: number; reveals: number };
}
export async function sendFeaturedAnalyticsEmail(
  args: SendFeaturedAnalyticsArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/featured-analytics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Featured analytics email failed:", res.status, body);
  }
}

interface SendUpgradeNudgeArgs {
  to: string;
  firstName?: string;
  saveCount: number;
}
export async function sendUpgradeNudgeEmail(
  args: SendUpgradeNudgeArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/upgrade-nudge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Upgrade nudge email failed:", res.status, body);
  }
}

interface SendRateLimitFlaggedAdminArgs {
  to: string;
  flaggedCount: number;
}
export async function sendRateLimitFlaggedAdminEmail(
  args: SendRateLimitFlaggedAdminArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/rate-limit-flagged-admin`, {
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
      "[email] Rate limit flagged admin email failed:",
      res.status,
      body,
    );
  }
}

interface SendContactReceivedArgs {
  name: string;
  email: string;
  subject: string;
  message: string;
}
/**
 * Notifies the support inbox that a new contact form submission came in.
 * Goes to support@nursedex.com (hard-coded recipient, this is an
 * internal alert, not a per-user transactional email).
 */
export async function sendContactReceivedEmail(
  args: SendContactReceivedArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/contact-received`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Contact received email failed:", res.status, body);
  }
}

interface SendReviewInviteArgs {
  to: string;
  firstName?: string;
  reviewLinkUrl: string;
}
export async function sendReviewInviteEmail(
  args: SendReviewInviteArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/review-invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Review invite email failed:", res.status, body);
  }
}

interface SendHireFollowupArgs {
  to: string;
  firstName?: string;
}
export async function sendHireFollowupEmail(
  args: SendHireFollowupArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/hire-followup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Hire followup email failed:", res.status, body);
  }
}

interface SendHireConfirmRequestArgs {
  to: string;
  firstName?: string;
  nurseFirstName: string;
  claimToken: string;
}
export async function sendHireConfirmRequestEmail(
  args: SendHireConfirmRequestArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/hire-confirm-request`, {
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
      "[email] Hire confirm request email failed:",
      res.status,
      body,
    );
  }
}

interface SendHireConfirmedArgs {
  to: string;
  firstName?: string;
  familyFirstName: string;
}
export async function sendHireConfirmedEmail(
  args: SendHireConfirmedArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/hire-confirmed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Hire confirmed email failed:", res.status, body);
  }
}

interface SendDisputeDecisionArgs {
  to: string;
  recipientType: "nurse" | "reviewer";
  recipientName?: string;
  decision: "keep" | "remove";
  rating: number;
  reviewerName: string;
  notes: string | null;
}

export async function sendDisputeDecisionEmail(
  args: SendDisputeDecisionArgs,
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/email/dispute-decision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[email] Dispute decision email failed:", res.status, body);
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
