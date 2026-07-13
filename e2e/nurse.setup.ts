import { test as setup, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  serviceClient,
  ensureUser,
  resetNurseToPreOnboarding,
  signInThroughUI,
} from "./helpers/provision";

// A nurse who has just signed up, and nothing more.
//
// No role, and so no profile: role selection is what creates the profile row,
// and the onboarding journey has to create it the way a real nurse does, by
// filling the form. Anything this setup pre-builds is a step the test stops
// covering, so it pre-builds as little as possible.
//
// Only runs when E2E_AUTH=1 (see playwright.config.ts). Never point it at a
// production database: it creates users and deletes profiles.

const NURSE_STATE = "e2e/.auth/nurse.json";
const FIXTURE = "e2e/.auth/nurse-fixture.json";

const EMAIL = process.env.TEST_NURSE_EMAIL ?? "e2e-onboarding@nursedex.test";
const PASSWORD =
  process.env.TEST_NURSE_PASSWORD ?? "e2e-onboarding-password-1234";

setup("authenticate as a freshly signed up nurse", async ({ page }) => {
  const service = serviceClient();

  const nurseId = await ensureUser(service, EMAIL, PASSWORD);

  // handle_new_user() already wrote the public.users row with a NULL role. If a
  // previous run finished onboarding, put it back to that state.
  await resetNurseToPreOnboarding(service, nurseId);

  // Lands on /role-select rather than /dashboard, which is exactly where a nurse
  // with no role belongs.
  await signInThroughUI(page, EMAIL, PASSWORD);

  await page.context().storageState({ path: NURSE_STATE });

  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(FIXTURE, JSON.stringify({ nurseId, email: EMAIL }));

  expect(nurseId).toBeTruthy();
});
