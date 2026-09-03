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
      k === "host" ? "nursedex.test" : k === "x-forwarded-proto" ? "https" : null,
  }),
}));

import { sendNotListedNudgeEmail } from "./send";

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
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as never;

    await expect(
      sendNotListedNudgeEmail({ to: "nurse@example.com", firstName: "Nia" }),
    ).resolves.toBe(true);
  });

  it("says it did not when the request is rejected", async () => {
    global.fetch = vi.fn(
      async () => new Response('{"error":"nope"}', { status: 500 }),
    ) as never;

    await expect(
      sendNotListedNudgeEmail({ to: "nurse@example.com" }),
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
      sendNotListedNudgeEmail({ to: "nurse@example.com" }),
    ).resolves.toBe(false);
  });
});
