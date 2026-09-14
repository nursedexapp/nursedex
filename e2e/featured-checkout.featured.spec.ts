import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { serviceClient } from "./helpers/provision";

import { assertNoWriteError } from "@/lib/db/results";

// A nurse's route to the paid product, walked the way she walks it (#970).
//
// Featured at $29/mo is the product for the audience this site actually
// acquires, and it had four checkout starts in the product's life. The server
// side is well covered already: `subscriptions/actions.test.ts` exercises
// `createNurseFeaturedCheckout` including a blank price ID and Stripe throwing,
// and the webhook suite carries 50 tests over the tier sync. What nothing
// touched was the journey through the interface, so the prompt could stop
// linking anywhere and every one of those tests would still pass.
//
// WHERE THIS STOPS, AND WHY. Creating a real Stripe Checkout session needs a
// Stripe secret and a configured price ID, and the e2e job has neither: no
// STRIPE_* value is set anywhere in .github/workflows/e2e.yml. So in CI the
// action can only ever refuse. Rather than pretend otherwise, the journey and
// the refusal are two tests, each skipped with a stated reason in the
// environment where it cannot be measured, so the report says which one ran
// rather than a silent pass standing in for both (L98, L411).
//
// What that leaves uncovered is named plainly: nothing here proves a session is
// created with the nurse_featured price, because nothing in CI can. What it
// does prove is that the prompt still reaches a live checkout control, and that
// a checkout that cannot be created tells the nurse so and gives the button
// back rather than stranding her in a pending state.

const fixture = () =>
  JSON.parse(readFileSync("e2e/.auth/featured-fixture.json", "utf8")) as {
    nurseId: string;
    email: string;
    slug: string;
  };

const stripeConfigured = Boolean(
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_NURSE_FEATURED_PRICE_ID,
);

// The offer is shown only to a verified nurse on the free tier, and
// createCheckoutSession refuses outright once a subscription is active. A run
// that left one behind would send every later attempt down the "you already
// have an active subscription" path, which puts an error on screen and reads
// exactly like the refusal test passing (L159).
test.beforeEach(async () => {
  const service = serviceClient();
  await assertNoWriteError(
    service.from("subscriptions").delete().eq("user_id", fixture().nurseId),
    "the clearing of this nurse's subscriptions before the attempt",
  );
  await assertNoWriteError(
    service
      .from("nurse_profiles")
      .update({ tier: "free" })
      .eq("user_id", fixture().nurseId),
    "the reset of this nurse's tier before the attempt",
  );
});

test("a verified free tier nurse can walk from her dashboard to the Featured checkout", async ({
  page,
}) => {
  await page.goto("/dashboard");

  // The offer itself. It is the only route from the dashboard to the paid
  // product, so if it stops rendering there is nothing else to follow.
  const offer = page.getByRole("link", { name: /see featured pricing/i });
  await expect(offer).toBeVisible();

  await offer.click();
  await expect(page).toHaveURL(/\/pricing/);

  // She is a signed in nurse, so the page owes her the nurse view with no
  // toggling: /pricing reads her role and chooses. A family view here would
  // mean she followed an offer for her own product and arrived at somebody
  // else's price.
  await expect(page.getByRole("heading", { name: "Featured" })).toBeVisible();
  await expect(page.getByText("$29")).toBeVisible();

  // The control at the end of the walk, live rather than merely present: a
  // disabled button would satisfy "the page rendered" while leaving her unable
  // to buy anything.
  const checkout = page.getByRole("button", { name: /upgrade to featured/i });
  await expect(checkout).toBeVisible();
  await expect(checkout).toBeEnabled();
});

test("a checkout that cannot be created says so and gives the button back", async ({
  page,
}) => {
  test.skip(
    stripeConfigured,
    "Stripe is configured here, so the action would create a real session rather than refuse. This case is measured where it actually happens: an environment with no Stripe credentials, which is what CI is.",
  );

  await page.goto("/pricing");

  const checkout = page.getByRole("button", { name: /upgrade to featured/i });
  await expect(checkout).toBeEnabled();
  await checkout.click();

  // A real message, not a spinner that never resolves.
  //
  // Scoped to the toast itself rather than to the page's text, because
  // /pricing is a page ABOUT checkout: a bare text match for "checkout" or
  // "stripe" would be answered by the page's own copy and would pass with no
  // toast on screen at all, which is the failure it is written to catch
  // (L156, L178). The exact sentence stays unpinned, since it changes with the
  // reason and is the action's to choose (L103).
  const toast = page.locator("[data-sonner-toast]");
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText(/\S/);

  // The half that has never been exercised in a browser: the button comes back.
  // In `wait` mode a stalled checkout stays disabled deliberately, so a refusal
  // that left `isPending` set would look identical to a slow one, and she would
  // be facing a dead control with no way to try again (#669, L148).
  await expect(checkout).toBeEnabled();
  await expect(checkout).toHaveText(/upgrade to featured/i);

  // And she is still on the pricing page. A refusal that navigated anywhere,
  // to a half built Stripe session or back to the dashboard, would lose the
  // message it just showed her.
  await expect(page).toHaveURL(/\/pricing/);
});

test("a configured checkout reaches Stripe", async ({ page }) => {
  test.skip(
    !stripeConfigured,
    "No STRIPE_SECRET_KEY or STRIPE_NURSE_FEATURED_PRICE_ID in this environment, so no session can be created. This is the state of the e2e job today, and it is why the refusal above is what CI measures.",
  );

  await page.goto("/pricing");

  const checkout = page.getByRole("button", { name: /upgrade to featured/i });
  await checkout.click();

  // The boundary #970 chose: driving Stripe's own hosted page tests Stripe.
  // Reaching it proves the session was created and the nurse was sent to it.
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
});
