// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const signPhoto = vi.fn();
vi.mock("@/lib/profile/photos", () => ({
  getSignedPhotoUrl: (path: string) => signPhoto(path),
}));

import { GET } from "./route";
import { encodePhotoToken } from "@/lib/profile/photo-token";

const PATH = "8c1f2b3a-0000-4000-8000-000000000001/1785351572329.jpg";

function request(token: string) {
  return GET(new Request("https://nursedex.com/api/nurse-photo"), {
    params: Promise.resolve({ token }),
  });
}

describe("GET /api/nurse-photo/[token]", () => {
  let logged: unknown[][];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const original = process.env.SUPABASE_SECRET_KEY;

  beforeEach(() => {
    process.env.SUPABASE_SECRET_KEY = "test-secret-key-for-photo-tokens";
    logged = [];
    signPhoto.mockReset();
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    process.env.SUPABASE_SECRET_KEY = original;
  });

  it("redirects to the signed url for the photo the token names", async () => {
    signPhoto.mockResolvedValue("https://storage.example/signed?token=abc");
    const res = await request(encodePhotoToken(PATH));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://storage.example/signed?token=abc",
    );
    expect(signPhoto).toHaveBeenCalledWith(PATH);
  });

  // The whole point of #871. Without a cache header the optimizer and the
  // browser re-request on every view and the fix buys nothing.
  it("tells caches the photo may be reused", async () => {
    signPhoto.mockResolvedValue("https://storage.example/signed");
    const res = await request(encodePhotoToken(PATH));
    expect(res.headers.get("cache-control")).toMatch(/max-age=\d+/);
  });

  // The reason this route holds no lookup: one page load makes fifteen
  // concurrent requests here, and a version that queried the database on each
  // one lost six of fifteen photos under that fan-out on the preview.
  it("serves a photo without any lookup of its own", async () => {
    signPhoto.mockResolvedValue("https://storage.example/signed");
    const res = await request(encodePhotoToken(PATH));
    expect(res.status).toBe(307);
    expect(signPhoto).toHaveBeenCalledTimes(1);
  });

  it("refuses a token it did not mint", async () => {
    const res = await request("bm90LWEtcmVhbC10b2tlbg");
    expect(res.status).toBe(400);
    expect(signPhoto).not.toHaveBeenCalled();
  });

  it("refuses a tampered token rather than signing what it decodes", async () => {
    const token = encodePhotoToken(PATH);
    const flipped = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    const res = await request(flipped);
    expect(res.status).toBe(400);
    expect(signPhoto).not.toHaveBeenCalled();
  });

  // Moved from card.test.ts with the signing itself. A photo that cannot be
  // signed and a nurse who never uploaded one look identical to a visitor, so
  // the failure has to say so somewhere or a broken bucket reads as an
  // onboarding gap.
  it("reports a signing failure rather than failing silently", async () => {
    signPhoto.mockRejectedValue(new Error("bucket unreachable"));
    const res = await request(encodePhotoToken(PATH));
    expect(res.status).toBe(502);
    expect(logged).toHaveLength(1);
    expect(String(logged[0][1])).toContain("bucket unreachable");
  });

  // A signer that returns null rather than throwing is the same outcome for the
  // visitor and must not be reported as a success with an empty destination.
  it("reports a signer that returns nothing", async () => {
    signPhoto.mockResolvedValue(null);
    const res = await request(encodePhotoToken(PATH));
    expect(res.status).toBe(502);
    expect(logged).toHaveLength(1);
  });
});
