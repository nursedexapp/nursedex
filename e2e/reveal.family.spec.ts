import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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

  // The contact details actually arrive. This is the thing that would break if
  // the app called a database function production did not have.
  await expect(page.getByText("e2e-reveal-nurse@nursedex.test")).toBeVisible({
    timeout: 15_000,
  });

  expect(await slotsSpent(familyId)).toBe(1);

  // Coming back later must not charge them again. The reveal is already theirs,
  // and re-viewing it is not a second reveal.
  await page.goto(`/nurses/${nurseSlug}`);
  await expect(page.getByText("e2e-reveal-nurse@nursedex.test")).toBeVisible();
  await expect(reveal).toBeHidden();

  expect(await slotsSpent(familyId)).toBe(1);
});
