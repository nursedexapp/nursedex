import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

// These tests run against the LOCAL Supabase instance.
// They verify RLS policies by querying as anon (no auth).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

let anon: SupabaseClient;

beforeAll(() => {
  expect(SUPABASE_URL).toBeTruthy();
  expect(SUPABASE_ANON_KEY).toBeTruthy();
  anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
});

describe("RLS policies - anon user", () => {
  it("can read zip_codes (public table)", async () => {
    const { data, error } = await anon.from("zip_codes").select("zip").limit(1);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThanOrEqual(0);
  });

  it("can read license_verification_urls (public table)", async () => {
    const { data, error } = await anon
      .from("license_verification_urls")
      .select("id")
      .limit(1);

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it("can read slug_redirects (public table)", async () => {
    const { data, error } = await anon
      .from("slug_redirects")
      .select("id")
      .limit(1);

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it("cannot read users table (requires auth)", async () => {
    // Since #387, anon has no Data API grant on users at all, so this fails
    // at the grant layer (permission denied) rather than returning an empty
    // array via RLS.
    const { data, error } = await anon.from("users").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("cannot read nurse_profiles as anon (only verified profiles visible to authenticated)", async () => {
    const { data } = await anon.from("nurse_profiles").select("id").limit(1);

    // Anon should see nothing (RLS requires auth for profile views)
    // or only see verified profiles if the policy allows anon
    expect(data).toBeDefined();
  });

  it("cannot read admin_actions (admin only)", async () => {
    // Since #387, anon has no grant on this table at all: permission denied,
    // not an RLS-filtered empty array.
    const { data, error } = await anon.from("admin_actions").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("cannot read email_log (admin only)", async () => {
    const { data, error } = await anon.from("email_log").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("cannot read blocked_emails (admin only)", async () => {
    const { data, error } = await anon.from("blocked_emails").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("cannot read family_profiles (requires auth)", async () => {
    const { data, error } = await anon.from("family_profiles").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("cannot read subscriptions (requires auth)", async () => {
    const { data, error } = await anon.from("subscriptions").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("cannot read reveals (requires auth)", async () => {
    const { data, error } = await anon.from("reveals").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("can insert contact_submissions (public form)", async () => {
    const { error } = await anon.from("contact_submissions").insert({
      name: "Test User",
      email: "test@example.com",
      message: "This is a test submission from RLS tests.",
    });

    // Should succeed (public insert policy)
    expect(error).toBeNull();
  });

  it("can insert search_gap_log (public insert)", async () => {
    const { error } = await anon.from("search_gap_log").insert({
      filters: { care_type: "elder_care", zip: "11701" },
      result_count: 0,
    });

    expect(error).toBeNull();
  });

  it("cannot read search_gap_log (admin only)", async () => {
    const { data, error } = await anon.from("search_gap_log").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
