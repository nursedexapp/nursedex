import { test, expect } from "@playwright/test";

// role-select requires an authenticated session (see e2e/auth.spec.ts's
// redirect test), so its render assertions only make sense here, against
// the authenticated project's storageState. Runs under E2E_AUTH=1.

test("role-select page renders with both options", async ({ page }) => {
  await page.goto("/role-select");

  await expect(
    page.getByRole("heading", { name: "How will you use NurseDex?" }),
  ).toBeVisible();
  await expect(page.getByText("I am a nurse")).toBeVisible();
  await expect(page.getByText("I need care")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue" }),
  ).toBeDisabled();
});
