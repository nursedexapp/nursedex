// @vitest-environment node
import { describe, it, expect } from "vitest";
import { authorDisplayName } from "./author";

describe("authorDisplayName", () => {
  it("joins first and last name", () => {
    expect(authorDisplayName({ first_name: "Ada", last_name: "Nguyen" })).toBe(
      "Ada Nguyen",
    );
  });

  it("uses whichever name part is present", () => {
    expect(authorDisplayName({ first_name: "Ada", last_name: null })).toBe("Ada");
    expect(authorDisplayName({ first_name: null, last_name: "Nguyen" })).toBe(
      "Nguyen",
    );
  });

  it("returns null when there is no usable name", () => {
    expect(authorDisplayName({ first_name: null, last_name: null })).toBeNull();
    expect(authorDisplayName({ first_name: "  ", last_name: "" })).toBeNull();
    expect(authorDisplayName(null)).toBeNull();
  });
});
