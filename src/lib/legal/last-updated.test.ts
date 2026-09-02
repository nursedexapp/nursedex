// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { LEGAL_PAGES, extractProse } from "./last-updated";

/**
 * #716. The "Last updated" line on a legal page is a claim about the document,
 * and it was maintained by hand: it said June 9 while the policy had materially
 * changed, and it only ever moved because somebody remembered. A stale date on
 * a legal document is worse than no date, because it tells a reader the terms
 * have not changed since a day on which they demonstrably had.
 *
 * The date is now pinned to the WORDING rather than to a person's memory. Each
 * page records the hash of its own prose beside its date, and this test
 * recomputes it. Change a sentence and the test fails, naming the page and the
 * two values to update.
 *
 * Why not derive it from git, which is what the issue first suggested: the
 * merge queue squashes, so the commit date of a page on main is the date it
 * MERGED, not the date the text was written, and a test comparing the rendered
 * date against `git log -1` would go red on main immediately after every merge
 * that touched a policy. It would also need full history at test time, which a
 * shallow checkout or a Vercel build does not have. The wording is the thing
 * the date is actually a claim about, so the wording is what it is tied to.
 */
const root = process.cwd();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe("the legal pages' Last updated dates describe their current wording", () => {
  for (const [name, page] of Object.entries(LEGAL_PAGES)) {
    it(`${name}: the recorded prose hash still matches the page`, () => {
      const source = readFileSync(join(root, page.path), "utf8");
      const actual = sha256(extractProse(source));
      // The hash goes in the MESSAGE, not only in the comparison: the runner
      // truncates the values it prints in a diff, and a half-printed hash is
      // one nobody can copy into the fix.
      expect(
        actual,
        `The ${name} page's wording has changed but it still claims it was last ` +
          `updated on ${page.date}. Set its date to today and its proseSha to ` +
          `${actual} in src/lib/legal/last-updated.ts.`,
      ).toBe(page.proseSha);
    });

    it(`${name}: renders its date from the record rather than hardcoding one`, () => {
      // A recorded value nothing reads guards nothing (the page would go on
      // printing its own literal date while this file quietly agreed with
      // itself). Assert the page reads the record, and that no hand-typed
      // date survives beside it.
      const source = readFileSync(join(root, page.path), "utf8");
      expect(source).toContain("LEGAL_PAGES");
      expect(
        source,
        `${page.path} still contains a hand-typed "Last updated" date`,
      ).not.toMatch(
        /Last updated:\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)/,
      );
    });

    it(`${name}: the recorded date is a real date and is not in the future`, () => {
      const parsed = new Date(`${page.date} UTC`);
      expect(Number.isNaN(parsed.getTime()), `${page.date} is not a date`).toBe(
        false,
      );
      expect(
        parsed.getTime() <= Date.now(),
        `${name} claims it was last updated on ${page.date}, which has not happened yet`,
      ).toBe(true);
    });
  }
});

describe("extractProse", () => {
  // The extractor has one job: change when the words change, hold still when
  // only the markup does. Both halves are asserted, because an extractor that
  // ignored everything would pass the first half of that on its own.
  it("ignores styling and attribute changes", () => {
    const before = `return (<p className="text-sm">We collect your email.</p>);`;
    const after = `return (<p className="text-lg font-bold">We collect your email.</p>);`;
    expect(extractProse(after)).toBe(extractProse(before));
  });

  it("notices a changed sentence", () => {
    const before = `return (<p>We collect your email.</p>);`;
    const after = `return (<p>We sell your email.</p>);`;
    expect(extractProse(after)).not.toBe(extractProse(before));
  });

  it("ignores the imports and metadata above the markup", () => {
    const before = `import Link from "next/link";\nreturn (<p>Hello.</p>);`;
    const after = `import Link from "next/link";\nimport X from "y";\nreturn (<p>Hello.</p>);`;
    expect(extractProse(after)).toBe(extractProse(before));
  });

  it("holds still when only the rendered date changes", () => {
    // Otherwise the guard is circular: bumping the date would change the hash,
    // which would demand bumping the date.
    const source = `return (<p>Last updated: {LEGAL_PAGES.privacy.date}</p>);`;
    expect(extractProse(source)).toContain("{LEGAL_PAGES.privacy.date}");
  });
});
