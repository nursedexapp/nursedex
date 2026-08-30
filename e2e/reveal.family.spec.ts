import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { serviceClient } from "./helpers/provision";

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

  await db
    .from("reveals")
    .delete()
    .eq("family_user_id", familyId)
    .eq("nurse_user_id", nurseId);
  await db.from("rate_limit_reveals").delete().eq("family_user_id", familyId);
});

/** How many of today's capped daily reveals this family has spent. */
async function slotsSpent(familyId: string): Promise<number> {
  const { data } = await service()
    .from("rate_limit_reveals")
    .select("reveal_count")
    .eq("family_user_id", familyId)
    .eq("date", new Date().toISOString().slice(0, 10))
    .maybeSingle();
  return (data as { reveal_count: number } | null)?.reveal_count ?? 0;
}

test("a subscribed family reveals a nurse, and spends exactly one slot", async ({
  page,
}) => {
  const { familyId, nurseSlug } = fixture();

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
  // First: did the reveal ACTUALLY happen? That is a row, not a rendering. A
  // spent slot is the durable record of it, it is what this test is named
  // after, and polling it waits on the condition rather than on a fixed budget
  // (L290).
  await expect
    .poll(() => slotsSpent(familyId), {
      timeout: 15_000,
      message:
        "the reveal never reached the database: no slot was spent. The click " +
        "was swallowed, or the reveal itself failed. This is not a rendering " +
        "problem",
    })
    .toBe(1);

  // Only then: did the contact details reach the screen? This is the thing that
  // would break if the app called a database function production did not have.
  // Reaching this line means the reveal is recorded, so a failure here is a
  // rendering fault and nothing else.
  await expect(
    page.getByText("e2e-reveal-nurse@nursedex.test"),
    "the reveal is recorded in the database but the contact details never appeared on screen",
  ).toBeVisible({ timeout: 15_000 });

  // Coming back later must not charge them again. The reveal is already theirs,
  // and re-viewing it is not a second reveal.
  await page.goto(`/nurses/${nurseSlug}`);
  await expect(page.getByText("e2e-reveal-nurse@nursedex.test")).toBeVisible();
  await expect(reveal).toBeHidden();

  expect(await slotsSpent(familyId)).toBe(1);
});
