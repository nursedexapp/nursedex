// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const signPhoto = vi.fn();
vi.mock("@/lib/profile/photos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/profile/photos")>()),
  getSignedPhotoUrl: (path: string) => signPhoto(path),
}));

const resolvePhoto = vi.fn();
vi.mock("@/lib/nurses/photo-owner", () => ({
  resolveVisibleNursePhoto: (userId: string, photoId: string) =>
    resolvePhoto(userId, photoId),
}));

import { GET } from "./route";

function request(path: string[]) {
  return GET(new Request("https://nursedex.com/api/nurse-photo"), {
    params: Promise.resolve({ path }),
  });
}

describe("GET /api/nurse-photo", () => {
  let logged: unknown[][];
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = [];
    signPhoto.mockReset();
    resolvePhoto.mockReset();
    resolvePhoto.mockResolvedValue("nurse-1/1.jpg");
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("redirects to the signed url for a visible nurse's photo", async () => {
    signPhoto.mockResolvedValue("https://storage.example/signed?token=abc");
    const res = await request(["nurse-1", "abc123"]);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://storage.example/signed?token=abc",
    );
    expect(signPhoto).toHaveBeenCalledWith("nurse-1/1.jpg");
  });

  // The whole point of #871. Without a cache header the optimizer and the
  // browser re-request on every view and the fix buys nothing.
  it("tells caches the photo may be reused", async () => {
    signPhoto.mockResolvedValue("https://storage.example/signed");
    const res = await request(["nurse-1", "abc123"]);
    expect(res.headers.get("cache-control")).toMatch(/max-age=\d+/);
  });

  // Scoping. The directory only ever lists publicly visible nurses, so this
  // route must not become a way to fetch any photo in the bucket by guessing a
  // path, which would bypass that filter entirely.
  it("refuses a photo belonging to a nurse who is not publicly visible", async () => {
    resolvePhoto.mockResolvedValue(null);
    signPhoto.mockResolvedValue("https://storage.example/signed");
    const res = await request(["hidden-nurse", "abc123"]);
    expect(res.status).toBe(404);
    expect(signPhoto).not.toHaveBeenCalled();
  });

  it("refuses an address that is not exactly a nurse id and a photo id", async () => {
    const res = await request(["..", "..", "secrets.env"]);
    expect(res.status).toBe(400);
    expect(resolvePhoto).not.toHaveBeenCalled();
    expect(signPhoto).not.toHaveBeenCalled();
  });

  // Moved from card.test.ts with the signing itself. A photo that cannot be
  // signed and a nurse who never uploaded one look identical to a visitor, so
  // the failure has to say so somewhere or a broken bucket reads as an
  // onboarding gap.
  it("reports a signing failure rather than failing silently", async () => {
    signPhoto.mockRejectedValue(new Error("bucket unreachable"));
    const res = await request(["nurse-1", "abc123"]);
    expect(res.status).toBe(502);
    expect(logged).toHaveLength(1);
    expect(String(logged[0][0])).toContain("nurse-1/1.jpg");
    expect(String(logged[0][1])).toContain("bucket unreachable");
  });

  // A signer that returns null rather than throwing is the same outcome for the
  // visitor and must not be reported as a success with an empty destination.
  it("reports a signer that returns nothing", async () => {
    signPhoto.mockResolvedValue(null);
    const res = await request(["nurse-1", "abc123"]);
    expect(res.status).toBe(502);
    expect(logged).toHaveLength(1);
  });
});
