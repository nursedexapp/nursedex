// @vitest-environment node
//
// Regression guard for issue #568. Slack alerts, replies, and notification
// bodies must be plain text: no emoji.
//
// The deliberate exception is Block Kit *chrome* in views.ts and invoice.ts,
// where a coloured marker is the status vocabulary itself (scanning a channel
// for red vs green) rather than decoration in a sentence. Those lines are
// allowlisted below so removing an emoji from a message body cannot silently
// take the status labels with it, and so adding one back to a message body
// fails here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Covers the pictographic ranges plus the variation selector that renders
// characters like the warning sign as colour emoji. Deliberately excludes the
// star symbols used for review ratings in the email templates.
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2705}\u{26A0}\u{26D4}\u{2795}\u{2728}\u{1F6A8}]/u;

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

/** Files whose entire contents are message text: no emoji anywhere. */
const MESSAGE_FILES = [
  "src/lib/cron/alerting.ts",
  "src/lib/slack/requests.ts",
  "src/app/api/stripe/webhook/route.ts",
  "src/app/api/slack/track/route.ts",
  "src/app/api/slack/interactivity/route.ts",
];

describe("Slack message bodies contain no emoji (issue #568)", () => {
  it.each(MESSAGE_FILES)("%s has no emoji", (file) => {
    const offenders = read(file)
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => EMOJI.test(line));

    expect(offenders.map((o) => `${file}:${o.n} ${o.line.trim()}`)).toEqual([]);
  });
});

describe("alert copy is plain text", () => {
  it("the cron alert leads with the failure, not a siren", () => {
    const src = read("src/lib/cron/alerting.ts");
    expect(src).toMatch(/text: `Cron failed:/);
  });

  it("the Stripe webhook alert leads with the failure", () => {
    const src = read("src/app/api/stripe/webhook/route.ts");
    expect(src).toMatch(/text: `Stripe webhook failed:/);
  });
});

describe("views.ts", () => {
  const views = read("src/lib/slack/views.ts");

  it("keeps the coloured status vocabulary, which is the deliberate exception", () => {
    // If this ever changes, it should be a decision, not a side effect of a
    // sweep through the message bodies. Asserted by pattern rather than by
    // literal characters, so this file stays emoji-free itself.
    const labelLines = views
      .split("\n")
      .filter((line) =>
        /^\s+(urgent|submitted|triaged|approved|rejected|in_progress|done|invoiced):\s*"/.test(
          line,
        ),
      );

    expect(labelLines.length).toBeGreaterThanOrEqual(8);
    expect(labelLines.filter((line) => !EMOJI.test(line))).toEqual([]);
    expect(views).toMatch(/done: "\S+ Done"/);
  });

  it("has no emoji in the done-notification header text", () => {
    expect(views).toMatch(/text: `Request #\$\{opts\.id\} done:/);
  });

  it("does not attribute the suggested estimate to Claude", () => {
    expect(views).not.toMatch(/Suggested by Claude/);
    expect(views).toMatch(/\*Suggested estimate:\*/);
  });
});
