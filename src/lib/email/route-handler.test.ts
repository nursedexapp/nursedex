// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { z } from "zod/v4";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { handleEmailRoute } from "./route-handler";
import type { NextRequest } from "next/server";

const schema = z.object({ to: z.email() });
const build = async (d: { to: string }) => ({
  from: "noreply@nursedex.com",
  to: d.to,
  subject: "Hi",
  react: createElement("div"),
});

function req(auth: string | null, body: unknown): NextRequest {
  return {
    headers: { get: () => auth },
    json: async () => body,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "secret";
  send.mockResolvedValue({ error: null });
});

describe("handleEmailRoute", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await handleEmailRoute(req(null, {}), schema, build, "x");
    expect(res.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid body", async () => {
    const res = await handleEmailRoute(
      req("Bearer secret", { to: "nope" }),
      schema,
      build,
      "x",
    );
    expect(res.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends and returns success on a valid request", async () => {
    const res = await handleEmailRoute(
      req("Bearer secret", { to: "a@b.com" }),
      schema,
      build,
      "x",
    );
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@b.com", subject: "Hi" }),
    );
  });

  it("returns 500 when resend reports an error", async () => {
    send.mockResolvedValue({ error: { message: "boom" } });
    const res = await handleEmailRoute(
      req("Bearer secret", { to: "a@b.com" }),
      schema,
      build,
      "x",
    );
    expect(res.status).toBe(500);
  });
});
