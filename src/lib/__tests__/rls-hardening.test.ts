import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveSupabaseEnv,
  assertLocalSupabaseUrl,
  createTestUser as createLiveTestUser,
} from "./helpers/live-supabase";

// Regression guard for the P0/P1 RLS write-policy findings (issues #384-389):
// several owner-scoped INSERT/UPDATE policies had no WITH CHECK, so a plain
// authenticated JWT could self-grant super_admin, self-verify/feature a
// nurse profile, or bypass the Family Access paywall entirely via a direct
// PostgREST write. These tests create throwaway users against a live
// Supabase instance and attempt the exact escalations described in those
// issues, so they must NEVER run against anything but a local/CI throwaway
// stack (they mutate auth.users and public.users).
const { url: SUPABASE_URL, anonKey: ANON_KEY, serviceKey: SERVICE_KEY } = getLiveSupabaseEnv();

assertLocalSupabaseUrl(SUPABASE_URL, "RLS hardening tests");

let service: SupabaseClient;
const stamp = Date.now();
const createdUserIds: string[] = [];

async function createTestUser(
  role: "nurse" | "family",
  emailPrefix: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const { id, client } = await createLiveTestUser({
    service,
    url: SUPABASE_URL!,
    anonKey: ANON_KEY!,
    role,
    emailPrefix: `rls-hardening-${emailPrefix}`,
    stamp,
  });
  createdUserIds.push(id);
  return { id, client };
}

beforeAll(() => {
  expect(SUPABASE_URL).toBeTruthy();
  expect(ANON_KEY).toBeTruthy();
  expect(SERVICE_KEY).toBeTruthy();
  service = createClient(SUPABASE_URL!, SERVICE_KEY!);
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id).catch(() => {});
  }
});

describe("AUD-001 (#384): users self-escalation", () => {
  it("an authenticated user cannot set their own role to super_admin", async () => {
    const { id, client } = await createTestUser("family", "escalate-role");

    const { error } = await client
      .from("users")
      .update({ role: "super_admin" })
      .eq("id", id);

    expect(error).not.toBeNull();

    const { data: row } = await service
      .from("users")
      .select("role")
      .eq("id", id)
      .single();
    expect(row?.role).toBe("family");
  });

  it("a suspended user cannot un-suspend themselves", async () => {
    const { id, client } = await createTestUser("family", "unsuspend-self");
    await service.from("users").update({ is_suspended: true }).eq("id", id);

    const { error } = await client
      .from("users")
      .update({ is_suspended: false })
      .eq("id", id);

    expect(error).not.toBeNull();

    const { data: row } = await service
      .from("users")
      .select("is_suspended")
      .eq("id", id)
      .single();
    expect(row?.is_suspended).toBe(true);
  });

  it("a user can still update their own ordinary profile fields", async () => {
    const { id, client } = await createTestUser("family", "edit-own-profile");

    const { error } = await client
      .from("users")
      .update({ first_name: "Updated" })
      .eq("id", id);

    expect(error).toBeNull();
    const { data: row } = await service
      .from("users")
      .select("first_name")
      .eq("id", id)
      .single();
    expect(row?.first_name).toBe("Updated");
  });
});

describe("AUD-005 (#388): anon insert into users", () => {
  it("anon cannot (re)insert a public.users row for an existing auth id", async () => {
    // A random / non-existent id would fail on the users.id -> auth.users
    // FK regardless of RLS, which wouldn't actually exercise the policy.
    // Use a real auth id whose public.users row was removed (simulating the
    // documented "seed a row for an id that later gets an auth user, or
    // whose row is otherwise missing" scenario) so the FK is satisfied and
    // only the INSERT grant/policy decide the outcome.
    const email = `rls-hardening-anon-insert-${stamp}@example.com`;
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password: "rls-hardening-test-password-1234",
      email_confirm: true,
    });
    if (createErr || !created.user) {
      throw new Error(`Failed to create test user: ${createErr?.message}`);
    }
    createdUserIds.push(created.user.id);
    await service.from("users").delete().eq("id", created.user.id);

    const anon = createClient(SUPABASE_URL!, ANON_KEY!);
    const { error } = await anon.from("users").insert({
      id: created.user.id,
      email,
      role: "super_admin",
    });

    expect(error).not.toBeNull();
  });
});

describe("AUD-003 (#386): nurse_profiles self-escalation", () => {
  it("a nurse cannot self-verify or self-grant featured tier via UPDATE", async () => {
    const { id, client } = await createTestUser("nurse", "self-verify");
    const { data: profile, error: insertErr } = await service
      .from("nurse_profiles")
      .insert({
        user_id: id,
        slug: `rls-test-nurse-${stamp}`,
        credential: "hha",
      })
      .select("id")
      .single();
    expect(insertErr).toBeNull();

    const { error } = await client
      .from("nurse_profiles")
      .update({ verification_status: "verified", tier: "featured" })
      .eq("user_id", id);

    expect(error).not.toBeNull();

    const { data: row } = await service
      .from("nurse_profiles")
      .select("verification_status, tier")
      .eq("id", profile!.id)
      .single();
    expect(row?.verification_status).toBe("pending");
    expect(row?.tier).toBe("free");
  });

  it("a nurse cannot self-insert a profile that is already verified/featured", async () => {
    const { id, client } = await createTestUser("nurse", "self-verify-insert");

    const { error } = await client.from("nurse_profiles").insert({
      user_id: id,
      slug: `rls-test-nurse-insert-${stamp}`,
      credential: "hha",
      verification_status: "verified",
      tier: "featured",
    });

    expect(error).not.toBeNull();
  });

  it("a nurse can still update ordinary profile fields", async () => {
    const { id, client } = await createTestUser("nurse", "edit-own-nurse-profile");
    await service.from("nurse_profiles").insert({
      user_id: id,
      slug: `rls-test-nurse-edit-${stamp}`,
      credential: "hha",
    });

    const { error } = await client
      .from("nurse_profiles")
      .update({ bio: "Updated bio" })
      .eq("user_id", id);

    expect(error).toBeNull();
  });
});

describe("AUD-002 (#385): reveals paywall bypass", () => {
  it("a family without an active subscription cannot insert a reveal", async () => {
    const { id: familyId, client } = await createTestUser("family", "no-sub-reveal");
    const { id: nurseId } = await createTestUser("nurse", "reveal-target-1");
    await service.from("nurse_profiles").insert({
      user_id: nurseId,
      slug: `rls-test-reveal-target-1-${stamp}`,
      credential: "hha",
      verification_status: "verified",
    });

    const { error } = await client.from("reveals").insert({
      family_user_id: familyId,
      nurse_user_id: nurseId,
    });

    expect(error).not.toBeNull();
  });

  it("a family with an active family_access subscription can insert a reveal", async () => {
    const { id: familyId, client } = await createTestUser("family", "active-sub-reveal");
    const { id: nurseId } = await createTestUser("nurse", "reveal-target-2");
    await service.from("nurse_profiles").insert({
      user_id: nurseId,
      slug: `rls-test-reveal-target-2-${stamp}`,
      credential: "hha",
      verification_status: "verified",
    });
    await service.from("subscriptions").insert({
      user_id: familyId,
      stripe_customer_id: `cus_test_${stamp}`,
      stripe_subscription_id: `sub_test_${stamp}`,
      status: "active",
      plan_type: "family_access",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    });

    const { error } = await client.from("reveals").insert({
      family_user_id: familyId,
      nurse_user_id: nurseId,
    });

    expect(error).toBeNull();
  });

  it("a subscribed family cannot backdate access_expires_at on insert", async () => {
    const { id: familyId, client } = await createTestUser(
      "family",
      "backdate-sub-reveal",
    );
    const { id: nurseId } = await createTestUser("nurse", "reveal-target-3");
    await service.from("nurse_profiles").insert({
      user_id: nurseId,
      slug: `rls-test-reveal-target-3-${stamp}`,
      credential: "hha",
      verification_status: "verified",
    });
    await service.from("subscriptions").insert({
      user_id: familyId,
      stripe_customer_id: `cus_test_b_${stamp}`,
      stripe_subscription_id: `sub_test_b_${stamp}`,
      status: "active",
      plan_type: "family_access",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    });

    const { error } = await client.from("reveals").insert({
      family_user_id: familyId,
      nurse_user_id: nurseId,
      access_expires_at: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
    });

    expect(error).not.toBeNull();
  });
});

describe("AUD-006 (#389): reviews self-write column guards", () => {
  it("a reviewer cannot self-approve their own pending review", async () => {
    const { id: reviewerId, client } = await createTestUser(
      "family",
      "review-self-approve",
    );
    const { id: nurseId } = await createTestUser("nurse", "review-target-1");
    const { data: review } = await service
      .from("reviews")
      .insert({
        nurse_user_id: nurseId,
        reviewer_name: "Test Reviewer",
        reviewer_user_id: reviewerId,
        rating: 5,
        text: "Great nurse",
        status: "pending",
      })
      .select("id")
      .single();

    const { error } = await client
      .from("reviews")
      .update({ status: "approved" })
      .eq("id", review!.id);

    expect(error).not.toBeNull();
    const { data: row } = await service
      .from("reviews")
      .select("status")
      .eq("id", review!.id)
      .single();
    expect(row?.status).toBe("pending");
  });

  it("a nurse updating nurse_response cannot also change the rating or status", async () => {
    const { id: nurseId, client } = await createTestUser(
      "nurse",
      "review-response-tamper",
    );
    const { data: review } = await service
      .from("reviews")
      .insert({
        nurse_user_id: nurseId,
        reviewer_name: "Another Reviewer",
        rating: 2,
        text: "Not great",
        status: "approved",
      })
      .select("id")
      .single();

    const { error } = await client
      .from("reviews")
      .update({ nurse_response: "Thanks for the feedback", rating: 5 })
      .eq("id", review!.id);

    expect(error).not.toBeNull();
    const { data: row } = await service
      .from("reviews")
      .select("rating, nurse_response")
      .eq("id", review!.id)
      .single();
    expect(row?.rating).toBe(2);
    expect(row?.nurse_response).toBeNull();
  });

  it("a nurse can update only nurse_response on their own review", async () => {
    const { id: nurseId, client } = await createTestUser(
      "nurse",
      "review-response-ok",
    );
    const { data: review } = await service
      .from("reviews")
      .insert({
        nurse_user_id: nurseId,
        reviewer_name: "Third Reviewer",
        rating: 4,
        text: "Good",
        status: "approved",
      })
      .select("id")
      .single();

    const { error } = await client
      .from("reviews")
      .update({ nurse_response: "Thank you!" })
      .eq("id", review!.id);

    expect(error).toBeNull();
  });
});
