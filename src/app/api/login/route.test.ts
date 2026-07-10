// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function loginRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const original = process.env.SITE_PASSWORD;

beforeEach(() => {
  process.env.SITE_PASSWORD = "hunter2";
});

afterEach(() => {
  if (original === undefined) delete process.env.SITE_PASSWORD;
  else process.env.SITE_PASSWORD = original;
});

describe("POST /api/login", () => {
  it("accepts the correct password and sets the site-auth cookie", async () => {
    const res = await POST(loginRequest({ password: "hunter2" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(res.cookies.get("site-auth")?.value).toBe("hunter2");
  });

  it("rejects an incorrect password with 401 and no cookie", async () => {
    const res = await POST(loginRequest({ password: "hunter3" }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ ok: false });
    expect(res.cookies.get("site-auth")).toBeUndefined();
  });

  it("rejects a non-string password", async () => {
    const res = await POST(loginRequest({ password: 12345 }));
    expect(res.status).toBe(401);
  });

  it("fails closed when SITE_PASSWORD is unset, even with a blank password", async () => {
    delete process.env.SITE_PASSWORD;
    const res = await POST(loginRequest({ password: "" }));
    expect(res.status).toBe(401);
  });
});
