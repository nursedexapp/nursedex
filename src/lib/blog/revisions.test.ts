// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// revisions -> service-role imports "server-only"; stub it so the pure
// helper can be imported.
vi.mock("server-only", () => ({}));

import { idsBeyondLimit, REVISION_LIMIT } from "./revisions";

describe("idsBeyondLimit", () => {
  it("returns nothing when at or under the limit", () => {
    expect(idsBeyondLimit(["a", "b", "c"], 30)).toEqual([]);
    expect(idsBeyondLimit(Array.from({ length: 30 }, (_, i) => `r${i}`), 30)).toEqual([]);
  });

  it("returns the ids past the limit (oldest, since input is newest-first)", () => {
    const ids = Array.from({ length: 33 }, (_, i) => `r${i}`);
    expect(idsBeyondLimit(ids, REVISION_LIMIT)).toEqual(["r30", "r31", "r32"]);
  });
});
