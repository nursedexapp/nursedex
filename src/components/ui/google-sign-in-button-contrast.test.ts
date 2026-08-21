// @vitest-environment node
//
// #751. The "Continue with Google" label was painted in its own background
// colour on /login and /signup: contrast 1.0, invisible, on the primary sign-in
// path. Nothing caught it because every existing check measured PRESENCE.
//
//   google-sign-in-button.test.tsx:67 asserts the accessible name is
//   "Continue with Google". The text is in the DOM, so it passed.
//
//   e2e/auth.spec.ts:31 asserts getByText(...) is visible. Playwright's
//   visibility means a non-empty box and no visibility:hidden. Text drawn in the
//   background colour satisfies both.
//
// So this reads the button's REAL classes, resolves them through the real
// tokens, and computes the ratio a person would actually experience.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, AA_BODY_TEXT } from "@/lib/ui/contrast";

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const BUTTON = readFileSync(
  join(process.cwd(), "src/components/ui/google-sign-in-button.tsx"),
  "utf8",
);

/** Resolve a --color-* token to a hex value, following one level of aliasing. */
function token(name: string): string {
  const direct = CSS.match(
    new RegExp(`--color-${name}:\\s*([^;]+);`),
  )?.[1]?.trim();
  if (!direct) throw new Error(`No --color-${name} in globals.css`);

  const alias = direct.match(/var\(--color-([\w-]+)\)/);
  return alias ? token(alias[1]) : direct;
}

/** The className the sign-in button hands to the shared Button. */
function buttonClassName(): string {
  // Anchored to the PendingButton element on purpose. Matching the first
  // className="bg-..." in the file finds the ERROR BANNER above it, whose text
  // and background are both the error colour, so the measurement returned a
  // ratio of 1.0 for an element nobody was asking about. An earlier version of
  // this test did exactly that, and would have gone green once the button was
  // fixed without ever having measured the button.
  const el = BUTTON.slice(BUTTON.indexOf("<PendingButton"));
  if (!el.startsWith("<PendingButton")) {
    throw new Error("Could not find the PendingButton element");
  }
  const m = el.match(/className="([^"]*)"/);
  if (!m) throw new Error("PendingButton has no className");
  return m[1];
}

/** True when a --color-<name> token actually exists. */
function isColourToken(name: string): boolean {
  return new RegExp(`--color-${name}:`).test(CSS);
}

/**
 * The text COLOUR class, if any. Tailwind spells sizes the same way as colours
 * (text-base, text-sm), so matching /text-\w+/ finds a size and calls it a
 * colour. An earlier version of this test did exactly that and passed against
 * the broken button.
 */
function textColour(cls: string): string | undefined {
  return [...cls.matchAll(/\btext-([a-z][a-z0-9-]*)\b/g)]
    .map((m) => m[1])
    .find(isColourToken);
}

function bgColour(cls: string): string | undefined {
  return [...cls.matchAll(/\bbg-([a-z][a-z0-9-]*)\b/g)]
    .map((m) => m[1])
    .find(isColourToken);
}

describe("Google sign-in button is legible", () => {
  it("sets its own text colour when it overrides the background", () => {
    // The defect itself. Overriding only the background leaves the default
    // variant's text-primary-foreground in place, and that token resolves to
    // the very colour the override sets the background to.
    expect(textColour(buttonClassName())).toBeTruthy();
  });

  it("meets AA contrast for body text", () => {
    const cls = buttonClassName();
    const bg = bgColour(cls);
    const fg = textColour(cls);

    expect(bg).toBeTruthy();
    expect(fg).toBeTruthy();

    const ratio = contrastRatio(token(fg!), token(bg!));
    expect(ratio).toBeGreaterThanOrEqual(AA_BODY_TEXT);
  });

  it("proves the measurement catches the bug it was written for", () => {
    // A positive control. Without it the two assertions above would pass just as
    // happily against a broken ratio calculation. These are the exact two values
    // that shipped: --color-primary-foreground aliases --color-warm-white, and
    // the override set the background to warm-white.
    const shipped = contrastRatio(token("primary-foreground"), token("warm-white"));
    expect(shipped).toBeCloseTo(1, 5);
    expect(shipped).toBeLessThan(AA_BODY_TEXT);
  });
});
