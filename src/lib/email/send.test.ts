// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * sendNotListedNudgeEmail reports whether the email actually went out, and the
 * nudge cron acts on that answer: on a false it releases the nurse's dedup
 * claim so the next run tries again. Every other sender here returns void and
 * logs, which is why a failed send elsewhere is invisible to its caller.
 */
vi.mock("@/lib/email/resend", () => ({ resend: {} }));

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
} from "./send";

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://nursedex.test";
  process.env.CRON_SECRET = "test-secret";
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
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer test-secret");
    expect(init.body).toBe(JSON.stringify({ to: "a@example.com" }));
  });

  it("says it went out when the request succeeds", async () => {
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as never;

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
const CRON_SENDERS: { label: string; path: string; call: () => Promise<boolean> }[] =
  [
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
