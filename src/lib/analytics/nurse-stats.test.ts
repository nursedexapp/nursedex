import { describe, it, expect } from "vitest";
import { percentChange } from "@/lib/analytics/nurse-stats";

describe("percentChange", () => {
  it("returns 0 when both numbers are 0", () => {
    expect(percentChange(0, 0)).toBe(0);
  });

  it("returns null when prior is 0 and current is non-zero (avoids divide-by-zero)", () => {
    expect(percentChange(10, 0)).toBeNull();
  });

  it("computes a normal positive change", () => {
    expect(percentChange(150, 100)).toBe(50);
  });

  it("computes a normal negative change", () => {
    expect(percentChange(50, 100)).toBe(-50);
  });

  it("rounds to whole percent", () => {
    expect(percentChange(101, 100)).toBe(1);
    expect(percentChange(106, 100)).toBe(6);
  });

  it("handles 100% drop", () => {
    expect(percentChange(0, 50)).toBe(-100);
  });
});
