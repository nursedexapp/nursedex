// @vitest-environment node
//
// #798. The placeholder shown while the directory loads drew six cards into a
// four column grid, so it ended on a row and a half: four, then two, then a
// gap. It is the first thing a family sees on the busiest public page, and a
// ragged half row reads as a broken layout rather than as content arriving.
//
// It was found in a screenshot, which is the only way anyone would find it: a
// loading state is on screen for a moment and no test had an opinion about it.
// This gives it one, derived from the file rather than restated beside it, so
// changing either the card count or the column count fails here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync("src/app/(public)/nurses/loading.tsx", "utf8");

/** Every column count the skeleton grid uses, including its unprefixed one. */
function columnCounts(): number[] {
  const grid = SOURCE.match(/className="grid[^"]*"/)?.[0];
  if (!grid) throw new Error("loading.tsx has no card grid");

  const counts = [...grid.matchAll(/grid-cols-(\d+)/g)].map((m) =>
    Number(m[1]),
  );
  // An unprefixed grid-cols-N sets the base; without one the base is a single
  // column, which is still a column count this has to divide by.
  return counts.length > 0 ? [...new Set([1, ...counts])] : [1];
}

/** How many skeleton cards the grid renders. */
function cardCount(): number {
  const match = SOURCE.match(/Array\.from\(\{\s*length:\s*(\d+)\s*\}\)/);
  expect(
    match,
    "loading.tsx no longer renders a fixed number of cards",
  ).not.toBeNull();
  return Number(match![1]);
}

describe("the directory loading skeleton", () => {
  it("reads a real grid and a real card count", () => {
    // A guard that parsed nothing would divide zero by zero and pass.
    expect(columnCounts().length).toBeGreaterThan(1);
    expect(cardCount()).toBeGreaterThan(0);
  });

  it.each(columnCounts())("fills every row at %i columns", (columns) => {
    expect(
      cardCount() % columns,
      `${cardCount()} cards over ${columns} columns leaves a part row`,
    ).toBe(0);
  });

  // The skeleton stands in for the real card, so a change to one that is not
  // made to the other flashes a different shape on every navigation.
  it("uses the same column counts as the page it stands in for", () => {
    const page = readFileSync("src/app/(public)/nurses/page.tsx", "utf8");
    const pageGrid = page.match(/className="grid gap-\d+[^"]*"/)?.[0];
    expect(pageGrid, "page.tsx has no card grid").toBeTruthy();

    const pageColumns = [...pageGrid!.matchAll(/(?:^|\s|:)grid-cols-(\d+)/g)]
      .map((m) => Number(m[1]))
      .sort();
    const skeletonColumns = columnCounts()
      .filter((c) => c !== 1)
      .sort();
    expect(skeletonColumns).toEqual(pageColumns);
  });
});
