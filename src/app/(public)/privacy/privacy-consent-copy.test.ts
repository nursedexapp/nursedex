import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractProse } from "@/lib/legal/last-updated";

const prose = extractProse(
  readFileSync(path.join(__dirname, "page.tsx"), "utf8"),
).replace(/\s+/g, " ");

describe("the privacy policy says what the site does", () => {
  it("says browser analytics and recording run only after Accept", () => {
    expect(prose).toMatch(
      /Both run in your browser only after you accept them/,
    );
  });
  it("says the answer lasts 12 months and can be changed", () => {
    expect(prose).toMatch(/Privacy choices at the bottom of the site's pages/);
    expect(prose).toMatch(/remembered in your browser for 12 months/);
  });
  it("treats Do Not Track and Global Privacy Control as declining", () => {
    expect(prose).toMatch(
      /Do Not Track or Global Privacy Control, we treat that as declining/,
    );
  });
  it("discloses every account event our server records whatever the banner says", () => {
    expect(prose).toMatch(
      /\(creating an account, signing in, choosing your role, and subscribing or cancelling a plan\)/,
    );
  });
  it("says the account setting stops session recording too", () => {
    expect(prose).toMatch(/turn analytics and session recording off/);
  });
  it("discloses error reports for everyone, and what they leave out", () => {
    expect(prose).toMatch(/For every visitor, Sentry receives error reports/);
    expect(prose).toMatch(
      /do not include what you type into forms or a recording of the page/,
    );
  });
  it("discloses sampled page timing for everyone", () => {
    expect(prose).toMatch(/timing for a sample of page loads/);
  });
  it("discloses that Sentry records a sample of visits and visits where something breaks", () => {
    expect(prose).toMatch(
      /session replays of a sample of visits, and of visits where something breaks, by Sentry/,
    );
  });
  it("discloses that videos load from YouTube or Vimeo only when played", () => {
    expect(prose).toMatch(/only when you press play/);
  });
  it("says declining removes the PostHog cookie", () => {
    expect(prose).toMatch(/if you decline, we remove it/);
  });
  it("lists the banner control and browser signals under your rights", () => {
    expect(prose).toMatch(
      /Opt out of analytics tracking[^.]*Privacy choices[^.]*Do Not Track/,
    );
  });
  it("never claims Privacy choices is on every page", () => {
    // Admin, brand and error pages render no footer, so they have no control.
    expect(prose).not.toMatch(/every page/);
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
