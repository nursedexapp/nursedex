import { defineConfig, devices } from "@playwright/test";

// Authenticated blog tests create real posts, so they only run when
// explicitly enabled (E2E_AUTH=1) against a local/test Supabase. The
// default e2e run keeps the existing unauthenticated specs and never
// touches a production database. See e2e/README.md.
const AUTH = process.env.E2E_AUTH === "1";
const ADMIN_STATE = "e2e/.auth/admin.json";
const FAMILY_STATE = "e2e/.auth/family.json";
const NURSE_STATE = "e2e/.auth/nurse.json";

export default defineConfig({
  testDir: "./e2e",
  // The dev server answers on / long before Turbopack has compiled every
  // route, and a request that lands early gets a real 404. This warms the
  // routes the suite uses before any spec runs (#623).
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
      use: { ...devices["Desktop Chrome"] },
      // The auth setup and authenticated specs run only via the dedicated
      // projects below (when AUTH is enabled), never in the default run.
      testIgnore: [
        "**/auth.setup.ts",
        "**/*.auth.spec.ts",
        "**/family.setup.ts",
        "**/*.family.spec.ts",
        "**/nurse.setup.ts",
        "**/*.nurse.spec.ts",
      ],
    },
    ...(AUTH
      ? [
          { name: "setup", testMatch: /auth\.setup\.ts/ },
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
          { name: "family-setup", testMatch: /family\.setup\.ts/ },
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
          { name: "nurse-setup", testMatch: /nurse\.setup\.ts/ },
          {
            name: "nurse",
            testMatch: /.*\.nurse\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: NURSE_STATE,
            },
            dependencies: ["setup", "nurse-setup"],
          },
        ]
      : []),
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // The Turbopack dev server's cold start in CI can exceed the default 60s.
    timeout: 120 * 1000,
  },
});
