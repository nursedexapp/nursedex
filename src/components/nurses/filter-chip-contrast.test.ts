// @vitest-environment node
//
// #778. An applied filter chip paints white on teal. The clear control and the
// Saved chip's count were white at 90% opacity, which composites to 4.43:1 on
// that teal: over the 3:1 an icon needs, under the 4.5:1 text needs. Which
// floor applies depends on whether you call a small x an icon or a character,
// and one of the two clear controls was literally drawn as a character.
//
// Rather than settle that argument, both are full white, which clears the
// higher floor. This measures the real tokens so the claim cannot rot: a later
// change back to a translucent white fails here rather than on somebody's
// screen.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, AA_BODY_TEXT } from "@/lib/ui/contrast";

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Resolve a --color-* token to a hex value, following one level of aliasing. */
function token(name: string): string {
  const direct = CSS.match(
    new RegExp(`--color-${name}:\\s*([^;]+);`),
  )?.[1]?.trim();
  if (!direct) throw new Error(`No --color-${name} in globals.css`);
  const alias = direct.match(/var\(--color-([\w-]+)\)/);
  return alias ? token(alias[1]) : direct;
}

const CHIP = readFileSync(
  join(process.cwd(), "src/components/nurses/FilterChip.tsx"),
  "utf8",
);
const ROW = readFileSync(
  join(process.cwd(), "src/components/nurses/FilterChipRow.tsx"),
  "utf8",
);

describe("an applied filter chip", () => {
  const teal = token("teal");

  it("is painted on the teal the tokens actually define", () => {
    // The guard is worthless if the chip stops using this colour.
    expect(CHIP).toContain("bg-teal");
    expect(ROW).toContain("bg-teal");
    expect(teal).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("clears the text floor with full white", () => {
    expect(contrastRatio("#ffffff", teal)).toBeGreaterThanOrEqual(AA_BODY_TEXT);
  });

  // The measurement that started this: 90% white on the same teal.
  it("would not clear it at 90% white, which is why that is not used", () => {
    const ninetyPercentWhiteOnTeal = composite("#ffffff", 0.9, teal);
    expect(contrastRatio(ninetyPercentWhiteOnTeal, teal)).toBeLessThan(
      AA_BODY_TEXT,
    );
  });

  it.each([
    ["FilterChip.tsx", CHIP],
    ["FilterChipRow.tsx", ROW],
  ])("%s paints nothing on teal in translucent white", (_name, source) => {
    expect(source).not.toMatch(/text-white\/\d/);
  });
});

/** fg at `alpha` over bg, as a hex string. */
function composite(fg: string, alpha: number, bg: string): string {
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  const f = parse(fg);
  const b = parse(bg);
  const mixed = f.map((c, i) => alpha * c + (1 - alpha) * b[i]);
  return `#${mixed.map(hex).join("")}`;
}

function parse(hex: string): number[] {
  const h = hex.replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
