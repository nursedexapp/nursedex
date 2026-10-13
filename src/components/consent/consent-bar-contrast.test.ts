// @vitest-environment node
//
// #1160. Dan, looking at the first screenshots: "I feel like it blends into the
// page". The bar was painted in the page's own off white, so only a faint line
// and a shadow told the two apart. The design round settled on a pale sage
// surface (docs/design/consent-banner.html), which moves the link: teal on that
// sage measures 4.0 to 1, under the 4.5 body text needs, so the link is dark
// teal there.
//
// This reads the bar's REAL classes and resolves them through the real tokens,
// so a later edit that puts the bar back on the page colour, or the link back
// to teal, fails here rather than in a screenshot nobody takes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, AA_BODY_TEXT } from "@/lib/ui/contrast";

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const BANNER = readFileSync(
  join(process.cwd(), "src/components/consent/ConsentBanner.tsx"),
  "utf8",
);

// WCAG 1.4.11: a control's boundary against what is around it.
const AA_NON_TEXT = 3;
// The surface must read as its own panel, not a tint nobody notices. The
// shipped off white bar measured 1.0 against the page; the chosen sage 1.21.
const DISTINCT_SURFACE = 1.15;

/** Resolve a --color-* token to a hex value, following aliases. */
function token(name: string): string {
  const direct = CSS.match(
    new RegExp(`--color-${name}:\\s*([^;]+);`),
  )?.[1]?.trim();
  if (!direct) throw new Error(`No --color-${name} in globals.css`);
  const alias = direct.match(/var\(--color-([\w-]+)\)/);
  return alias ? token(alias[1]) : direct;
}

function isColourToken(name: string): boolean {
  return new RegExp(`--color-${name}:`).test(CSS);
}

/** The first className after `anchor` in the banner source. */
function classNameAfter(anchor: string): string {
  const at = BANNER.indexOf(anchor);
  if (at < 0) throw new Error(`No ${anchor} in ConsentBanner.tsx`);
  const m = BANNER.slice(at).match(/className="([^"]*)"/);
  if (!m) throw new Error(`No className after ${anchor}`);
  return m[1];
}

/** A colour utility's token, skipping sizes (text-sm) and opacity suffixes. */
function colour(cls: string, prefix: "bg" | "text"): string {
  const name = [
    ...cls.matchAll(
      new RegExp(`(?:^|\\s)${prefix}-([a-z][a-z0-9-]*)(?=\\s|$)`, "g"),
    ),
  ]
    .map((m) => m[1])
    .find(isColourToken);
  if (!name) throw new Error(`No ${prefix} colour token in "${cls}"`);
  return token(name);
}

const bar = classNameAfter('aria-label="Privacy choices"');
const copy = classNameAfter('className="max-w-site');
const link = classNameAfter('href="/privacy"');
const surface = colour(bar, "bg");

describe("the consent bar stands apart from the page", () => {
  it("is filled with its own surface, not the page colour", () => {
    expect(contrastRatio(surface, token("background"))).toBeGreaterThanOrEqual(
      DISTINCT_SURFACE,
    );
  });

  it("keeps its sentence readable on that surface", () => {
    expect(contrastRatio(colour(copy, "text"), surface)).toBeGreaterThanOrEqual(
      AA_BODY_TEXT,
    );
  });

  it("keeps the Privacy policy link readable on that surface", () => {
    expect(contrastRatio(colour(link, "text"), surface)).toBeGreaterThanOrEqual(
      AA_BODY_TEXT,
    );
  });

  it("keeps the teal buttons visible against that surface", () => {
    expect(contrastRatio(token("primary"), surface)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it("proves the measurement catches what it was written for", () => {
    // Positive controls with the two values that would be wrong: the shipped
    // off white bar on the off white page, and the site's teal link on sage.
    expect(
      contrastRatio(token("warm-white"), token("background")),
    ).toBeLessThan(DISTINCT_SURFACE);
    expect(contrastRatio(token("teal"), surface)).toBeLessThan(AA_BODY_TEXT);
  });
});
