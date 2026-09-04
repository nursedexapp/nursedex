import { describe, it, expect } from "vitest";
import * as dotenv from "dotenv";
import path from "path";
import {
  VERCEL_PROJECT_ID,
  VERCEL_TEAM_ID,
} from "../../../scripts/promote-transport";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

/**
 * Skew Protection is on, and this is what says so tomorrow.
 *
 * A Next.js Server Action is addressed by an id baked into the build that
 * served the page. Without version pinning, a browser holding a page from
 * before a deployment posts an id the new build has never heard of, and the
 * server refuses it by name: `UnrecognizedActionError: Server Action "..." was
 * not found on the server`. The person sees a control that does nothing. It
 * happened on /dashboard on 2026-09-03, after five production deployments in
 * one evening, and Sentry reported it.
 *
 * The setting that prevents it lives in the Vercel dashboard, which nothing in
 * this repository can see. It was off, on a Pro plan where it is available,
 * and no test, guard or workflow would ever have said so: the only evidence
 * was the absence of `dpl=` in the production HTML, which nobody was looking
 * at. It was turned on the same evening.
 *
 * So the value is asserted on a schedule rather than trusted. An application
 * level check cannot see a change made in the dashboard, and the whole effect
 * of the setting being off is to remove a protection quietly (L502).
 */
describe("Skew Protection health check", () => {
  it("is still switched on for the production project", async () => {
    const token = process.env.VERCEL_TOKEN;
    // A check that stands down when its credentials are absent reports a pass,
    // and a pass is what this exists to make meaningful.
    expect(
      token,
      "VERCEL_TOKEN is not set, so Skew Protection was not checked at all",
    ).toBeTruthy();

    const response = await fetch(
      `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}?teamId=${VERCEL_TEAM_ID}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    // The status always, not just the body: a response carrying no body would
    // otherwise read as no information rather than as the diagnosis it is.
    const body = await response.text();
    expect(
      response.ok,
      `Vercel answered ${response.status} ${response.statusText}: ${body.slice(0, 200)}`,
    ).toBe(true);

    const project = JSON.parse(body) as {
      skewProtectionMaxAge?: number | null;
    };

    // Null is the off state. Any positive number is a window in seconds.
    //
    // Worth knowing before changing it through the API: PATCHing
    // `skewProtectionMaxAge: null` is accepted with a 200 and stores nothing,
    // so an attempt to turn it off that way reads as success and changes
    // nothing. `0` is what actually turns it off. Measured on 2026-09-03,
    // which is also how this assertion was proved able to fail.
    expect(
      project.skewProtectionMaxAge ?? 0,
      "Skew Protection is off for the production project, so a deployment " +
        "breaks any page a person already has open",
    ).toBeGreaterThan(0);
  });
});
