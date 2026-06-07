// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const like = vi.fn();
const neq = vi.fn();
const select = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from }),
}));

import { slugify, ensureUniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Finding a Nurse in New York")).toBe(
      "finding-a-nurse-in-new-york",
    );
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("Home Care 101: What's Next?!")).toBe(
      "home-care-101-what-s-next",
    );
  });

  it("drops accents rather than turning them into hyphens", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });
});

describe("ensureUniqueSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // from().select().like() resolves to the rows; .neq() chains before the await
    neq.mockResolvedValue({ data: [] });
    like.mockReturnValue({ neq, then: undefined });
    select.mockReturnValue({ like });
    from.mockReturnValue({ select });
  });

  it("returns the base slug when nothing collides", async () => {
    like.mockResolvedValue({ data: [] });
    expect(await ensureUniqueSlug("Hello World")).toBe("hello-world");
  });

  it("appends the next free suffix on collision", async () => {
    like.mockResolvedValue({
      data: [{ slug: "hello-world" }, { slug: "hello-world-2" }],
    });
    expect(await ensureUniqueSlug("Hello World")).toBe("hello-world-3");
  });

  it("excludes the post being edited from the collision set", async () => {
    like.mockReturnValue({ neq });
    neq.mockResolvedValue({ data: [] });
    expect(
      await ensureUniqueSlug("Hello World", "11111111-1111-4111-8111-111111111111"),
    ).toBe("hello-world");
    expect(neq).toHaveBeenCalledWith("id", "11111111-1111-4111-8111-111111111111");
  });
});
