import { defineConfig, devices } from "@playwright/test";
import { CONSENT_ANSWERED } from "./e2e/helpers/consent-state";

// Authenticated blog tests create real posts, so they only run when
// explicitly enabled (E2E_AUTH=1) against a local/test Supabase. The
// default e2e run keeps the existing unauthenticated specs and never
// touches a production database. See e2e/README.md.
const AUTH = process.env.E2E_AUTH === "1";
const ADMIN_STATE = "e2e/.auth/admin.json";
const FAMILY_STATE = "e2e/.auth/family.json";
const NURSE_STATE = "e2e/.auth/nurse.json";
const FEATURED_STATE = "e2e/.auth/featured.json";

export default defineConfig({
  testDir: "./e2e",
  // The dev server answers on / long before Turbopack has compiled every
  // route, and a request that lands early gets a real 404. This warms the
  // routes the suite uses before any spec runs (#623).
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One worker in CI, deliberately (#806). Two was measured on the same suite
  // and was SLOWER: 233s against 221s, with the same 69 specs and no flakes.
  //
  // The runner has TWO cores, measured from os.cpus().length on a real run
  // (#807 derived two sweep lanes from it). Both #806 and #807 originally said
  // four, taken from the issue text rather than from the machine. Two cores is
  // why a second worker loses: the app server is on the same machine, so the
  // worker and the server contend for the pair. Recorded rather than left
  // blank, so this is not re-run as a new idea.
  workers: process.env.CI ? 1 : undefined,
  // html for the artifact, list so the log says what ran, and the flake
  // reporter so a run that was green only because of retries says so on the
  // run itself and in the step summary (#805). Without it, `retries: 2`
  // absorbs a failure and a reviewer sees the same green tick either way,
  // while the job quietly takes twice as long.
  reporter: [["html"], ["list"], ["./e2e/flake-reporter.ts"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      // Every spec starts with the cookie bar already answered, so it never
      // covers what a spec clicks. consent.spec.ts clears it for itself.
      use: { ...devices["Desktop Chrome"], storageState: CONSENT_ANSWERED },
      // The auth setup and authenticated specs run only via the dedicated
      // projects below (when AUTH is enabled), never in the default run.
      testIgnore: [
        "**/auth.setup.ts",
        "**/*.auth.spec.ts",
        "**/family.setup.ts",
        "**/*.family.spec.ts",
        "**/nurse.setup.ts",
        "**/*.nurse.spec.ts",
        "**/featured.setup.ts",
        "**/*.featured.spec.ts",
      ],
    },
    ...(AUTH
      ? [
          {
            name: "setup",
            testMatch: /auth\.setup\.ts/,
            use: { storageState: CONSENT_ANSWERED },
          },
          {
            name: "authenticated",
            testMatch: /.*\.auth\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: ADMIN_STATE,
            },
            dependencies: ["setup"],
          },
          // The family specs need a DIFFERENT session (a subscribed family, not
          // an admin), so they get their own setup and storageState rather than
          // sharing the admin one.
          {
            name: "family-setup",
            testMatch: /family\.setup\.ts/,
            use: { storageState: CONSENT_ANSWERED },
          },
          {
            name: "family",
            testMatch: /.*\.family\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: FAMILY_STATE,
            },
            dependencies: ["family-setup"],
          },
          // The nurse specs need a third session: a nurse who has just signed
          // up, with no role and no profile, so the onboarding journey builds
          // the profile by filling the form rather than finding one waiting.
          // It depends on "setup" too, because the journey ends with an ADMIN
          // approving the nurse, which needs the admin storageState.
          {
            name: "nurse-setup",
            testMatch: /nurse\.setup\.ts/,
            use: { storageState: CONSENT_ANSWERED },
          },
          {
            name: "nurse",
            testMatch: /.*\.nurse\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: NURSE_STATE,
            },
            dependencies: ["setup", "nurse-setup"],
          },
          // A fourth session: a VERIFIED nurse on the FREE tier, which is the
          // only person the Featured offer is shown to. The onboarding nurse
          // above cannot stand in, because she is deliberately pre-onboarding,
          // and a spec that waited for that journey to verify her would depend
          // on another spec's state while Playwright runs both in parallel.
          {
            name: "featured-setup",
            testMatch: /featured\.setup\.ts/,
            use: { storageState: CONSENT_ANSWERED },
          },
          {
            name: "featured",
            testMatch: /.*\.featured\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: FEATURED_STATE,
            },
            dependencies: ["featured-setup"],
          },
        ]
      : []),
  ],
  webServer: {
    // A production build in CI, not the dev server (#806, measured).
    //
    // Every spec used to drive a Turbopack dev server that compiles each route
    // on first request. That cost sits inside every spec, and it is the class
    // of failure global-setup.ts exists to work around (#623) and the cause of
    // the flake fixed in #805. A production build precompiles every route, so
    // that race disappears by construction rather than by warming a list of
    // routes somebody has to remember to extend.
    //
    // Measured on one run each, against a 221s baseline for the Playwright
    // step, both running the same 69 specs:
    //
    //   two workers, dev server   233s   slower, rejected
    //   one worker, prebuilt      177s   kept
    //
    // The 177s INCLUDES the build. It also included one flaky spec (#831),
    // so the clean figure is lower still.
    //
    // Locally this stays `npm run dev`, where the fast refresh loop is the
    // whole point and a build per run would be intolerable.
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: "http://localhost:3000",
    // Never reuse a server, locally either. One somebody started by hand
    // carries .env.local's production Sentry DSN and PostHog key, not the
    // overrides in `env` below, so reusing it sent a local run's server
    // errors to production Sentry and paged Slack (NURSEDEX-SITE-15 and 16,
    // 2026-10-13). With reuse off, a busy port 3000 fails the run loudly.
    reuseExistingServer: false,
    // The build now happens inside this window, so the old 120s (sized for a
    // Turbopack cold start) no longer describes what is being waited for. The
    // measured run needed well under 120s, but a timeout that trips
    // occasionally on a slow runner would be a new flake, and this is the one
    // place in the config where being generous costs nothing: it is a ceiling
    // on a hang, not a delay anybody waits out.
    timeout: 300 * 1000,
    // The consent spec must see PostHog and Sentry TRY to run after Accept, or
    // "nothing before Accept" passes on a build where they never could. So both
    // are configured, and every address they could send to is one that cannot
    // leave the machine. Playwright merges this over process.env, and Next
    // lets the process environment win over .env.local, an empty value
    // included (processEnv in @next/env skips any key already set). All four
    // are fixed values, never taken from the shell.
    //
    // SENTRY_DSN is empty, so the server SDK (src/sentry.server.config.ts,
    // sentry.edge.config.ts) is off. .env.local holds the PRODUCTION DSN, and
    // a server side send cannot be intercepted by a spec.
    //
    // The browser DSN is on a .invalid host, which never resolves. The CSP's
    // connect-src does not list it, so in every spec but consent.spec.ts the
    // browser refuses the request before it exists; consent.spec.ts bypasses
    // the CSP and fulfils the envelopes in its own route.
    //
    // PostHog's host is a dead local port. The browser only ever talks to the
    // same origin /ingest proxy, which next.config.ts rewrites to this host and
    // consent.spec.ts intercepts; the server's own captures
    // (src/lib/analytics/server.ts) and the proxy reach nothing.
    //
    // Next's own anonymous telemetry is switched off too, so the server has
    // nothing of ours to send off the machine but its database traffic.
    //
    // Measured 2026-10-13: across consent.spec.ts and a run of the public pages,
    // the browser made no request to any host but localhost, 127.0.0.1 and the
    // routed sentry.invalid, and sampling the server's sockets found no
    // connection to Sentry's or PostHog's addresses (task 10 report, fixes).
    env: {
      NEXT_PUBLIC_POSTHOG_KEY: "phc_e2e_placeholder",
      NEXT_PUBLIC_POSTHOG_HOST: "http://127.0.0.1:9",
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "https://e2epublic@sentry.invalid/0",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
