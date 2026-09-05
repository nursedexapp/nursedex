import { test as setup, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  serviceClient,
  ensureUser,
  upsertUserRow,
  signInThroughUI,
} from "./helpers/provision";

import { assertNoWriteError } from "@/lib/db/results";
// Provisions the world the family journeys need, and signs in as the family.
//
// A reveal is the money path: it spends one of the family's capped daily
// reveals and hands over a nurse's real contact details. Migration 059 rewrote
// how it is spent (#691) and the button that fires it changed too (#669), and
// none of that had ever been exercised through the actual app: the database
// tests prove the function behaves, and the component tests prove the button
// behaves, but nothing put the two together.
//
// So this builds a subscribed family and TWO visible verified nurses: one the
// reveal spec reveals, and one the review spec reviews. They get a nurse each on
// purpose. The specs share a family and both write reveals and reviews for their
// nurse, and Playwright runs spec files in parallel: pointed at the same nurse,
// one spec's reset would delete the row the other was standing on.
//
// Only runs when E2E_AUTH=1 (see playwright.config.ts). Never point it at a
// production database: it creates users and spends reveals.

const FAMILY_STATE = "e2e/.auth/family.json";
const FIXTURE = "e2e/.auth/family-fixture.json";

const EMAIL = process.env.TEST_FAMILY_EMAIL ?? "e2e-family@nursedex.test";
const PASSWORD = process.env.TEST_FAMILY_PASSWORD ?? "e2e-family-password-1234";

const NURSE_EMAIL = "e2e-reveal-nurse@nursedex.test";
const NURSE_SLUG = "e2e-reveal-nurse";
const NURSE_PHONE = "555-0142";

const REVIEW_NURSE_EMAIL = "e2e-review-nurse@nursedex.test";
const REVIEW_NURSE_SLUG = "e2e-review-nurse";
const REVIEW_NURSE_FIRST = "Reviewed";

setup(
  "authenticate as a subscribed family, with a nurse to reveal",
  async ({ page }) => {
    const service = serviceClient();

    const familyId = await ensureUser(service, EMAIL, PASSWORD);
    const nurseId = await ensureUser(service, NURSE_EMAIL, PASSWORD);

    await upsertUserRow(service, {
      id: familyId,
      email: EMAIL,
      role: "family",
      first_name: "Fam",
    });

    await upsertUserRow(service, {
      id: nurseId,
      email: NURSE_EMAIL,
      role: "nurse",
      first_name: "Reveal",
      last_name: "Nurse",
      phone: NURSE_PHONE,
    });

    // Verified, so the visible-nurse filter lets a family see and reveal her.
    const { error: profErr } = await service.from("nurse_profiles").upsert(
      {
        user_id: nurseId,
        slug: NURSE_SLUG,
        credential: "rn",
        license_number: "E2E-REVEAL-001",
        verification_status: "verified",
      },
      { onConflict: "user_id" },
    );
    if (profErr) throw new Error(`Could not create nurse: ${profErr.message}`);

    // The nurse the review journey reviews. Her own, so the two specs never
    // reach for the same rows.
    const reviewNurseId = await ensureUser(
      service,
      REVIEW_NURSE_EMAIL,
      PASSWORD,
    );

    await upsertUserRow(service, {
      id: reviewNurseId,
      email: REVIEW_NURSE_EMAIL,
      role: "nurse",
      first_name: REVIEW_NURSE_FIRST,
      last_name: "Nurse",
      phone: "555-0143",
    });

    const { error: reviewProfErr } = await service
      .from("nurse_profiles")
      .upsert(
        {
          user_id: reviewNurseId,
          slug: REVIEW_NURSE_SLUG,
          credential: "rn",
          license_number: "E2E-REVIEW-001",
          verification_status: "verified",
        },
        { onConflict: "user_id" },
      );
    if (reviewProfErr) {
      throw new Error(
        `Could not create review nurse: ${reviewProfErr.message}`,
      );
    }

    // An ACTIVE family_access subscription. Without it the CTA is a paywall and
    // revealNurse refuses with no_subscription.
    //
    // Every NOT NULL on the table is filled, including the Stripe ids: they are
    // NOT NULL and stripe_subscription_id is UNIQUE, so this deletes the row
    // first rather than upserting (there is no unique key on user+plan to
    // conflict on, so an upsert would just stack another subscription on each
    // run).
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    // A fixture write that silently fails makes the test that follows it pass
    // while testing nothing, which is the same defect as #847 wearing a green
    // tick, so these are checked too.
    await assertNoWriteError(
      service.from("subscriptions").delete().eq("user_id", familyId),
      "the clearing of this family's fixture subscriptions",
    );
    const { error: subErr } = await service.from("subscriptions").insert({
      user_id: familyId,
      plan_type: "family_access",
      status: "active",
      stripe_customer_id: "cus_e2e_family",
      stripe_subscription_id: "sub_e2e_family",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    });
    if (subErr)
      throw new Error(`Could not subscribe family: ${subErr.message}`);

    // Reveal state (the reveals row, today's spent slots) is deliberately NOT
    // reset here. This setup runs once per RUN, and the spec spends a reveal on
    // every attempt, so a reset here leaves a retry starting from a slot that
    // attempt 1 already spent. The spec resets it per attempt instead; this
    // file's job is to provision the world, not to own the counters the spec
    // asserts on.

    await signInThroughUI(page, EMAIL, PASSWORD);

    await page.context().storageState({ path: FAMILY_STATE });

    mkdirSync("e2e/.auth", { recursive: true });
    writeFileSync(
      FIXTURE,
      JSON.stringify({
        familyId,
        nurseId,
        nurseSlug: NURSE_SLUG,
        reviewNurseId,
        reviewNurseSlug: REVIEW_NURSE_SLUG,
        reviewNurseFirstName: REVIEW_NURSE_FIRST,
      }),
    );

    expect(familyId).toBeTruthy();
  },
);
