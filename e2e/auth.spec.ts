import { test, expect } from "@playwright/test";

// Mirrors PASSWORD_RECOVERY.COOKIE_NAME in src/lib/constants.ts. The
// reset-password page only renders the form when this recovery marker is
// present (set by the recovery callback); otherwise it shows an expired
// notice (see src/app/(auth)/reset-password/page.tsx).
const RECOVERY_COOKIE = "nursedex_pw_recovery";

async function grantRecoverySession(
  context: import("@playwright/test").BrowserContext,
  baseURL = "http://localhost:3000",
) {
  await context.addCookies([
    { name: RECOVERY_COOKIE, value: "1", url: baseURL },
  ]);
}

// These E2E tests verify the auth UI flows render and behave correctly.
// They test page rendering, form validation, navigation, and redirects.
// Actual Supabase auth (signup/login with real credentials) is not tested
// here since it requires local Supabase with email confirmation handling.

test.describe("Auth pages load correctly", () => {
  test("login page renders with form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Continue with Google")).toBeVisible();
    await expect(page.getByText("or continue with email")).toBeVisible();
  });

  test("signup page renders with form and progress", async ({ page }) => {
    await page.goto("/signup");

    await expect(page.getByRole("heading", { name: "Join NurseDex" })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Join NurseDex" })).toBeVisible();
    // Progress indicator
    await expect(page.getByText("Create account")).toBeVisible();
    await expect(page.getByText("Confirm email")).toBeVisible();
    await expect(page.getByText("Choose role")).toBeVisible();
  });

  test("forgot-password page renders", async ({ page }) => {
    await page.goto("/forgot-password");

    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
    await expect(page.getByText("Back to sign in")).toBeVisible();
  });

  test("reset-password page renders the form with a recovery session", async ({
    page,
    context,
  }) => {
    await grantRecoverySession(context);
    await page.goto("/reset-password");

    await expect(page.getByRole("heading", { name: "Set new password" })).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();
    await expect(page.getByRole("button", { name: "Update password" })).toBeVisible();
  });

  test("reset-password page shows an expired notice without a recovery session", async ({
    page,
  }) => {
    await page.goto("/reset-password");

    await expect(
      page.getByRole("heading", { name: "Link invalid or expired" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Request a new link" }),
    ).toBeVisible();
  });
});

test.describe("Auth navigation", () => {
  test("login page links to signup", async ({ page }) => {
    await page.goto("/login");

    await page.getByText("New here? Create an account").click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("signup page links to login", async ({ page }) => {
    await page.goto("/signup");

    await page.getByText("Sign in instead").click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page links to forgot-password", async ({ page }) => {
    await page.goto("/login");

    await page.getByText("Forgot password?").click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test("forgot-password links back to login", async ({ page }) => {
    await page.goto("/forgot-password");

    await page.getByText("Back to sign in").click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Form validation", () => {
  test("signup validates password length", async ({ page }) => {
    await page.goto("/signup");

    await page.locator("#email").fill("test@example.com");
    await page.locator("#password").fill("short");

    // Remove native minLength so our client-side validation runs
    await page.locator("#password").evaluate((el: HTMLInputElement) => {
      el.removeAttribute("minLength");
      el.removeAttribute("required");
    });

    await page.getByRole("button", { name: "Join NurseDex" }).click();

    await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
  });

  test("signup shows character count while typing", async ({ page }) => {
    await page.goto("/signup");

    await page.locator("#password").fill("abc");

    await expect(page.getByText("3/8 characters")).toBeVisible();
  });

  test("password toggle shows/hides password on login", async ({ page }) => {
    await page.goto("/login");

    const passwordInput = page.locator("#password");
    await passwordInput.fill("testpassword");

    // Initially hidden
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Click toggle to show
    await page.getByLabel("Show password").click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    // Click toggle to hide
    await page.getByLabel("Hide password").click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("reset-password validates password match", async ({ page, context }) => {
    await grantRecoverySession(context);
    await page.goto("/reset-password");

    await page.locator("#password").fill("newpassword123");
    await page.locator("#confirmPassword").fill("differentpassword");
    await page.getByRole("button", { name: "Update password" }).click();

    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });
});

test.describe("Unauthenticated redirects", () => {
  test("dashboard redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/dashboard");

    await page.waitForURL(/\/login/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("role-select redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/role-select");

    await page.waitForURL(/\/login/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
