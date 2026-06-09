import { defineConfig, devices } from "@playwright/test";

// Authenticated blog tests create real posts, so they only run when
// explicitly enabled (E2E_AUTH=1) against a local/test Supabase. The
// default e2e run keeps the existing unauthenticated specs and never
// touches a production database. See e2e/README.md.
const AUTH = process.env.E2E_AUTH === "1";
const ADMIN_STATE = "e2e/.auth/admin.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
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
      testIgnore: ["**/auth.setup.ts", "**/*.auth.spec.ts"],
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
