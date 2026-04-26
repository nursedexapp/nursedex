import { describe, it, expect } from "vitest";

// Test the slug formatting logic directly (without Supabase)
function formatSlug(firstName: string, lastName: string, credential: string) {
  return `${firstName}-${lastName}-${credential}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

describe("slug formatting", () => {
  it("generates basic slug from name and credential", () => {
    expect(formatSlug("Jane", "Doe", "rn")).toBe("jane-doe-rn");
  });

  it("handles uppercase input", () => {
    expect(formatSlug("JOHN", "SMITH", "LPN")).toBe("john-smith-lpn");
  });

  it("strips special characters", () => {
    expect(formatSlug("Mary-Ann", "O'Brien", "cna")).toBe(
      "mary-ann-obrien-cna",
    );
  });

  it("collapses multiple dashes", () => {
    expect(formatSlug("Jane  ", " Doe", "rn")).toBe(
      "jane--doe-rn".replace(/--+/g, "-"),
    );
  });

  it("handles single-name edge case", () => {
    expect(formatSlug("Madonna", "", "np")).toBe("madonna-np");
  });

  it("strips leading/trailing dashes", () => {
    expect(formatSlug("-Jane", "Doe-", "rn")).toBe("jane-doe-rn");
  });

  it("handles numeric characters in names", () => {
    expect(formatSlug("Jane2", "Doe3", "hha")).toBe("jane2-doe3-hha");
  });

  it("handles accented characters by stripping them", () => {
    // Non-ascii letters get stripped by the regex
    expect(formatSlug("José", "García", "rn")).toBe("jos-garca-rn");
  });
});
