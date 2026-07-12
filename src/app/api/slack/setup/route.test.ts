// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/slack/client", () => ({
  OPS_CHANNEL_ID: "C123",
  slackPost: vi.fn(),
}));

import { POST } from "./route";
import { slackPost } from "@/lib/slack/client";

function req(secretHeader: string | null): NextRequest {
  return {
    headers: { get: () => secretHeader },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_SECRET;
  // Let the happy path succeed by default, so a rejected caller is refused by
  // the 401 assertion below and nothing else.
  //
  // Without this, slackPost returns undefined, the route throws on `posted.ts`,
  // and the unauthorized tests "pass" only because the call blew up on the way
  // out. Delete the guard and they still go red, on the crash, so the assertion
  // is not what is protecting the route: hollow it out to expect(res).toBeDefined()
  // and the suite stays green. The mutation run in #642 flags exactly that.
  vi.mocked(slackPost).mockResolvedValue({ ok: true, ts: "1" } as never);
});

describe("POST /api/slack/setup", () => {
  it("returns 401 when ADMIN_SECRET is unset, even against the literal string 'undefined'", async () => {
    const res = await POST(req("undefined"));
    expect(res.status).toBe(401);
    expect(slackPost).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    const res = await POST(req("wrong"));
    expect(res.status).toBe(401);
    expect(slackPost).not.toHaveBeenCalled();
  });

  it("posts to slack with the correct secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    vi.mocked(slackPost).mockResolvedValue({ ok: true, ts: "1" } as never);
    const res = await POST(req("secret"));
    expect(res.status).toBe(200);
    expect(slackPost).toHaveBeenCalled();
  });
});
