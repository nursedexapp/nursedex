import { test as setup, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Provisions a confirmed admin in the configured (local/test) Supabase and
// signs in through the real login UI so the app's auth cookies are written,
// then saves the session as storageState for the authenticated project.
//
// Only runs when E2E_AUTH=1 (see playwright.config.ts). Never point this at
// a production database: it creates a user and the authenticated specs
// create posts.

const ADMIN_STATE = "e2e/.auth/admin.json";
const EMAIL = process.env.TEST_ADMIN_EMAIL ?? "e2e-admin@nursedex.test";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? "e2e-admin-password-1234";

setup("authenticate as admin", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY for e2e auth setup.",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Create the admin (idempotent: if it already exists, look up its id).
  let userId: string | undefined;
  const { data: created } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list?.users.find((u) => u.email === EMAIL)?.id;
  }
  if (!userId) throw new Error("Could not provision the e2e admin user.");

  // Ensure the public profile exists and carries an admin role.
  const { error: upsertError } = await admin
    .from("users")
    .upsert({ id: userId, email: EMAIL, role: "super_admin" });
  if (upsertError) {
    throw new Error(`Could not set admin role: ${upsertError.message}`);
  }

  // Sign in through the UI so @supabase/ssr writes the auth cookies.
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15000,
  });

  // Confirm the session actually reaches an admin-gated page.
  await page.goto("/admin/blog");
  await expect(page.getByRole("heading", { name: "Blog" })).toBeVisible();

  await page.context().storageState({ path: ADMIN_STATE });
});
