// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The privacy policy is a published legal claim about what the code does, and it
 * drifted (#498, #499). It promised a Do Not Track opt-out that was never wired
 * up, described analytics as if it were anonymous while every signed-in user's
 * email was being sent to PostHog, and asserted that analytics data "is not
 * linked to your identity after 90 days", which nothing implemented.
 *
 * The drift went unnoticed because nothing connected the sentence to the code.
 * These tests are that connection. They are deliberately crude (they read the
 * files as text) because the failure they are guarding against is crude: someone
 * changes what we collect and forgets that a page on the site makes a promise
 * about it.
 *
 * If one of these fails, do not delete it. Either the code stopped honouring the
 * policy, or the policy stopped describing the code, and both are the bug.
 */
const root = process.cwd();
/**
 * Collapsed to single spaces: JSX wraps prose across lines, so a sentence in the
 * policy is not a contiguous string in the file.
 */
const flatten = (s: string) => s.replace(/\s+/g, " ");

const privacy = flatten(
  readFileSync(join(root, "src/app/(public)/privacy/page.tsx"), "utf8"),
);
const posthogConfig = readFileSync(join(root, "src/lib/posthog.ts"), "utf8");
const systemsGuide = readFileSync(
  join(root, "Documents/NurseDex_Systems_Guide.md"),
  "utf8",
);

describe("the privacy policy describes what the code actually does", () => {
  it("only promises a Do Not Track opt-out while the code honours it", () => {
    // The original defect: the sentence was published, respect_dnt was never set,
    // and PostHog defaults it to false. The promise did nothing for anyone.
    const promisesDnt = /Do Not\s*(?:&quot;|")?\s*Track/i.test(privacy);
    const honoursDnt = /respect_dnt:\s*true/.test(posthogConfig);

    expect(
      promisesDnt && !honoursDnt,
      "privacy/page.tsx promises a Do Not Track opt-out but posthog.ts does not set respect_dnt: true",
    ).toBe(false);
  });

  it("discloses that signed-in analytics is identified, because it is", () => {
    // posthog.identify(userId, { email }) sends the email. If we ever stop doing
    // that, this test should be updated in the same change, not deleted.
    expect(privacy).toMatch(/linked to your account and your email address/i);
  });

  it("discloses session recording, because it is switched on", () => {
    expect(privacy).toMatch(/record sessions|session recording|recordings/i);
  });

  it("does not claim analytics stops being linked to you after 90 days", () => {
    // Nothing implemented this. It was a specific, checkable retention promise
    // that was simply untrue, and it is the sentence most likely to be held
    // against us.
    expect(privacy).not.toMatch(/not linked to your identity after 90 days/i);
  });
});

describe("the Systems Guide does not tell us analytics is anonymous", () => {
  it("no longer claims PostHog stores no personal information", () => {
    // This is why the gap survived: the internal doc asserted the opposite of the
    // code, so nobody thought to check.
    expect(systemsGuide).not.toMatch(
      /only tracks anonymous usage data|does not store personal information/i,
    );
  });

  it("says plainly that PostHog holds the user's email", () => {
    expect(systemsGuide).toMatch(/email address/i);
  });
});
