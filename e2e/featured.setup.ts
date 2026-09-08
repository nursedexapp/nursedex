import { test as setup, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  serviceClient,
  ensureUser,
  upsertUserRow,
  signInThroughUI,
} from "./helpers/provision";

import { assertNoWriteError } from "@/lib/db/results";

// A verified nurse on the free tier: the only person the Featured offer is
// shown to, and the one the paid product exists for.
//
// She gets her own session rather than sharing the onboarding nurse's, because
// that one is deliberately pre-onboarding (no role, no profile) and the whole
// point of her setup is that nothing is built for her. Playwright runs spec
// files in parallel, so a spec that reached for another spec's nurse would
// pass or fail on which one landed first (L433).
//
// Only runs when E2E_AUTH=1 (see playwright.config.ts). Never point it at a
// production database: it creates users and rewrites profiles.

const FEATURED_STATE = "e2e/.auth/featured.json";
const FIXTURE = "e2e/.auth/featured-fixture.json";

const EMAIL = process.env.TEST_FEATURED_EMAIL ?? "e2e-featured@nursedex.test";
const PASSWORD =
  process.env.TEST_FEATURED_PASSWORD ?? "e2e-featured-password-1234";

const SLUG = "e2e-featured-nurse";

setup("authenticate as a verified nurse on the free tier", async ({ page }) => {
  const service = serviceClient();

  const nurseId = await ensureUser(service, EMAIL, PASSWORD);

  await upsertUserRow(service, {
    id: nurseId,
    email: EMAIL,
    role: "nurse",
    first_name: "Freya",
    last_name: "Free",
    // Step 5 of onboarding. Without it /dashboard does not render at all: it
    // is one of the three pages that redirect an unfinished profile into the
    // wizard (ONBOARDING_GATED_PAGES), and the spec would then be asserting
    // about a page the nurse never reaches.
    zip_code: "11772",
  });

  // Verified and free are both stated rather than left to the column defaults,
  // because they ARE the case under test: the dashboard shows the Featured
  // offer only to a nurse who is both, so a fixture that drifted to either
  // pending or featured would leave the spec asserting on a page with no offer
  // on it, and the failure would name a missing link rather than a wrong
  // fixture.
  // FINISHED, not merely present. /dashboard is one of the pages that refuse
  // to render for a nurse whose profile is incomplete and send her into the
  // wizard instead, so a minimal profile row does not put her on the dashboard
  // at all. Every field below is one `getOnboardingStatus` reads, in its step
  // order: writing them from that function rather than from a guess is what
  // keeps this fixture honest if a step gains a requirement, because the spec
  // fails on the redirect rather than passing against a page nobody sees.
  const { error } = await service.from("nurse_profiles").upsert(
    {
      user_id: nurseId,
      slug: SLUG,
      verification_status: "verified",
      tier: "free",
      // Step 1
      years_experience: 6,
      languages: ["English"],
      // Step 2. An RN needs no licence number; one is written anyway so the
      // row does not depend on that exemption staying true.
      credential: "rn",
      license_number: "E2E-FEATURED-001",
      care_types: ["elderly"],
      // Step 3
      skills: ["medication_management", "vital_signs"],
      availability_commitment: ["part_time"],
      time_slots: ["weekdays"],
      // Step 4
      bio: "Verified free tier nurse used by the Featured checkout journey.",
      photos: ["e2e-featured-photo.png"],
      has_photo: true,
      // Step 5
      travel_radius_miles: 20,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw new Error(`Could not create the featured spec's nurse: ${error.message}`);
  }

  // A previous run may have left a subscription behind, and createCheckoutSession
  // refuses outright when one is active ("You already have an active
  // subscription"). That refusal is a correct behaviour with its own coverage,
  // but arriving at it here would mean the journey never reaches the checkout
  // it is written to walk, while still producing an error on screen and
  // reading exactly like the failure path passing (L159).
  await assertNoWriteError(
    service.from("subscriptions").delete().eq("user_id", nurseId),
    "the clearing of this nurse's fixture subscriptions",
  );

  await signInThroughUI(page, EMAIL, PASSWORD);

  await page.context().storageState({ path: FEATURED_STATE });

  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(FIXTURE, JSON.stringify({ nurseId, email: EMAIL, slug: SLUG }));

  expect(nurseId).toBeTruthy();
});
