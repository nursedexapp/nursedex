import { test as setup, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";

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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    if (!url || !serviceKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY for e2e family setup.",
      );
    }

    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    /** Create a confirmed user, or find the one a previous run left behind. */
    async function ensureUser(
      email: string,
      password: string,
    ): Promise<string> {
      const { data: created } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created?.user?.id) return created.user.id;

      const { data: list } = await service.auth.admin.listUsers();
      const found = list?.users.find((u) => u.email === email)?.id;
      if (!found) throw new Error(`Could not create or find ${email}`);
      // A previous run may have left a different password on it.
      await service.auth.admin.updateUserById(found, { password });
      return found;
    }

    const familyId = await ensureUser(EMAIL, PASSWORD);
    const nurseId = await ensureUser(NURSE_EMAIL, PASSWORD);

    const { error: famErr } = await service
      .from("users")
      .upsert({
        id: familyId,
        email: EMAIL,
        role: "family",
        first_name: "Fam",
      });
    if (famErr) throw new Error(`Could not set family role: ${famErr.message}`);

    const { error: nurseErr } = await service.from("users").upsert({
      id: nurseId,
      email: NURSE_EMAIL,
      role: "nurse",
      first_name: "Reveal",
      last_name: "Nurse",
      phone: NURSE_PHONE,
    });
    if (nurseErr) throw new Error(`Could not set nurse: ${nurseErr.message}`);

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
    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    const { error: subErr } = await service.from("subscriptions").upsert({
      user_id: familyId,
      plan_type: "family_access",
      status: "active",
      current_period_end: periodEnd.toISOString(),
    });
    if (subErr)
      throw new Error(`Could not subscribe family: ${subErr.message}`);

    // Start from a clean slate: no reveal of this nurse, and no reveals spent
    // today, so the spec can assert on exact counts.
    await service
      .from("reveals")
      .delete()
      .eq("family_user_id", familyId)
      .eq("nurse_user_id", nurseId);
    await service
      .from("rate_limit_reveals")
      .delete()
      .eq("family_user_id", familyId);

    // Sign in through the UI so @supabase/ssr writes the auth cookies.
    await page.goto("/login");
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
      timeout: 15_000,
    });

    await page.context().storageState({ path: FAMILY_STATE });

    mkdirSync("e2e/.auth", { recursive: true });
    writeFileSync(
      FIXTURE,
      JSON.stringify({ familyId, nurseId, nurseSlug: NURSE_SLUG }),
    );

    expect(familyId).toBeTruthy();
  },
);
