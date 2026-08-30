// @vitest-environment node
//
// The flake instrument has to be wired in, not just written (#805, L3).
//
// A reporter that exists but is not in the config reports nothing, and the
// symptom is identical to a suite that never flakes: a green tick either way.
// That is precisely the confusion this instrument exists to end, so the wiring
// gets its own check.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CONFIG = readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8");

describe("the flake reporter", () => {
  it("exists at the path the config names", () => {
    const named = CONFIG.match(/\["(\.\/e2e\/[a-z-]+\.ts)"\]/);
    expect(named, "no custom reporter is listed in the config").not.toBeNull();
    expect(existsSync(join(process.cwd(), named![1]))).toBe(true);
  });

  it("is listed alongside the html reporter, not instead of it", () => {
    expect(CONFIG).toMatch(/reporter:\s*\[/);
    expect(CONFIG).toContain('["html"]');
    expect(CONFIG).toContain('["./e2e/flake-reporter.ts"]');
  });

  // The instrument is only worth anything while retries exist to hide a
  // failure. If retries were ever removed, a flaky spec would simply go red and
  // this whole apparatus would be measuring nothing, so the two belong
  // together and a reader should be told why.
  it("is paired with the retries that make a flake invisible", () => {
    expect(CONFIG).toMatch(/retries:\s*process\.env\.CI\s*\?\s*2\s*:\s*0/);
  });
});

describe("the onboarding flake that #805 was asked to fix", () => {
  const SPEC = readFileSync(
    join(process.cwd(), "e2e/onboarding.nurse.spec.ts"),
    "utf8",
  );
  const SETUP = readFileSync(join(process.cwd(), "e2e/global-setup.ts"), "utf8");

  // The failure was `page.waitForURL` timing out at 20s after role selection.
  // The URL is transient and the next line navigates explicitly anyway, so the
  // wait could not tell "the redirect never happened" from "it happened and we
  // already moved on" (L239).
  it("waits for the profile row rather than for a URL", () => {
    expect(SPEC).not.toMatch(/waitForURL\(\/onboarding\|dashboard\//);
    expect(SPEC).toMatch(/expect\s*\n?\s*\.poll\(/);
    expect(SPEC).toContain("profileOf(nurseId)");
  });

  // The root cause: Turbopack compiles a route on first request, and nothing
  // had warmed the one the redirect lands on, so the spec paid the compile out
  // of its own budget.
  it("warms the routes this funnel drives before any spec runs", () => {
    for (const route of ["/role-select", "/dashboard/onboarding"]) {
      expect(SETUP, `${route} is not warmed`).toContain(`"${route}"`);
    }
  });
});
