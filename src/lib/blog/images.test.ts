// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hasValidImageMagic } from "./images";

describe("hasValidImageMagic", () => {
  it("accepts JPEG, PNG, and WebP headers", () => {
    expect(hasValidImageMagic(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe(true);
    expect(
      hasValidImageMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])),
    ).toBe(true);
    expect(
      hasValidImageMagic(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00])),
    ).toBe(true);
  });

  it("rejects non-image content", () => {
    expect(hasValidImageMagic(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBe(false); // <svg
    expect(hasValidImageMagic(new Uint8Array([0x00, 0x00, 0x00]))).toBe(false);
    expect(hasValidImageMagic(new Uint8Array([]))).toBe(false);
  });
});
