import { describe, it, expect } from "vitest";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

/**
 * Does PostHog answer for this project?
 *
 * This used to assert only that two environment variables were set and that
 * the host string contained the word "posthog". That check cannot fail for the
 * reason anybody cares about: it passes just as happily when PostHog is down,
 * when the project has been deleted, and when the key was rotated. Putting it
 * on a schedule (#796) would have added a job whose green light meant nothing
 * (L98).
 *
 * `/array/<key>/config.js` is PostHog's own public bootstrap endpoint. It
 * answers 200 for a live project key and 404 for one it does not recognise,
 * measured against both on 2026-09-01, so a pass here means the service is
 * reachable AND this key still names a real project.
 *
 * What it still does NOT measure: whether events the app sends are actually
 * being recorded. That needs a query against ingested data and a personal API
 * key, which is tracked separately.
 */
describe("PostHog health check", () => {
  it("has PostHog credentials configured", () => {
    expect(process.env.NEXT_PUBLIC_POSTHOG_KEY).toBeTruthy();
    expect(process.env.NEXT_PUBLIC_POSTHOG_HOST).toBeTruthy();
  });

  it("answers for this project key", async () => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

    const res = await fetch(`${host}/array/${key}/config.js`);

    expect(
      res.status,
      `PostHog answered ${res.status} for this project key. 404 means the key ` +
        "no longer names a project (rotated or deleted); anything else means " +
        "PostHog itself is not answering.",
    ).toBe(200);

    // A 200 with an empty or foreign body would mean something else is
    // answering on the host, so the key has to appear in what came back.
    const body = await res.text();
    expect(body).toContain(key);
  });
});
