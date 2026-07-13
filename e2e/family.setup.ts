import { test as setup, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  serviceClient,
  ensureUser,
  upsertUserRow,
  signInThroughUI,
} from "./helpers/provision";

// Provisions the world a reveal needs, and signs in as the family.
//
// A reveal is the money path: it spends one of the family's capped daily
// reveals and hands over a nurse's real contact details. Migration 059 rewrote
// how it is spent (#691) and the button that fires it changed too (#669), and
// none of that had ever been exercised through the actual app: the database
// tests prove the function behaves, and the component tests prove the button
// behaves, but nothing put the two together.
//
// So this builds a subscribed family and a visible verified nurse, and the spec
// reveals one with a real browser.
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

    await service.from("subscriptions").delete().eq("user_id", familyId);
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
      JSON.stringify({ familyId, nurseId, nurseSlug: NURSE_SLUG }),
    );

    expect(familyId).toBeTruthy();
  },
);
