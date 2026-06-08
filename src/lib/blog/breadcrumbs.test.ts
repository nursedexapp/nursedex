// @vitest-environment node
import { describe, it, expect } from "vitest";
import { blogPostBreadcrumbs } from "./breadcrumbs";

describe("blogPostBreadcrumbs", () => {
  it("builds Home > Blog > Category > Post when a category is present", () => {
    expect(
      blogPostBreadcrumbs(
        { title: "Home Care 101", slug: "home-care-101" },
        { name: "Home Care", slug: "home-care" },
      ),
    ).toEqual([
      { name: "Home", url: "https://nursedex.com/" },
      { name: "Blog", url: "https://nursedex.com/blog" },
      { name: "Home Care", url: "https://nursedex.com/blog/category/home-care" },
      { name: "Home Care 101", url: "https://nursedex.com/blog/home-care-101" },
    ]);
  });

  it("omits the category step when there is none", () => {
    const crumbs = blogPostBreadcrumbs(
      { title: "A Post", slug: "a-post" },
      null,
    );
    expect(crumbs.map((c) => c.name)).toEqual(["Home", "Blog", "A Post"]);
  });
});
