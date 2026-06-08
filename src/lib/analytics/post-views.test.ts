// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseViewRows } from "./post-views";

describe("parseViewRows", () => {
  it("maps [post_id, count] rows to a count map", () => {
    expect(
      parseViewRows([
        ["post-1", 42],
        ["post-2", 7],
      ]),
    ).toEqual({ "post-1": 42, "post-2": 7 });
  });

  it("ignores malformed rows and non-array input", () => {
    expect(
      parseViewRows([
        ["post-1", 3],
        ["post-2"], // too short
        [null, 9], // bad id
        ["post-3", "x"], // bad count
        "nope",
      ]),
    ).toEqual({ "post-1": 3 });
    expect(parseViewRows(null)).toEqual({});
    expect(parseViewRows(undefined)).toEqual({});
  });
});
