import { test, expect } from "@playwright/test";

// Runs against the authenticated project's storageState, which is an admin, so
// a caller who ALREADY has a role. A role cannot change once set, so the screen
// can only fail for them, and the layout sends them on through /dashboard,
// which routes an admin to /admin (#1087). The screen itself, for somebody with
// no role yet, is driven end to end by onboarding.nurse.spec.ts. Runs under
// E2E_AUTH=1.

test("role-select sends somebody who already has a role onward", async ({
  page,
}) => {
  await page.goto("/role-select");

  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: "How will you use NurseDex?" }),
  ).toHaveCount(0);
});
