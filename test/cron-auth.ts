// Shared cron auth-guard test helper. Every cron route is a public endpoint
// guarded only by `verifyCronAuth` (a bearer CRON_SECRET check), and every cron
// test used to hand-roll both the request fixture and the guard assertions. That
// duplication let the guard tests drift in three directions, each of which was a
// real hole:
//
//   1. Two crons had no guard test at all (#617).
//   2. Five asserted "no email sent" against an empty result set, so they passed
//      whether or not the guard existed: there was no row to act on either way
//      (#629).
//   3. Four replaced `verifyCronAuth` with a mock, making the test circular: it
//      proved that a stubbed guard's 401 is returned, never that the real secret
//      comparison rejects anyone (#618).
//
// `describeCronAuthGuard` closes all three by construction. It takes the seed and
// the side-effect spies as required arguments, so a test that proves nothing is
// harder to write than one that works, and it drives the REAL guard: mock
// `@/lib/cron/auth` in a cron test and you are back to case 3.

import { it, expect, type Mock } from "vitest";
import type { NextRequest } from "next/server";

/**
 * The secret the guard is exercised against. A cron test must set
 * `process.env.CRON_SECRET = TEST_CRON_SECRET` before importing its route, since
 * `verifyCronAuth` reads the env var at call time.
 */
export const TEST_CRON_SECRET = "test-secret";

/**
 * A request carrying the bearer token Vercel's cron runner sends, or, when
 * `authed` is false, no authorization header at all.
 */
export function cronRequest(authed = true): NextRequest {
  return {
    headers: {
      get: (k: string) =>
        k === "authorization" && authed ? `Bearer ${TEST_CRON_SECRET}` : null,
    },
  } as unknown as NextRequest;
}

export interface CronAuthGuardOptions {
  /** The route's GET export, driving the real `verifyCronAuth`. */
  GET: (request: NextRequest) => Promise<Response>;
  /**
   * Populate the mocked client with data that WOULD cause a side effect if an
   * unauthenticated request reached the handler: a subscriber due an email, an
   * overdue queue, a post ready to publish. Required, because against an empty
   * result set the spy assertions below hold with or without the guard (#629).
   */
  seedSideEffect: () => void;
  /**
   * The spies that must stay untouched: mailers, Slack posts, writes, and the
   * dedup gate. Asserting on the dedup gate as well as the mailer is what proves
   * the guard short-circuits before the database, not merely before the mailer.
   */
  sideEffectSpies: Record<string, Mock>;
}

/**
 * Register the two assertions every cron guard owes: it rejects an
 * unauthenticated caller, and it does so before doing any work.
 *
 * These are two separate tests on purpose. Folded into one, the side-effect
 * expectations sit behind `expect(res.status).toBe(401)` and never execute once
 * that assertion throws, so a route with its guard stripped would never reach
 * them and the seeding would buy nothing.
 */
export function describeCronAuthGuard({
  GET,
  seedSideEffect,
  sideEffectSpies,
}: CronAuthGuardOptions): void {
  it("returns 401 without the cron secret", async () => {
    const res = await GET(cronRequest(false));

    expect(res.status).toBe(401);
  });

  it("does no work at all when unauthenticated", async () => {
    seedSideEffect();

    await GET(cronRequest(false));

    for (const [name, spy] of Object.entries(sideEffectSpies)) {
      expect(spy, `${name} ran for an unauthenticated caller`).not.toHaveBeenCalled();
    }
  });
}
