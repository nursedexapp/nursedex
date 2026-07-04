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
