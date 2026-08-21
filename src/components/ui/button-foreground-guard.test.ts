// @vitest-environment node
//
// #751, the class rather than the instance.
//
// The shared Button's variants pair a background with a foreground:
// `default` is bg-primary + text-primary-foreground. A caller that overrides
// only the background keeps the other half of a pair it is no longer using. On
// the Google sign-in button those two happened to resolve to the SAME colour,
// so the label was painted invisibly on the primary sign-in path.
//
// That is a property of the component, not of that one button, and it will hold
// for the next caller who swaps a background. This guard makes the omission a
// failing test rather than something noticed by a user.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

const COLOUR_TOKENS = new Set(
  [...CSS.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]),
);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") && !full.endsWith(".test.tsx") ? [full] : [];
  });
}

/** Longest colour token matching a utility, so `sage-dark` beats `sage`. */
function colourOf(prefix: string, cls: string): string | undefined {
  return [...cls.matchAll(new RegExp(`\\b${prefix}-([a-z][a-z0-9-]*)\\b`, "g"))]
    .map((m) => m[1])
    .find((name) => COLOUR_TOKENS.has(name));
}

/**
 * Does this className swap a solid background without bringing a foreground?
 * Extracted so the rule can be proved against the exact string that shipped
 * broken, rather than only against a tree that is currently clean.
 */
export function isOffending(cls: string): boolean {
  const bg = [...cls.matchAll(/\bbg-([a-z][a-z0-9-]*)(?![\w/])/g)]
    .map((b) => b[1])
    .find((name) => COLOUR_TOKENS.has(name));
  return Boolean(bg) && !colourOf("text", cls);
}

interface Offence {
  file: string;
  className: string;
  background: string;
}

function findOffences(): Offence[] {
  const out: Offence[] = [];

  for (const file of tsxFiles(join(process.cwd(), "src"))) {
    const src = readFileSync(file, "utf8");

    for (const m of src.matchAll(/<(?:Pending)?Button\b([\s\S]{0,900}?)\/?>/g)) {
      const tag = m[1];
      const cls = tag.match(/className="([^"]*)"/)?.[1];
      if (!cls) continue;

      // Only a solid background counts. bg-foo/10 is a tint laid over whatever
      // is behind it and does not replace the variant's pairing.
      if (!isOffending(cls)) continue;

      const bg = [...cls.matchAll(/\bbg-([a-z][a-z0-9-]*)(?![\w/])/g)]
        .map((b) => b[1])
        .find((name) => COLOUR_TOKENS.has(name))!;

      out.push({
        file: file.replace(`${process.cwd()}/`, ""),
        className: cls,
        background: bg,
      });
    }
  }

  return out;
}

describe("Button background overrides carry their own foreground", () => {
  it("finds no caller that swaps the background and keeps the variant's text colour", () => {
    const offences = findOffences();

    expect(
      offences,
      offences.length === 0
        ? ""
        : `These pass a solid background to Button without a text colour, so they keep the variant's foreground, which may be the same colour:\n` +
            offences
              .map((o) => `  ${o.file}\n    bg-${o.background} in "${o.className}"`)
              .join("\n"),
    ).toEqual([]);
  });

  // Seen to fail. This is the exact className that shipped on the Google
  // sign-in button and rendered its label invisible. A tree-wide scan that
  // silently matches nothing looks identical to a clean tree, so the rule is
  // proved against the real defect rather than against today's tidy state.
  it("flags the exact className that shipped broken", () => {
    expect(
      isOffending(
        "bg-warm-white border-sage-dark/50 hover:bg-sage-light/30 h-11 w-full " +
          "text-base font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50",
      ),
    ).toBe(true);
  });

  it("accepts the fixed version", () => {
    expect(
      isOffending(
        "bg-warm-white text-soft-black border-sage-dark/50 hover:bg-sage-light/30 " +
          "h-11 w-full text-base font-semibold shadow-sm",
      ),
    ).toBe(false);
  });

  it("does not flag a tint, which does not replace the variant pairing", () => {
    expect(isOffending("bg-error/10 mb-3 rounded-lg px-4 py-3")).toBe(false);
  });

  it("does not flag a button that sets no background at all", () => {
    expect(isOffending("h-11 w-full text-base font-semibold")).toBe(false);
  });
});
