/**
 * WCAG relative luminance and contrast ratio (#751).
 *
 * Exists because every check the project had measured whether text was PRESENT,
 * never whether it could be READ. The Google sign-in label was in the DOM, had a
 * correct accessible name, and was reported visible by Playwright, while being
 * painted in exactly its own background colour at a contrast ratio of 1.0.
 */

/** #rgb, #rrggbb, or #rrggbbaa (alpha ignored). Throws on anything else. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;

  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(full)) {
    // Refusing beats defaulting: a colour we cannot read must not silently
    // become black and score a comfortable ratio against a light background.
    throw new Error(`Not a hex colour: ${hex}`);
  }

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * WCAG AA for body text. 4.5, not 3.0: 3.0 is the bar for large text, which
 * means 24px, or 18.66px when bold. A 16px semibold label is neither, and
 * reaching for the lower number because a label "looks big" is how this gets
 * quietly re-broken.
 */
export const AA_BODY_TEXT = 4.5;
