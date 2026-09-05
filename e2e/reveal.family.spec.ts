import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { serviceClient } from "./helpers/provision";

import { assertNoWriteError, unwrapOrThrow } from "@/lib/db/results";
// The reveal, end to end, in a real browser (#691, #669).
//
// This is the money path: it spends one of the family's capped daily reveals and
// hands over a nurse's real contact details. Migration 059 rewrote HOW the slot
// is spent, and #669 rewrote the button that fires it. Both halves were covered
// (a real-Postgres test proves the database function behaves; component tests
// prove the button behaves), and NOTHING put the two together. This does.
//
// The count assertions are the point. "The contact appeared" would pass even if
// the family were quietly charged twice, which is exactly the bug #691 fixed.

const fixture = () =>
  JSON.parse(readFileSync("e2e/.auth/family-fixture.json", "utf8")) as {
    familyId: string;
    nurseId: string;
    nurseSlug: string;
  };

const service = serviceClient;

// Every attempt starts from an unspent slot, including a RETRY.
//
// This reset used to live in family.setup.ts, which runs once per run rather
// than once per attempt. The test spends a reveal, so the moment it failed for
// any reason, retries 1 and 2 opened with a slot already gone and died on
// `expect(slotsSpent).toBe(0)` before reaching the assertion under test. The
// retries reported the wreckage of attempt 1 instead of re-running it, and the
// real failure only appeared in the first attempt's log.
//
// A test that spends something has to put it back itself.
test.beforeEach(async () => {
  const { familyId, nurseId } = fixture();
  const db = service();

  // A fixture write that silently fails makes the test that follows it pass
  // while testing nothing, which is the same defect as #847 wearing a green
  // tick, so these are checked too.
  await assertNoWriteError(
    db
      .from("reveals")
      .delete()
      .eq("family_user_id", familyId)
      .eq("nurse_user_id", nurseId),
    "the clearing of this family's fixture reveals",
  );
  await assertNoWriteError(
    db.from("rate_limit_reveals").delete().eq("family_user_id", familyId),
    "the clearing of this family's fixture reveal quota",
  );
});

/**
 * The reveal row itself, which is what unlocks the contact.
 *
 * The spent slot and the reveal are DIFFERENT tables, and #831 turned on that
 * difference: the failure message claimed "the reveal is recorded in the
 * database" while only ever checking the daily quota counter. reveal_nurse
 * (migration 059) spends a slot, inserts the reveal, and refunds the slot if
 * the insert did nothing, so a spent slot is strong evidence but not the thing
 * itself, and hasRevealedNurse reads THIS row.
 */
async function revealRow(
  familyId: string,
  nurseId: string,
): Promise<{ access_expires_at: string | null } | null> {
  const data = await unwrapOrThrow(
    service()
      .from("reveals")
      .select("access_expires_at")
      .eq("family_user_id", familyId)
      .eq("nurse_user_id", nurseId)
      .maybeSingle(),
    "the reveal row this assertion is about",
  );
  return data as { access_expires_at: string | null } | null;
}

/** How many of today's capped daily reveals this family has spent. */
async function slotsSpent(familyId: string): Promise<number> {
  const data = await unwrapOrThrow(
    service()
      .from("rate_limit_reveals")
      .select("reveal_count")
      .eq("family_user_id", familyId)
      .eq("date", new Date().toISOString().slice(0, 10))
      .maybeSingle(),
    "the daily reveal quota row this assertion is about",
  );
  return (data as { reveal_count: number } | null)?.reveal_count ?? 0;
}

test("a subscribed family reveals a nurse, and spends exactly one slot", async ({
  page,
}) => {
  const { familyId, nurseId, nurseSlug } = fixture();

  expect(await slotsSpent(familyId)).toBe(0);

  await page.goto(`/nurses/${nurseSlug}`);

  const reveal = page.getByRole("button", { name: /reveal contact info/i });
  await expect(reveal).toBeVisible();

  await reveal.click();

  // Two separate questions, asked in order, because the flake in #831 could not
  // tell them apart.
  //
  // This used to be one assertion: wait fifteen seconds for the email to appear
  // on screen. When that timed out (twice in two runs) the only thing it said
  // was "element(s) not found", which is true whether the reveal never
  // happened at all or happened and the page had not rendered it yet. Those are
  // completely different bugs, and one assertion that covers both diagnoses
  // neither (L11, L239).
  //
  // First: did the reveal ACTUALLY happen? That is a row, not a rendering, and
  // it is the REVEAL row rather than the spent slot. The two are different
  // tables and #831 turned on the difference: the earlier version of this
  // checked the daily quota counter while its message claimed the reveal was
  // recorded. Polling waits on the condition rather than a fixed budget (L290).
  await expect
    .poll(async () => (await revealRow(familyId, nurseId)) !== null, {
      timeout: 15_000,
      message:
        "the reveal never reached the database: no row in `reveals`. " +
        "The click was swallowed, or reveal_nurse refused. " +
        "This is not a rendering problem",
    })
    .toBe(true);

  // Only then: did the contact details reach the screen?
  //
  // The failure message carries the state the page's own check reads, because
  // #831 could not be diagnosed without it: hasRevealedNurse returns false both
  // when the row is missing and when access_expires_at has passed, and a bare
  // "element not found" tells a reader neither.
  const recorded = await revealRow(familyId, nurseId);
  await expect(
    page.getByText("e2e-reveal-nurse@nursedex.test"),
    `the reveal row exists (access_expires_at=${JSON.stringify(
      recorded?.access_expires_at,
    )}) and ${await slotsSpent(familyId)} slot(s) are spent, but the contact ` +
      `details never appeared on screen`,
  ).toBeVisible({ timeout: 15_000 });

  // Coming back later must not charge them again. The reveal is already theirs,
  // and re-viewing it is not a second reveal.
  await page.goto(`/nurses/${nurseSlug}`);
  await expect(page.getByText("e2e-reveal-nurse@nursedex.test")).toBeVisible();
  await expect(reveal).toBeHidden();

  expect(await slotsSpent(familyId)).toBe(1);
});
