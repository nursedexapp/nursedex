// @vitest-environment node
import { describe, it, expect } from "vitest";
import { constantTimeEqual } from "./constant-time";

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("hunter2", "hunter2")).toBe(true);
  });

  it("returns false when the content differs at the same length", () => {
    expect(constantTimeEqual("hunter2", "hunter3")).toBe(false);
  });

  it("returns false when a differs only in its first character", () => {
    expect(constantTimeEqual("Xunter2", "hunter2")).toBe(false);
  });

  it("returns false for a length mismatch (candidate shorter)", () => {
    expect(constantTimeEqual("hunter2", "hunter")).toBe(false);
  });

  it("returns false for a length mismatch (candidate longer)", () => {
    expect(constantTimeEqual("hunter2", "hunter2extra")).toBe(false);
  });

  it("returns false when one side is empty", () => {
    expect(constantTimeEqual("hunter2", "")).toBe(false);
    expect(constantTimeEqual("", "hunter2")).toBe(false);
  });

  it("returns true when both sides are empty", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("handles multi-byte characters", () => {
    expect(constantTimeEqual("café日本語", "café日本語")).toBe(true);
    expect(constantTimeEqual("café日本語", "cafe日本語")).toBe(false);
  });
});
