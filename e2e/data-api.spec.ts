import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Regression guard for issue #354: without the explicit Data API GRANTs in
// migration 042, a fresh local database (Supabase CLI >= 2.106.0, which no
// longer auto-exposes public tables) rejects every PostgREST query with
// "permission denied for table ...". These tests talk to PostgREST directly
// as the anon role and assert the grants are in place: a public-read SELECT
// and an anon-allowed INSERT both have to succeed. A missing grant surfaces
// as error code 42501, which is unambiguous (an empty table still returns a
// null error with [] rows).
//
// They run only in CI / the e2e job, where the local stack URL and
// publishable (anon) key are exported into the environment.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

test.describe("Data API grants (anon role)", () => {
  test.skip(
    !url || !anonKey,
    "Supabase URL / publishable key not in env (runs in the e2e job only)",
  );

  test("anon can SELECT a public-read table", async () => {
    const supabase = createClient(url!, anonKey!);
    const { error } = await supabase.from("zip_codes").select("zip").limit(1);
    expect(error, error?.message).toBeNull();
  });

  test("anon can INSERT into the waitlist", async () => {
    const supabase = createClient(url!, anonKey!);
    const email = `grants-check-${Date.now()}@example.com`;
    const { error } = await supabase
      .from("waitlist")
      .insert({ email, role: "family" });
    expect(error, error?.message).toBeNull();
  });
});
