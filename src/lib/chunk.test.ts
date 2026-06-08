// @vitest-environment node
import { describe, it, expect } from "vitest";
import { chunk } from "./chunk";

describe("chunk", () => {
  it("splits into chunks of at most size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it("handles an empty array and non-positive size", () => {
    expect(chunk([], 5)).toEqual([]);
    expect(chunk([1, 2], 0)).toEqual([[1, 2]]);
  });
});
