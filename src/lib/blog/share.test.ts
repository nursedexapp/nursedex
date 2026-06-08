// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildShareLinks } from "./share";

describe("buildShareLinks", () => {
  it("builds encoded share-intent URLs for X, Facebook, and LinkedIn", () => {
    const links = buildShareLinks(
      "https://nursedex.com/blog/home-care",
      "Home Care 101",
    );
    const byName = Object.fromEntries(links.map((l) => [l.name, l.href]));
    expect(byName.X).toBe(
      "https://twitter.com/intent/tweet?url=https%3A%2F%2Fnursedex.com%2Fblog%2Fhome-care&text=Home%20Care%20101",
    );
    expect(byName.Facebook).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fnursedex.com%2Fblog%2Fhome-care",
    );
    expect(byName.LinkedIn).toBe(
      "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fnursedex.com%2Fblog%2Fhome-care",
    );
  });
});
