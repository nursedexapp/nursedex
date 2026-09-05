// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * sendNotListedNudgeEmail reports whether the email actually went out, and the
 * nudge cron acts on that answer: on a false it releases the nurse's dedup
 * claim so the next run tries again. Every other sender here returns void and
 * logs, which is why a failed send elsewhere is invisible to its caller.
 */
vi.mock("@/lib/email/resend", () => ({ resend: {} }));

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

// The sender posts to the running deployment's own host, which it reads from
// the request. There is no request here, so stand one in.
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) =>
      k === "host"
        ? "nursedex.test"
        : k === "x-forwarded-proto"
          ? "https"
          : null,
  }),
}));

import {
  sendNotListedNudgeEmail,
  postEmail,
  sendPaymentFailureWarningEmail,
  sendPaymentFailureFinalEmail,
  sendAccessExpiryReminderEmail,
  sendUpgradeNudgeEmail,
  sendHireFollowupEmail,
  sendRenewalReminderEmail,
  sendRateLimitFlaggedAdminEmail,
  sendSlaAlertAdminEmail,
  sendFeaturedAnalyticsEmail,
  sendReviewInviteEmail,
  sendProfileSetupEmail,
  sendCommentSubmittedEmail,
  sendCommentApprovedEmail,
  sendNewsletterConfirmEmail,
  sendNewsletterWelcomeEmail,
  sendNewsletterBatch,
  sendAccountExistsNoticeEmail,
  sendNewReviewEmail,
  sendVerificationApprovedEmail,
  sendVerificationRejectedEmail,
  sendAccountSuspendedEmail,
  sendAccountRemovedEmail,
  sendContactReceivedEmail,
  sendHireConfirmRequestEmail,
  sendHireConfirmedEmail,
  sendDisputeDecisionEmail,
  sendVerifyReviewEmail,
} from "./send";

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://nursedex.test";
  process.env.CRON_SECRET = "test-secret";
  sentry.captureMessage.mockClear();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("sendNotListedNudgeEmail", () => {
  it("says it went out when the request succeeds", async () => {
    global.fetch = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as never;

    await expect(
      sendNotListedNudgeEmail({
        to: "nurse@example.com",
        firstName: "Nia",
        gaps: ["content"],
      }),
    ).resolves.toBe(true);
  });

  it("says it did not when the request is rejected", async () => {
    global.fetch = vi.fn(
      async () => new Response('{"error":"nope"}', { status: 500 }),
    ) as never;

    await expect(
      sendNotListedNudgeEmail({ to: "nurse@example.com", gaps: ["content"] }),
    ).resolves.toBe(false);
  });

  it("says it did not when the request cannot be made at all", async () => {
    // A network failure throws rather than returning a response. Letting that
    // escape would abort the whole run partway, so the remaining nurses would
    // silently go untold.
    global.fetch = vi.fn(async () => {
      throw new Error("connection refused");
    }) as never;

    await expect(
      sendNotListedNudgeEmail({ to: "nurse@example.com", gaps: ["content"] }),
    ).resolves.toBe(false);
  });
});

/**
 * Every sender in this file repeated the same fetch, the same auth header and
 * the same "log it and carry on" block, and that duplication is why a failed
 * send was invisible to its caller in ten of them (#415). One helper now does
 * the posting and REPORTS, so a sender cannot forget to.
 */
describe("postEmail", () => {
  it("posts the payload to the running deployment with the cron secret", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response("{}", { status: 200 }),
    );
    global.fetch = fetchMock as never;

    await postEmail("renewal-reminder", { to: "a@example.com" }, "Renewal");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://nursedex.test/api/email/renewal-reminder");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-secret",
    );
    expect(init.body).toBe(JSON.stringify({ to: "a@example.com" }));
  });

  it("says it went out when the request succeeds", async () => {
    global.fetch = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as never;

    await expect(postEmail("renewal-reminder", {}, "Renewal")).resolves.toBe(
      true,
    );
  });

  it("says it did not when the request is rejected, naming the sender", async () => {
    global.fetch = vi.fn(
      async () => new Response('{"error":"nope"}', { status: 500 }),
    ) as never;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(postEmail("renewal-reminder", {}, "Renewal")).resolves.toBe(
      false,
    );
    expect(spy.mock.calls[0]?.join(" ")).toContain("Renewal");
  });

  it("says it did not when the request cannot be made at all", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("connection refused");
    }) as never;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(postEmail("renewal-reminder", {}, "Renewal")).resolves.toBe(
      false,
    );
  });
});

/**
 * The ten senders the crons drive. Each one is now three lines over postEmail,
 * and the thing a mechanical conversion can silently get wrong is the endpoint:
 * a wrong path is a 404, which is a failed send that nothing else would notice.
 * So the endpoint is pinned here, per sender, along with the answer each gives
 * when the request is rejected, which is what the dedup release depends on.
 *
 * The arguments are cast because this asserts the transport rather than any
 * template's payload, and building ten full argument objects would say nothing
 * extra about either.
 */
const CRON_SENDERS: {
  label: string;
  path: string;
  call: () => Promise<boolean>;
}[] = [
  {
    label: "payment failure warning",
    path: "payment-failure-warning",
    call: () => sendPaymentFailureWarningEmail({} as never),
  },
  {
    label: "payment failure final",
    path: "payment-failure-final",
    call: () => sendPaymentFailureFinalEmail({} as never),
  },
  {
    label: "access expiry reminder",
    path: "access-expiry-reminder",
    call: () => sendAccessExpiryReminderEmail({} as never),
  },
  {
    label: "upgrade nudge",
    path: "upgrade-nudge",
    call: () => sendUpgradeNudgeEmail({} as never),
  },
  {
    label: "hire followup",
    path: "hire-followup",
    call: () => sendHireFollowupEmail({} as never),
  },
  {
    label: "renewal reminder",
    path: "renewal-reminder",
    call: () => sendRenewalReminderEmail({} as never),
  },
  {
    label: "rate limit flagged admin",
    path: "rate-limit-flagged-admin",
    call: () => sendRateLimitFlaggedAdminEmail({} as never),
  },
  {
    label: "sla alert admin",
    path: "sla-alert-admin",
    call: () => sendSlaAlertAdminEmail({} as never),
  },
  {
    label: "featured analytics",
    path: "featured-analytics",
    call: () => sendFeaturedAnalyticsEmail({} as never),
  },
  {
    label: "review invite",
    path: "review-invite",
    call: () => sendReviewInviteEmail({} as never),
  },
];

describe.each(CRON_SENDERS)("$label", ({ path, call }) => {
  it("posts to its own endpoint", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response("{}", { status: 200 }),
    );
    global.fetch = fetchMock as never;

    await call();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://nursedex.test/api/email/${path}`,
    );
  });

  it("reports a rejected request as not sent, so the claim is released", async () => {
    global.fetch = vi.fn(
      async () => new Response('{"error":"nope"}', { status: 500 }),
    ) as never;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(call()).resolves.toBe(false);
  });
});

/**
 * #977. Reporting a failure into a serverless log is not reporting it: most of
 * these sends happen inside `after()`, so the response has already gone and
 * nobody is left to tell. The report lives in postEmail rather than at each
 * call site, because a rule every caller has to remember is a rule one of them
 * will not.
 */
describe("a send that failed is reported, not only logged", () => {
  it("reports a rejected request, naming the sender and the status", async () => {
    global.fetch = vi.fn(
      async () => new Response('{"error":"nope"}', { status: 500 }),
    ) as never;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await postEmail("verify-review", {}, "Verify review");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [message, level] = sentry.captureMessage.mock.calls[0];
    expect(message).toContain("Verify review");
    expect(message).toContain("500");
    expect(level).toBe("warning");
  });

  it("reports a request that could not be made at all", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("connection refused");
    }) as never;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await postEmail("verify-review", {}, "Verify review");

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage.mock.calls[0][0]).toContain(
      "connection refused",
    );
  });

  it("says nothing when the send went out", async () => {
    global.fetch = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as never;

    await postEmail("verify-review", {}, "Verify review");

    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("answers false rather than throwing when there is no request to read", async () => {
    // getBaseUrl reads the request host, which throws outside a request scope.
    // That used to escape postEmail, which is why every caller carried a catch
    // of its own; the answer has to be an answer, not an exception.
    const headersMod = await import("next/headers");
    vi.spyOn(headersMod, "headers").mockRejectedValueOnce(
      new Error("headers was called outside a request scope") as never,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(postEmail("verify-review", {}, "Verify review")).resolves.toBe(
      false,
    );
  });
});

/**
 * The senders #976 left behind: every one returned void and logged, so no
 * caller could tell a failure from a success. Same pinning as the cron senders
 * above, and for the same reason: a mechanical conversion's one silent failure
 * mode is a wrong endpoint, which is a 404, which is a failed send.
 */
const TRANSACTIONAL_SENDERS: {
  label: string;
  path: string;
  call: () => Promise<boolean>;
}[] = [
  {
    label: "profile setup",
    path: "profile-setup",
    call: () => sendProfileSetupEmail("a@example.com", "A", "a-nurse-rn"),
  },
  {
    label: "comment submitted",
    path: "comment-submitted",
    call: () => sendCommentSubmittedEmail({} as never),
  },
  {
    label: "comment approved",
    path: "comment-approved",
    call: () => sendCommentApprovedEmail({ slug: "a-post" } as never),
  },
  {
    label: "newsletter confirm",
    path: "newsletter-confirm",
    call: () => sendNewsletterConfirmEmail("a@example.com", "tok"),
  },
  {
    label: "newsletter welcome",
    path: "newsletter-welcome",
    call: () => sendNewsletterWelcomeEmail("a@example.com"),
  },
  {
    label: "newsletter batch",
    path: "newsletter-batch",
    call: () => sendNewsletterBatch("Subject", "Body", []),
  },
  {
    label: "account exists notice",
    path: "account-exists-notice",
    call: () => sendAccountExistsNoticeEmail({} as never),
  },
  {
    label: "new review",
    path: "new-review",
    call: () => sendNewReviewEmail({} as never),
  },
  {
    label: "verification approved",
    path: "verification-approved",
    call: () => sendVerificationApprovedEmail({} as never),
  },
  {
    label: "verification rejected",
    path: "verification-rejected",
    call: () => sendVerificationRejectedEmail({} as never),
  },
  {
    label: "account suspended",
    path: "account-suspended",
    call: () => sendAccountSuspendedEmail({} as never),
  },
  {
    label: "account removed",
    path: "account-removed",
    call: () => sendAccountRemovedEmail({} as never),
  },
  {
    label: "contact received",
    path: "contact-received",
    call: () => sendContactReceivedEmail({} as never),
  },
  {
    label: "hire confirm request",
    path: "hire-confirm-request",
    call: () => sendHireConfirmRequestEmail({} as never),
  },
  {
    label: "hire confirmed",
    path: "hire-confirmed",
    call: () => sendHireConfirmedEmail({} as never),
  },
  {
    label: "dispute decision",
    path: "dispute-decision",
    call: () => sendDisputeDecisionEmail({} as never),
  },
  {
    label: "verify review",
    path: "verify-review",
    call: () => sendVerifyReviewEmail({} as never),
  },
];

describe.each(TRANSACTIONAL_SENDERS)("$label", ({ path, call }) => {
  it("posts to its own endpoint", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response("{}", { status: 200 }),
    );
    global.fetch = fetchMock as never;

    await expect(call()).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://nursedex.test/api/email/${path}`,
    );
  });

  it("says it did not go out when the request is rejected", async () => {
    global.fetch = vi.fn(
      async () => new Response('{"error":"nope"}', { status: 500 }),
    ) as never;
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(call()).resolves.toBe(false);
  });
});
