import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractProse } from "@/lib/legal/last-updated";

const prose = extractProse(
  readFileSync(path.join(__dirname, "page.tsx"), "utf8"),
).replace(/\s+/g, " ");

describe("the privacy policy says what the site does", () => {
  it("says browser analytics wait for Accept", () => {
    expect(prose).toMatch(/only after you accept/);
  });
  it("names Global Privacy Control", () => {
    expect(prose).toMatch(/Global Privacy Control/);
  });
  it("discloses the account events our server records whatever the banner says", () => {
    expect(prose).toMatch(/signing in, choosing your role, and payments/);
  });
  it("discloses error reports and performance timing for everyone", () => {
    expect(prose).toMatch(/error reports/);
  });
  it("discloses that videos load from YouTube or Vimeo only when played", () => {
    expect(prose).toMatch(/only when you press play/);
  });
  it("says the account setting also stops session recording", () => {
    expect(prose).toMatch(/turn analytics and session recording off/);
  });
  it("no longer asks visitors to email us to opt out", () => {
    expect(prose).not.toMatch(/would rather opt out, email/);
  });
  it("no longer says analytics run whenever the site is used", () => {
    expect(prose).not.toMatch(
      /When you use the site, we collect standard analytics data/,
    );
  });
});
