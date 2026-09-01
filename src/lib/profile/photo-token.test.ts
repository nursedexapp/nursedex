// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encodePhotoToken, decodePhotoToken } from "./photo-token";

const PATH = "8c1f2b3a-0000-4000-8000-000000000001/1785351572329.jpg";

describe("nurse photo tokens", () => {
  const original = process.env.SUPABASE_SECRET_KEY;

  beforeEach(() => {
    process.env.SUPABASE_SECRET_KEY = "test-secret-key-for-photo-tokens";
  });

  afterEach(() => {
    process.env.SUPABASE_SECRET_KEY = original;
  });

  it("round trips a storage path", () => {
    expect(decodePhotoToken(encodePhotoToken(PATH))).toBe(PATH);
  });

  // #871. The whole point: the url has to be the same on every render or the
  // image optimizer treats it as a new source and can never hit its cache.
  it("gives the same token for the same path every time", () => {
    expect(encodePhotoToken(PATH)).toBe(encodePhotoToken(PATH));
  });

  it("gives a different token when the nurse uploads a new photo", () => {
    const other = PATH.replace("1785351572329", "1799999999999");
    expect(encodePhotoToken(PATH)).not.toBe(encodePhotoToken(other));
  });

  // The raw storage path must never reach the browser, which is why this is
  // encrypted rather than merely signed. saves.test.ts guards the same rule on
  // the card, and a url is markup like any other.
  it("does not carry the path in readable form", () => {
    const token = encodePhotoToken(PATH);
    expect(token).not.toContain("1785351572329");
    expect(Buffer.from(token, "base64url").toString("utf8")).not.toContain(
      "1785351572329",
    );
  });

  it("is url safe", () => {
    expect(encodePhotoToken(PATH)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  // A forged or edited token must be refused rather than decoded into
  // something that then gets signed. Returns null instead of throwing, because
  // the route answers 400 and a throw there would be a 500.
  it("refuses a tampered token", () => {
    const token = encodePhotoToken(PATH);
    const flipped = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect(decodePhotoToken(flipped)).toBeNull();
  });

  it("refuses a token minted under a different key", () => {
    const token = encodePhotoToken(PATH);
    process.env.SUPABASE_SECRET_KEY = "a-completely-different-secret";
    expect(decodePhotoToken(token)).toBeNull();
  });

  it("refuses rubbish", () => {
    expect(decodePhotoToken("not-a-token")).toBeNull();
    expect(decodePhotoToken("")).toBeNull();
  });

  // Fails closed. Without a key nothing can be verified, so nothing may be
  // served, and it must say so rather than silently serving or silently not.
  it("refuses to encode or decode when no key is configured", () => {
    delete process.env.SUPABASE_SECRET_KEY;
    expect(() => encodePhotoToken(PATH)).toThrow(/SUPABASE_SECRET_KEY/);
    expect(decodePhotoToken("anything")).toBeNull();
  });
});
