// @vitest-environment node
//
// Which server the Playwright suite drives, and how many workers run it (#806).
//
// Both were measured on one run each against a 221s baseline for the Playwright
// step, with the same 69 specs executed either way:
//
//   two workers, dev server   233s   slower, rejected
//   one worker, prebuilt      177s   kept, and that figure includes the build
//
// These tests pin the outcome and, as much as they can, the reasoning, because
// the rejected option is the one somebody will propose again.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG = readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8");

describe("the Playwright web server", () => {
  it("is a production build in CI", () => {
    expect(CONFIG).toMatch(
      /command:\s*process\.env\.CI\s*\?\s*"npm run build && npm run start"/,
    );
  });

  // Locally the fast refresh loop is the whole point, and a build per run would
  // be intolerable. A config that built everywhere would be a real regression
  // for the only person who runs this by hand.
  it("is still the dev server locally", () => {
    expect(CONFIG).toMatch(/:\s*"npm run dev"/);
  });

  // The build now happens inside the webServer window. A timeout still sized
  // for a Turbopack cold start would trip occasionally on a slow runner, which
  // is a new flake introduced by a change made to remove one.
  it("allows enough time for the build to happen inside that window", () => {
    const timeout = Number(CONFIG.match(/timeout:\s*(\d+)\s*\*\s*1000/)![1]);
    expect(timeout).toBeGreaterThanOrEqual(240);
  });
});

describe("the CI worker count", () => {
  it("stays at one", () => {
    expect(CONFIG).toMatch(/workers:\s*process\.env\.CI\s*\?\s*1\s*:\s*undefined/);
  });

  // A rejected option with no recorded reason gets re-proposed, and the next
  // person pays for the same measurement again (L308: name the lever you did
  // not pull and what it would change).
  it("records why two was rejected, beside the setting", () => {
    const nearby = CONFIG.slice(
      Math.max(0, CONFIG.indexOf("workers:") - 700),
      CONFIG.indexOf("workers:"),
    );
    expect(nearby).toMatch(/233s/);
    expect(nearby).toMatch(/221s/);
    expect(nearby).toMatch(/slower/i);
  });
});
