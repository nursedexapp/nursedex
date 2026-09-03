import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { serviceClient, resetNurseToPreOnboarding } from "./helpers/provision";

// A nurse from signup to a live public profile (#485).
//
// This is the supply side of the marketplace: no nurses, no product. The unit
// tests cover the wizard's validation and the admin queue's actions, and until
// now nothing joined them, which is precisely the gap that let the reveal ship
// broken (#700): both halves passed, the seam was never walked.
//
// The gate is the point, not the happy ending. A nurse who has finished
// onboarding is NOT verified, and must not be visible to families until an admin
// says so. A test that only checked "the profile appears at the end" would pass
// just as happily if that gate were wide open, so the spec asserts the profile
// is invisible FIRST, and only then that an approval makes it real.

const ADMIN_STATE = "e2e/.auth/admin.json";
const PHOTO = "e2e/fixtures/nurse-photo.png";

const FIRST_NAME = "Olive";
const LAST_NAME = "Onboarding";

const fixture = () =>
  JSON.parse(readFileSync("e2e/.auth/nurse-fixture.json", "utf8")) as {
    nurseId: string;
    email: string;
  };

interface ProfileRow {
  slug: string;
  verification_status: string;
}

async function profileOf(nurseId: string): Promise<ProfileRow | null> {
  const { data } = await serviceClient()
    .from("nurse_profiles")
    .select("slug, verification_status")
    .eq("user_id", nurseId)
    .maybeSingle();
  return data as ProfileRow | null;
}

// Every attempt starts from a nurse who has just signed up. The test finishes
// onboarding, so without this a retry would open on a nurse who already has a
// completed profile and test nothing (#700 learned this the hard way).
test.beforeEach(async () => {
  await resetNurseToPreOnboarding(serviceClient(), fixture().nurseId);
});

/** Pick an option out of one of the custom radiogroups (they are not <input>s). */
async function chooseRadio(page: Page, group: string, option: string) {
  await page
    .getByRole("radiogroup", { name: group })
    .getByRole("radio", { name: option, exact: false })
    .first()
    .click();
}

/**
 * Advance the wizard and wait for the next step to actually be on screen.
 *
 * Every step's button is the same "Continue", so firing them back to back races
 * React: the second click lands on the step that has not re-rendered yet, and the
 * wizard quietly stays where it was. Waiting on the heading is what makes each
 * click land on the step it was written for.
 */
async function continueTo(page: Page, heading: string) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({
    timeout: 20_000,
  });
}

// A whole funnel, not a click: role selection, five wizard steps each saving to
// the server, a real photo cropped and uploaded to storage, an admin approval,
// and two public page loads. The 30s default is a budget for one interaction.
test.setTimeout(180_000);

test("a nurse onboards, and stays invisible to families until an admin approves", async ({
  page,
  browser,
}) => {
  const { nurseId } = fixture();

  expect(await profileOf(nurseId)).toBeNull();

  // ── Role selection. This is what creates the profile row, so onboarding
  //    cannot even begin without it.
  await page.goto("/role-select");
  await chooseRadio(page, "Account type", "I am a nurse");
  await page.getByRole("button", { name: "Continue" }).click();
  // Wait for the profile ROW, not for the URL. Role selection is what creates
  // the row, the next line navigates explicitly anyway, and the URL is a
  // transient surface: waiting on it could not tell "the redirect never
  // happened" from "it happened and we already moved on" (L239). It was also
  // the flake in #805, timing out at 20s while Turbopack compiled a route that
  // global-setup now warms.
  await expect
    .poll(async () => (await profileOf(nurseId)) !== null, {
      timeout: 30_000,
      message: "role selection did not create the nurse profile row",
    })
    .toBe(true);

  // ── Step 1: basics
  await page.goto("/dashboard/onboarding");
  await page.locator("#first_name").fill(FIRST_NAME);
  await page.locator("#last_name").fill(LAST_NAME);
  await chooseRadio(page, "Gender", "Female");
  await page.locator("#years_experience").fill("8");
  await continueTo(page, "Your credentials");

  // ── Step 2: credentials
  await chooseRadio(page, "Credential type", "Registered Nurse");
  await page.locator("#license_number").fill("E2E-ONBOARD-001");
  await page
    .getByRole("checkbox", { name: "Elderly Care", exact: true })
    .check();
  await continueTo(page, "Skills and details");

  // ── Step 3: skills and details (everything here is optional, so this is the
  //    step where a nurse in a hurry clicks straight through)
  await continueTo(page, "Bio and photos");

  // ── Step 4: bio and a real photo, cropped and uploaded to storage
  await page
    .locator("#bio")
    .fill(
      "I am a paediatric nurse in Queens with eight years on a hospital ward, and I now work with families at home overnight.",
    );
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.getByText("Frame your photo")).toBeVisible();

  await expect(page.locator("img.reactEasyCrop_Image")).toBeVisible({
    timeout: 20_000,
  });

  // Frame the photo, the way the dialog asks you to. This is not ceremony: the
  // cropper only emits crop data once it has measured the image, and "Use photo"
  // is wired to `area && onConfirm(area)`, so a click before then does nothing at
  // all. Touching the zoom slider is what a real nurse does here, and it makes
  // the crop data exist.
  await page.getByLabel("Zoom").fill("1.4");

  await page.getByRole("button", { name: "Use photo" }).click();

  // The photo really is uploaded, into a bucket that only existed in production
  // until migration 061. A nurse cannot finish onboarding without one, so this
  // journey was untestable until the bucket became code.
  await expect(page.getByText("Frame your photo")).toBeHidden({
    timeout: 30_000,
  });
  await continueTo(page, "Contact information");

  // ── Step 5: contact
  await page.locator("#contact_email").fill("olive@nursedex.test");
  await page.locator("#contact_phone").fill("5550177123");
  // Not reachable through a radiogroup: these options carry role="radio" with no
  // group wrapping them, which is the accessibility gap #454 already tracks. The
  // test selects the radio directly rather than pretending the group is there.
  await page.getByRole("radio", { name: "Email", exact: true }).click();
  await page.locator("#zip_code").fill("11101");
  await page.locator("#travel_radius_miles").fill("15");
  await page
    .getByRole("button", { name: "Complete Profile", exact: true })
    .click();

  await page.waitForURL(/onboarding=complete/, { timeout: 30_000 });

  // The profile is real, it has a slug, and it is NOT verified.
  const profile = await profileOf(nurseId);
  expect(profile).not.toBeNull();
  expect(profile!.verification_status).toBe("pending");
  const slug = profile!.slug;
  expect(slug).toBeTruthy();

  // ── THE GATE. A finished profile is not a public one. Until an admin says so,
  //    a family looking her up finds nothing there.
  //
  //    Asserted on what the visitor SEES, not on the status code: the route
  //    streams behind nurses/loading.tsx, so notFound() cannot change a response
  //    that has already begun, and the page is served as a noindexed soft 404 by
  //    design (#323). The status is 200 either way, which is exactly why a status
  //    assertion would be no gate at all.
  //
  //    (Running this turned up something else: that soft 404 currently renders an
  //    EMPTY page, header and footer with nothing between them, rather than the
  //    "This page took the day off" copy. Filed separately; the nurse being
  //    invisible is what this test is here to hold on to.)
  // Explicitly EMPTY, not merely "new". A context created from the browser
  // inherits this project's storageState, so `browser.newContext()` on its own
  // hands you the nurse's own session, and the app quite rightly lets a nurse see
  // her own pending profile. The gate would have been tested by the one person
  // allowed through it.
  const anon = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const anonPage = await anon.newPage();

  await anonPage.goto(`/nurses/${slug}`);
  await expect(
    anonPage.getByRole("heading", { level: 1, name: FIRST_NAME }),
  ).toBeHidden();
  await expect(anonPage.getByText(LAST_NAME)).toBeHidden();

  // ── An admin approves them out of the verification queue.
  const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await adminCtx.newPage();

  await adminPage.goto("/admin/verifications");

  // She is IN the queue, which is the other half of the gate: a nurse who
  // finished onboarding must actually reach an admin, not sit in limbo.
  // The smallest thing on the page holding BOTH her name and an Approve button:
  // her card, and not the page that contains every other nurse's card too.
  const card = adminPage
    .locator("div")
    .filter({ hasText: `${FIRST_NAME} ${LAST_NAME}` })
    .filter({
      has: adminPage.getByRole("button", { name: "Approve", exact: true }),
    })
    .last();
  await expect(card).toBeVisible({ timeout: 15_000 });

  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await adminPage.getByRole("button", { name: "Approve verification" }).click();

  await expect
    .poll(async () => (await profileOf(nurseId))!.verification_status, {
      timeout: 20_000,
    })
    .toBe("verified");

  // ── Now, and only now, families can see her.
  await anonPage.goto(`/nurses/${slug}`);
  // Her name is the h1. Only the first name: the last name stays gated to
  // subscribers and admins even now that she is public (#381).
  await expect(
    anonPage.getByRole("heading", { level: 1, name: FIRST_NAME }),
  ).toBeVisible();

  await anon.close();
  await adminCtx.close();
});

// A verified nurse whose profile is empty is not in the directory (#732). She
// is also sent straight back into the wizard, at whichever step she stopped
// at, so the message telling her families cannot see her has to be on the step
// she actually lands on. This one lands on the FIRST step, which is the case
// that would be missed by a notice living on the bio and photo step: 22 of the
// 40 nurses in this state stopped before step 3.
test("a verified nurse with an empty profile is told families cannot see her", async ({
  page,
}) => {
  const service = serviceClient();
  const { nurseId } = fixture();

  const { error: userErr } = await service
    .from("users")
    .update({ role: "nurse", first_name: FIRST_NAME, last_name: LAST_NAME })
    .eq("id", nurseId);
  if (userErr) throw new Error(`Could not set the nurse role: ${userErr.message}`);

  // Verified, and empty: no photo and no bio, and no years_experience, so the
  // wizard sends her to step 1 rather than to the bio and photo step.
  const { error: profileErr } = await service.from("nurse_profiles").insert({
    user_id: nurseId,
    slug: `e2e-verified-empty-${Date.now()}`,
    credential: "rn",
    verification_status: "verified",
  });
  if (profileErr) {
    throw new Error(`Could not provision the empty profile: ${profileErr.message}`);
  }

  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/dashboard\/onboarding/);
  await expect(page.getByText(/families cannot see you yet/i)).toBeVisible();
  await expect(page.getByText(/no photo and no bio/i)).toBeVisible();
});
