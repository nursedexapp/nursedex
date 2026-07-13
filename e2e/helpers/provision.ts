import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

// Shared provisioning for the authenticated e2e journeys.
//
// The family setup and the nurse setup both need to conjure a confirmed user
// with a role, and the second copy of that is how the two drift apart. One
// implementation, used by both.
//
// Only ever runs against a local/CI throwaway Supabase (E2E_AUTH=1, see
// playwright.config.ts). It creates users and deletes rows, so pointing it at
// production would be destructive.

/**
 * Refuse to touch anything that is not a local throwaway database.
 *
 * This module creates users and DELETES profiles. .env.local on a dev machine
 * holds PRODUCTION credentials, and `npm run dev` loads it, so an e2e run
 * started without the local overrides exported would aim all of that at real
 * nurses. Documentation is not a safeguard; this is.
 */
function assertLocalSupabase(url: string): void {
  const host = new URL(url).hostname;
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "::1";

  if (!isLocal) {
    throw new Error(
      `e2e provisioning refused to run against ${url}. It creates users and deletes profiles, so it only ever runs against a local Supabase. Export NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY from \`supabase status\` first (see e2e/README.md).`,
    );
  }
}

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY for e2e provisioning.",
    );
  }

  assertLocalSupabase(url);

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Create a confirmed auth user, or find the one a previous run left behind and
 * reset its password (a previous run may have left a different one on it).
 */
export async function ensureUser(
  service: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data: created } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created?.user?.id) return created.user.id;

  const { data: list } = await service.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === email)?.id;
  if (!found) throw new Error(`Could not create or find ${email}`);

  await service.auth.admin.updateUserById(found, { password });
  return found;
}

/**
 * Write the public.users row, throwing on failure.
 *
 * A silent failure here is the worst kind: the spec runs against a user with no
 * role and fails somewhere far away, on an assertion that has nothing to do
 * with the real problem.
 */
export async function upsertUserRow(
  service: SupabaseClient,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await service.from("users").upsert(row);
  if (error) {
    throw new Error(
      `Could not write users row for ${String(row.email)}: ${error.message}`,
    );
  }
}

/**
 * Put a nurse back to the moment after signup, before they have chosen a role.
 *
 * The onboarding journey builds the profile by filling the wizard, so it must
 * start with no profile at all. Role selection is what creates the profile row
 * (with a temporary slug), and completeOnboarding refuses to run without one, so
 * "no profile" means "no role either".
 *
 * Run before EVERY attempt, not once per run: the spec completes onboarding, so
 * a retry that started from the leftovers of the last attempt would be testing a
 * nurse who already has a finished profile, which is not the thing under test.
 */
export async function resetNurseToPreOnboarding(
  service: SupabaseClient,
  nurseId: string,
): Promise<void> {
  const { error: profileErr } = await service
    .from("nurse_profiles")
    .delete()
    .eq("user_id", nurseId);
  if (profileErr) {
    throw new Error(`Could not clear nurse profile: ${profileErr.message}`);
  }

  const { error: userErr } = await service
    .from("users")
    .update({
      role: null,
      first_name: null,
      last_name: null,
      phone: null,
      zip_code: null,
    })
    .eq("id", nurseId);
  if (userErr) {
    throw new Error(`Could not reset nurse user row: ${userErr.message}`);
  }
}

/** Sign in through the UI so @supabase/ssr writes the auth cookies. */
export async function signInThroughUI(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}
