import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveSupabaseEnv,
  assertLocalSupabaseUrl,
  createTestUser as createLiveTestUser,
} from "./helpers/live-supabase";

// Regression guard for issue #517: migration 052 revokes the PUBLIC-default
// EXECUTE grant from every public-schema function and re-grants only the
// roles that actually call it, either directly (an app RPC) or indirectly
// (an RLS policy's USING/WITH CHECK). The main risk is is_admin(): no
// CREATE POLICY in this codebase scopes itself with `TO <role>`, so it
// applies to PUBLIC, and anon must stay able to *execute* is_admin() (even
// though it always evaluates false for anon) or every policy that
// references it starts throwing "permission denied for function" instead
// of just evaluating to false.
const { url: SUPABASE_URL, anonKey: ANON_KEY, serviceKey: SERVICE_KEY } = getLiveSupabaseEnv();

assertLocalSupabaseUrl(SUPABASE_URL, "Routine EXECUTE grants tests");

let service: SupabaseClient;
let anon: SupabaseClient;
const stamp = Date.now();
const createdUserIds: string[] = [];

async function createTestUser(
  role: "nurse" | "family" | "admin",
  emailPrefix: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const { id, client } = await createLiveTestUser({
    service,
    url: SUPABASE_URL!,
    anonKey: ANON_KEY!,
    role,
    emailPrefix: `routine-grants-${emailPrefix}`,
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
  anon = createClient(SUPABASE_URL!, ANON_KEY!);
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id).catch(() => {});
  }
});

function isPermissionDenied(error: { message: string } | null): boolean {
  return !!error && /permission denied for function/i.test(error.message);
}

describe("#517: is_admin() stays executable by anon inside OR'd RLS policies", () => {
  it("anon can still select approved reviews (reviews_select_approved OR reviews_select_admin)", async () => {
    const { data, error } = await anon.from("reviews").select("id").eq("status", "approved").limit(1);

    expect(isPermissionDenied(error)).toBe(false);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("an authenticated admin can still read all reviews via the is_admin()-gated policy", async () => {
    const { client } = await createTestUser("admin", "reviews-admin");

    const { error } = await client.from("reviews").select("id").limit(1);

    expect(isPermissionDenied(error)).toBe(false);
    expect(error).toBeNull();
  });

  it("a non-admin authenticated user is still denied admin_actions insert (false, not a permission error)", async () => {
    const { id: familyId, client } = await createTestUser("family", "reviews-nonadmin");

    const { error } = await client
      .from("admin_actions")
      .insert({ admin_user_id: familyId, action_type: "verify_nurse" });

    expect(error).not.toBeNull();
    expect(isPermissionDenied(error)).toBe(false);
  });
});

describe("#517: get_user_role() is dead code and gets no re-grant", () => {
  it("anon calling get_user_role() is denied at the grant layer", async () => {
    const { error } = await anon.rpc("get_user_role");

    expect(error).not.toBeNull();
    expect(isPermissionDenied(error)).toBe(true);
  });

  it("an authenticated user calling get_user_role() is denied at the grant layer", async () => {
    const { client } = await createTestUser("family", "get-user-role");

    const { error } = await client.rpc("get_user_role");

    expect(error).not.toBeNull();
    expect(isPermissionDenied(error)).toBe(true);
  });
});

describe("#517: check_reveal_rate_limit is authenticated-only", () => {
  it("anon is denied at the grant layer", async () => {
    const { error } = await anon.rpc("check_reveal_rate_limit", {
      p_family_user_id: "00000000-0000-4000-8000-000000000000",
    });

    expect(error).not.toBeNull();
    expect(isPermissionDenied(error)).toBe(true);
  });

  it("an authenticated family user can call it for their own id", async () => {
    const { id, client } = await createTestUser("family", "reveal-rate-limit");

    const { error } = await client.rpc("check_reveal_rate_limit", {
      p_family_user_id: id,
    });

    expect(isPermissionDenied(error)).toBe(false);
    expect(error).toBeNull();
  });
});

describe("#517: increment_nurse_analytics is authenticated-only", () => {
  it("anon is denied at the grant layer", async () => {
    const { error } = await anon.rpc("increment_nurse_analytics", {
      p_nurse_user_id: "00000000-0000-4000-8000-000000000000",
      p_field: "profile_views",
    });

    expect(error).not.toBeNull();
    expect(isPermissionDenied(error)).toBe(true);
  });

  it("an authenticated nurse can call it for their own id", async () => {
    const { id, client } = await createTestUser("nurse", "nurse-analytics");

    const { error } = await client.rpc("increment_nurse_analytics", {
      p_nurse_user_id: id,
      p_field: "profile_views",
    });

    expect(isPermissionDenied(error)).toBe(false);
    expect(error).toBeNull();
  });
});

describe("#517: calculate_distance stays open to anon", () => {
  it("anon can still call it (pure geo-math, no data exposure)", async () => {
    const { data, error } = await anon.rpc("calculate_distance", {
      lat1: 40.7128,
      lon1: -74.006,
      lat2: 40.7128,
      lon2: -74.006,
    });

    expect(isPermissionDenied(error)).toBe(false);
    expect(error).toBeNull();
    expect(data).toBeCloseTo(0, 1);
  });
});
