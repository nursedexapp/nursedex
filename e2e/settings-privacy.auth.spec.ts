import { test, expect } from "@playwright/test";

/**
 * #715. The analytics opt-out, end to end.
 *
 * The component tests prove the toggle calls what it should. This proves the
 * parts they mock away actually exist: that migration 068 has been applied, so
 * `users.analytics_opt_out` is a real column the settings page can read and the
 * server action can write, and that the whole page still renders with them.
 *
 * A missing migration is precisely the failure the component tests cannot see,
 * because they never touch a database.
 *
 * Runs in the authenticated project (E2E_AUTH=1). See e2e/README.md.
 */
test.describe("the analytics opt-out in settings", () => {
  test("renders the control, reading the stored preference", async ({
    page,
  }) => {
    const res = await page.goto("/dashboard/settings");
    expect(res, "no response for /dashboard/settings").not.toBeNull();
    expect(res!.status()).toBeLessThan(400);

    // The error boundary returns a 200, so a status check alone would miss a
    // render crash from a column that does not exist yet.
    await expect(page.getByText("We hit a snag", { exact: false })).toHaveCount(
      0,
    );

    const analytics = page.getByRole("checkbox", { name: /usage analytics/i });
    await expect(analytics).toBeVisible();
    // Nobody has opted this account out, and the default is false, so the box
    // reads as ticked. Asserting the STATE, not just presence, is what proves
    // the value came out of the database rather than the control being inert.
    await expect(analytics).toBeChecked();
  });

  test("saves an opt-out and reads it back after a reload", async ({
    page,
  }) => {
    await page.goto("/dashboard/settings");
    const analytics = page.getByRole("checkbox", { name: /usage analytics/i });
    await expect(analytics).toBeChecked();

    await analytics.click();
    await expect(page.getByText(/analytics turned off/i)).toBeVisible();

    // The reload is the point. Anything can flip a checkbox in local state;
    // this asserts the choice survived a round trip to the database, which is
    // the whole reason it is stored against the person rather than the browser.
    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: /usage analytics/i }),
    ).not.toBeChecked();

    // Put it back, so this spec leaves the shared account as it found it and
    // can run twice in a row.
    await page.getByRole("checkbox", { name: /usage analytics/i }).click();
    await expect(page.getByText(/analytics turned back on/i)).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: /usage analytics/i }),
    ).toBeChecked();
  });
});
