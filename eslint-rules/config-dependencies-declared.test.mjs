// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The ESLint 10 evaluation (#597) found that eslint.config.mjs imports three
// plugins that package.json never declares: @next/eslint-plugin-next,
// eslint-plugin-react and eslint-plugin-react-hooks. They resolved only
// because eslint-config-next happened to pull them in, so the whole lint step
// died with ERR_MODULE_NOT_FOUND the moment that transitive tree changed, and
// it died before a single file was linted rather than as a lint failure.
//
// An undeclared direct import is invisible while it happens to resolve, which
// is why this asserts the declaration rather than the resolution: an install
// that still works is not evidence the dependency is owned.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");

/** Bare package specifiers imported by a module, ignoring relative paths. */
function importedPackages(source) {
  const specifiers = [...source.matchAll(/^import\s+[^"']*from\s+"([^"]+)"/gm)]
    .map((m) => m[1])
    .filter((s) => !s.startsWith(".") && !s.startsWith("node:"));
  // "@scope/name/sub" and "name/sub" both belong to the package, not the path.
  return [
    ...new Set(
      specifiers.map((s) => {
        const parts = s.split("/");
        return s.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
      }),
    ),
  ];
}

describe("eslint.config.mjs dependencies", () => {
  it("declares every package it imports in package.json", () => {
    const config = readFileSync(
      path.join(repoRoot, "eslint.config.mjs"),
      "utf8",
    );
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    );
    const declared = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);

    const imported = importedPackages(config);
    expect(imported.length).toBeGreaterThan(0);

    const undeclared = imported.filter((name) => !declared.has(name));
    expect(undeclared).toEqual([]);
  });

  it("reads the imports it is asserting about", () => {
    // Guards the parser above: a regex that silently matched nothing would
    // make the assertion pass by having no subjects at all (L98).
    const config = readFileSync(
      path.join(repoRoot, "eslint.config.mjs"),
      "utf8",
    );
    expect(importedPackages(config)).toContain("typescript-eslint");
  });
});
