// @vitest-environment node
import { describe, it, expect } from "vitest";
import { imageAlignClass } from "./image-align";

describe("imageAlignClass", () => {
  it("maps each alignment to its class", () => {
    expect(imageAlignClass("center")).toBe("mx-auto w-2/3");
    expect(imageAlignClass("left")).toBe("float-left mr-6 mb-3 w-1/2");
    expect(imageAlignClass("right")).toBe("float-right ml-6 mb-3 w-1/2");
  });

  it("falls back to full width for full, null, and unknown values", () => {
    expect(imageAlignClass("full")).toBe("w-full");
    expect(imageAlignClass(null)).toBe("w-full");
    expect(imageAlignClass("bogus")).toBe("w-full");
  });
});
