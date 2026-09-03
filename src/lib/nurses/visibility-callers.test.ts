import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sourceFilesUnder, normalise } from "../../../test/source-files";

/**
 * Which nurse-visibility filter each surface reads through, and why.
 *
 * There are two, and the difference is not cosmetic. applyListedNurseFilter
 * additionally requires a photo or a bio, so a verified nurse who has filled
 * in nothing is not put in front of a browsing family (#732).
 *
 * Applying that minimum to the wrong surface deletes something a person
 * already has: her saved nurses, or a nurse she PAID to reveal. Both read
 * through applyVisibleNurseFilter, and both would silently lose rows the day
 * somebody "consolidates" the two filters into one. Hence this list, and
 * hence the completeness check below it.
 */
type FilterName =
  | "applyListedNurseFilter"
  | "applyVisibleNurseFilter"
  | "applyUnlistedNurseFilter";

const SURFACES: Array<{ file: string; filter: FilterName; what: string }> = [
  {
    file: "src/lib/nurses/search.ts",
    filter: "applyListedNurseFilter",
    what: "the directory, which puts nurses in front of a stranger",
  },
  {
    file: "src/lib/nurses/facets.ts",
    filter: "applyListedNurseFilter",
    what: "the filter options offered on the directory, which must be counted over exactly the nurses the directory can return (#766)",
  },
  {
    file: "src/app/sitemap.ts",
    filter: "applyListedNurseFilter",
    what: "the sitemap, which offers profiles to search engines",
  },
  {
    file: "src/app/api/cron/not-listed-nudge/route.ts",
    filter: "applyUnlistedNurseFilter",
    what: "telling the nurses the directory does not show that it does not",
  },
  {
    file: "src/lib/nurses/saves.ts",
    filter: "applyVisibleNurseFilter",
    what: "a family's saved nurses, which she chose herself",
  },
  {
    file: "src/lib/reveals/queries.ts",
    filter: "applyVisibleNurseFilter",
    what: "nurses a family has PAID to reveal",
  },
  {
    file: "src/app/(public)/reviews/[slug]/page.tsx",
    filter: "applyVisibleNurseFilter",
    what: "one nurse's review page, reached by her own link",
  },
  {
    file: "src/app/api/cron/upgrade-nudge/route.ts",
    filter: "applyVisibleNurseFilter",
    what: "email to nurses, who need reaching most when the profile is empty",
  },
  {
    file: "src/app/api/cron/review-invite/route.ts",
    filter: "applyVisibleNurseFilter",
    what: "review invites, addressed to the nurse rather than about her",
  },
  {
    file: "src/app/api/cron/featured-analytics/route.ts",
    filter: "applyVisibleNurseFilter",
    what: "a paying nurse's own stats, which she gets regardless",
  },
];

// What each surface must NOT also call. The listed and unlisted filters are
// complements over the same set, so a surface calling both selects nobody.
const OTHER: Record<FilterName, FilterName> = {
  applyListedNurseFilter: "applyUnlistedNurseFilter",
  applyUnlistedNurseFilter: "applyListedNurseFilter",
  applyVisibleNurseFilter: "applyListedNurseFilter",
} as const;

describe("nurse visibility filter call sites", () => {
  it.each(SURFACES)("$file uses $filter for $what", ({ file, filter }) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain(`${filter}(`);
  });

  it.each(SURFACES)("$file uses only that one", ({ file, filter }) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain(`${OTHER[filter]}(`);
  });

  // A hand-written list is exempt from its own rule the moment a ninth
  // surface is added, and then reports green while blind to it.
  it("knows about every surface that reads either filter", () => {
    const found = sourceFilesUnder("src")
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => {
        const source = readFileSync(f, "utf8");
        return (
          source.includes("applyVisibleNurseFilter(") ||
          source.includes("applyListedNurseFilter(") ||
          source.includes("applyUnlistedNurseFilter(")
        );
      })
      .map(normalise)
      .filter((f) => f !== "src/lib/nurses/visibility.ts");
    expect(found.sort()).toEqual(SURFACES.map((s) => s.file).sort());
  });
});
