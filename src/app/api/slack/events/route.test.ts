// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// The HMAC primitive (verifySlackRequest) is unit-tested in
// src/lib/slack/client.test.ts. These tests cover the ROUTE wiring: that the
// events endpoint rejects a bad or missing signature before doing anything,
// and that it proceeds when the signature is valid (#481).
vi.mock("@/lib/slack/client", () => ({
  verifySlackRequest: vi.fn(),
  slackPost: vi.fn(async () => ({})),
  OPS_CHANNEL_ID: "C_OPS",
}));

import { verifySlackRequest, slackPost } from "@/lib/slack/client";
import { POST } from "./route";

const verifyMock = vi.mocked(verifySlackRequest);
const slackPostMock = vi.mocked(slackPost);

function fakeReq(
  raw: string,
  headers: Record<string, string> = {},
): NextRequest {
  return {
    text: async () => raw,
    headers: { get: (k: string) => headers[k] ?? null },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/slack/events signature guard", () => {
  it("returns 401 and performs no side effects when the signature is invalid", async () => {
    verifyMock.mockReturnValue(false);
    const res = await POST(
      fakeReq(JSON.stringify({ type: "event_callback" }), {
        "x-slack-signature": "v0=bad",
        "x-slack-request-timestamp": "123",
      }),
    );
    expect(res.status).toBe(401);
    expect(slackPostMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature header is missing", async () => {
    verifyMock.mockReturnValue(false);
    const res = await POST(fakeReq(JSON.stringify({ type: "event_callback" })));
    expect(res.status).toBe(401);
    // The route must pass the (absent) header through to the verifier, not
    // skip the check.
    expect(verifyMock).toHaveBeenCalledWith(expect.any(String), null, null);
    expect(slackPostMock).not.toHaveBeenCalled();
  });

  it("answers the url_verification handshake when the signature is valid", async () => {
    verifyMock.mockReturnValue(true);
    const res = await POST(
      fakeReq(JSON.stringify({ type: "url_verification", challenge: "abc123" }), {
        "x-slack-signature": "v0=good",
        "x-slack-request-timestamp": "123",
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ challenge: "abc123" });
  });

  it("publishes the App Home view on app_home_opened when the signature is valid", async () => {
    verifyMock.mockReturnValue(true);
    const res = await POST(
      fakeReq(
        JSON.stringify({
          type: "event_callback",
          event: { type: "app_home_opened", tab: "home", user: "U123" },
        }),
        {
          "x-slack-signature": "v0=good",
          "x-slack-request-timestamp": "123",
        },
      ),
    );
    expect(res.status).toBe(200);
    expect(slackPostMock).toHaveBeenCalledWith(
      "views.publish",
      expect.objectContaining({ user_id: "U123" }),
    );
  });
});
