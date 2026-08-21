// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The header is shared chrome across home, blog, pricing, about and the
 * dashboard. It was capped at the same width as the directory feed, so
 * widening the feed alone would have left the logo and nav sitting visibly
 * inside the edges of the card grid (#777, decision D5).
 *
 * Both now read one token rather than restating a number, so they cannot drift
 * apart again. Asserted on the source because the value's whole job is to be
 * the same in two files; a render would only prove one of them.
 */
describe("the site width", () => {
  it("is one token, defined once", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("--container-site:");
    expect(css.match(/--container-site:/g)).toHaveLength(1);
  });

  it("is what the header uses", () => {
    const header = readFileSync("src/components/shared/Header.tsx", "utf8");
    expect(header).toContain("max-w-site");
    expect(header).not.toContain("max-w-6xl");
  });

  it("is what the directory feed uses", () => {
    for (const file of [
      "src/app/(public)/nurses/page.tsx",
      "src/app/(public)/nurses/loading.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} should use the shared width`).toContain(
        "max-w-site",
      );
      expect(source, `${file} still caps itself`).not.toContain("max-w-6xl");
    }
  });

  it("is wide enough for four cards across", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const match = css.match(/--container-site:\s*(\d+)px/);
    // Assert the read succeeded before comparing it. An unmatched regex would
    // otherwise reach the comparison as NaN, which is false against every
    // threshold: the test would still fail, but it would report the width as
    // too small rather than saying the token could not be read.
    expect(match, "--container-site is not declared in px").not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(1400);
  });

  it("puts a four column grid on the feed at the widest breakpoint", () => {
    const page = readFileSync("src/app/(public)/nurses/page.tsx", "utf8");
    expect(page).toContain("2xl:grid-cols-4");
  });
});
