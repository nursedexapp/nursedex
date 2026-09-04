import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { serviceClient } from "./helpers/provision";

import { unwrapOrThrow, assertNoWriteError } from "@/lib/db/results";
// A review from written to published (#485).
//
// The last of the three journeys. A family who has revealed a nurse writes a
// review; it does NOT appear on the nurse's public profile; an admin approves it
// out of the moderation queue; and only then can anyone read it.
//
// The moderation gate is the point, not the happy ending. Reviews are the thing
// families trust when they pick who to let into their home, so an unmoderated
// one reaching the public profile is the failure that matters. A test that only
// asserted "the review shows up in the end" would pass just as happily with the
// gate wide open, so this asserts the review is INVISIBLE first.

const ADMIN_STATE = "e2e/.auth/admin.json";

const REVIEWER_NAME = "Dana";
const REVIEW_TEXT =
  "She stayed late twice when my mother's oxygen alarm kept going off, and explained every reading to me until I understood it.";

const fixture = () =>
  JSON.parse(readFileSync("e2e/.auth/family-fixture.json", "utf8")) as {
    familyId: string;
    reviewNurseId: string;
    reviewNurseSlug: string;
    reviewNurseFirstName: string;
  };

async function reviewOf(
  familyId: string,
  nurseId: string,
): Promise<{ id: string; status: string } | null> {
  // A fixture read or write that silently fails makes the assertion after
  // it pass while testing nothing, which is #847 wearing a green tick.
  const data = await unwrapOrThrow(
    serviceClient()
      .from("reviews")
      .select("id, status")
      .eq("reviewer_user_id", familyId)
      .eq("nurse_user_id", nurseId)
      .maybeSingle(),
    "the review this assertion is about",
  );
  return data as { id: string; status: string } | null;
}

// Every attempt starts from a family who has revealed this nurse and never
// reviewed her. The test writes a review, so a retry that inherited the last
// attempt's would be refused with "already_reviewed" and prove nothing.
test.beforeEach(async () => {
  const { familyId, reviewNurseId } = fixture();
  const db = serviceClient();

  await assertNoWriteError(
    db
      .from("reviews")
      .delete()
      .eq("reviewer_user_id", familyId)
      .eq("nurse_user_id", reviewNurseId),
    "the clearing of this family's fixture review",
  );

  // A family may only review a nurse they have revealed. The reveal itself is
  // covered end to end by reveal.family.spec.ts, so it is a precondition here
  // rather than a second copy of that journey: written straight to the database,
  // which also leaves the daily reveal counter alone.
  const { error } = await db
    .from("reveals")
    .upsert(
      { family_user_id: familyId, nurse_user_id: reviewNurseId },
      { onConflict: "family_user_id,nurse_user_id" },
    );
  if (error) throw new Error(`Could not seed the reveal: ${error.message}`);
});

test.setTimeout(120_000);

test("a family reviews a nurse, and nobody reads it until an admin approves", async ({
  page,
  browser,
}) => {
  const { familyId, reviewNurseId, reviewNurseSlug, reviewNurseFirstName } =
    fixture();

  expect(await reviewOf(familyId, reviewNurseId)).toBeNull();

  // ── The family writes the review, through the dialog on the nurse's profile.
  await page.goto(`/nurses/${reviewNurseSlug}`);

  await page.getByRole("button", { name: "Leave a review" }).click();
  await expect(
    page.getByRole("heading", { name: `Review ${reviewNurseFirstName}` }),
  ).toBeVisible();

  await page
    .getByRole("radiogroup", { name: "Star rating" })
    .getByRole("radio", { name: "5 stars" })
    .click();
  await page.locator("#reviewer_name").fill(REVIEWER_NAME);
  await page.locator("#review_text").fill(REVIEW_TEXT);
  await page.getByRole("button", { name: "Submit review" }).click();

  // It lands, and it lands PENDING. Nothing a family writes is public on impact.
  await expect
    .poll(async () => (await reviewOf(familyId, reviewNurseId))?.status, {
      timeout: 20_000,
    })
    .toBe("pending");

  // ── THE GATE. The nurse's public review list must not carry it yet.
  //
  //    Checked on the profile as a signed-in family, which is who actually reads
  //    reviews: a logged-out visitor is shown a signup CTA instead of the profile
  //    body, so "the review is invisible to anon" is true no matter how broken
  //    moderation is, and would be no gate at all.
  //
  //    Scoped to the Reviews section on purpose. The family's own pending review
  //    is echoed back to them elsewhere on the page ("you can edit while
  //    pending"), and that is not the same thing as being published.
  const reviews = page.locator('section[aria-label="Reviews"]');

  await page.goto(`/nurses/${reviewNurseSlug}`);
  await expect(reviews).toBeVisible();
  await expect(reviews.getByText(REVIEW_TEXT)).toBeHidden();

  // ── An admin approves it out of the moderation queue.
  const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await adminCtx.newPage();

  await adminPage.goto("/admin/reviews");

  // The smallest thing holding BOTH this review and an Approve button: its own
  // card, not the page that contains every other pending review too.
  const card = adminPage
    .locator("div")
    .filter({ hasText: REVIEW_TEXT })
    .filter({
      has: adminPage.getByRole("button", { name: "Approve", exact: true }),
    })
    .last();
  await expect(card).toBeVisible({ timeout: 15_000 });

  await card.getByRole("button", { name: "Approve", exact: true }).click();

  await expect
    .poll(async () => (await reviewOf(familyId, reviewNurseId))?.status, {
      timeout: 20_000,
    })
    .toBe("approved");

  // ── Now, and only now, it is published on her profile for families to read.
  await page.goto(`/nurses/${reviewNurseSlug}`);
  await expect(reviews.getByText(REVIEW_TEXT)).toBeVisible({
    timeout: 15_000,
  });

  await adminCtx.close();
});
