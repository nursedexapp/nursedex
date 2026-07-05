// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse, type NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  slackPost: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: h.captureException,
  captureMessage: h.captureMessage,
}));
vi.mock("@/lib/slack/client", () => ({
  slackPost: h.slackPost,
  ALERTS_CHANNEL_ID: "C_TEST_ALERTS",
}));

import { withCronAlerting } from "./alerting";

function fakeRequest(): NextRequest {
  return { headers: { get: () => "Bearer test" } } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withCronAlerting", () => {
  it("returns the handler's response unchanged on success", async () => {
    const ok = NextResponse.json({ success: true });
    const handler = vi.fn(async () => ok);

    const res = await withCronAlerting("test-job", handler)(fakeRequest());

    expect(res).toBe(ok);
    expect(h.captureException).not.toHaveBeenCalled();
    expect(h.slackPost).not.toHaveBeenCalled();
  });

  it("captures to Sentry and alerts Slack when the handler throws", async () => {
    const handler = vi.fn(async () => {
      throw new Error("db unavailable");
    });

    const res = await withCronAlerting("test-job", handler)(fakeRequest());

    expect(res.status).toBe(500);
    expect(h.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ job: "test-job" }) }),
    );
    expect(h.slackPost).toHaveBeenCalledWith(
      "chat.postMessage",
      expect.objectContaining({
        channel: "C_TEST_ALERTS",
        text: expect.stringContaining("test-job"),
      }),
    );
  });

  it("alerts Slack and captures a Sentry message when the handler returns non-2xx without throwing", async () => {
    const failed = NextResponse.json({ error: "Query failed" }, { status: 500 });
    const handler = vi.fn(async () => failed);

    const res = await withCronAlerting("test-job", handler)(fakeRequest());

    expect(res).toBe(failed);
    expect(h.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("test-job"),
      "error",
    );
    expect(h.slackPost).toHaveBeenCalledWith(
      "chat.postMessage",
      expect.objectContaining({ channel: "C_TEST_ALERTS" }),
    );
  });

  it("still returns 500 (handler threw) even if the Slack alert itself fails", async () => {
    h.slackPost.mockRejectedValueOnce(new Error("slack down"));
    const handler = vi.fn(async () => {
      throw new Error("db unavailable");
    });

    const res = await withCronAlerting("test-job", handler)(fakeRequest());

    expect(res.status).toBe(500);
  });
});
