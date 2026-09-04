import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveSupabaseEnv,
  assertLocalSupabaseUrl,
  createTestUser as createLiveTestUser,
} from "./helpers/live-supabase";

import { assertNoWriteError } from "@/lib/db/results";
// Issue #381. get_public_nurse_by_slug is SECURITY DEFINER and GRANTed to
// anon, so it is callable directly with the anon key from the client bundle.
// Migration 041 returned last_name and license_number to everyone; the only
// redaction lived in the profile page's server component, which never touched
// the raw endpoint. These tests call the RPC exactly as an attacker would (an
// anon client and an unentitled family client) and assert both fields are
// absent, and that entitled callers still receive them.
//
// The migration also nulls the fields for the unentitled, so this doubles as
// the AUD-120 DB-layer regression test the app-layer identity.test.ts cannot
// provide.
const {
  url: SUPABASE_URL,
  anonKey: ANON_KEY,
  serviceKey: SERVICE_KEY,
} = getLiveSupabaseEnv();

assertLocalSupabaseUrl(SUPABASE_URL, "nurse identity gating tests");

let service: SupabaseClient;
let anon: SupabaseClient;
const stamp = Date.now();
const createdUserIds: string[] = [];

const NURSE_SLUG = `identity-gate-nurse-${stamp}`;
const LAST_NAME = "Rodriguez";
const LICENSE = `RN-${stamp}`;
let nurseId: string;

async function createUser(
  role: "nurse" | "family" | "admin",
  emailPrefix: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const { id, client } = await createLiveTestUser({
    service,
    url: SUPABASE_URL!,
    anonKey: ANON_KEY!,
    role,
    emailPrefix: `identity-gate-${emailPrefix}`,
    stamp,
  });
  createdUserIds.push(id);
  return { id, client };
}

/** The RPC result, or null. Uses the given client's auth context. */
async function fetchNurse(client: SupabaseClient) {
  const { data, error } = await client
    .rpc("get_public_nurse_by_slug", { p_slug: NURSE_SLUG })
    .maybeSingle();
  if (error) throw new Error(`RPC failed: ${error.message}`);
  return data as {
    last_name: string | null;
    license_number: string | null;
    first_name: string | null;
  } | null;
}

beforeAll(async () => {
  service = createClient(SUPABASE_URL!, SERVICE_KEY!);
  anon = createClient(SUPABASE_URL!, ANON_KEY!);

  const nurse = await createUser("nurse", "target");
  nurseId = nurse.id;

  // last_name lives on users; license_number on nurse_profiles.
  const { error: nameErr } = await service
    .from("users")
    .update({ first_name: "Jane", last_name: LAST_NAME })
    .eq("id", nurseId);
  if (nameErr) throw new Error(`set nurse name: ${nameErr.message}`);

  const { error: profErr } = await service.from("nurse_profiles").insert({
    user_id: nurseId,
    slug: NURSE_SLUG,
    credential: "rn",
    license_number: LICENSE,
    verification_status: "verified",
  });
  if (profErr) throw new Error(`create nurse profile: ${profErr.message}`);
});

afterAll(async () => {
  await assertNoWriteError(
    service.from("nurse_profiles").delete().eq("user_id", nurseId),
    "nurse_profiles, a fixture write in nurse-identity-gating",
  );
  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("get_public_nurse_by_slug redacts identity for the unentitled", () => {
  it("returns the nurse but nulls last_name and license_number for anon", async () => {
    const row = await fetchNurse(anon);
    expect(row).not.toBeNull();
    // The profile itself is public: first name still comes through.
    expect(row!.first_name).toBe("Jane");
    expect(row!.last_name).toBeNull();
    expect(row!.license_number).toBeNull();
  });

  it("nulls both fields for a signed-in family with no subscription or reveal", async () => {
    const { client } = await createUser("family", "no-entitlement");
    const row = await fetchNurse(client);
    expect(row!.last_name).toBeNull();
    expect(row!.license_number).toBeNull();
  });
});

describe("get_public_nurse_by_slug returns identity to the entitled", () => {
  it("returns both fields to a family with an active Family Access subscription", async () => {
    const { id: familyId, client } = await createUser("family", "subbed");
    const { error } = await service.from("subscriptions").insert({
      user_id: familyId,
      stripe_customer_id: `cus_identity_${stamp}`,
      stripe_subscription_id: `sub_identity_${stamp}`,
      status: "active",
      plan_type: "family_access",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(
        Date.now() + 30 * 86400 * 1000,
      ).toISOString(),
    });
    if (error) throw new Error(`create subscription: ${error.message}`);

    const row = await fetchNurse(client);
    expect(row!.last_name).toBe(LAST_NAME);
    expect(row!.license_number).toBe(LICENSE);
  });

  it("returns both fields to a family holding an unexpired reveal", async () => {
    const { id: familyId, client } = await createUser("family", "revealed");
    const { error } = await service.from("reveals").insert({
      family_user_id: familyId,
      nurse_user_id: nurseId,
      access_expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    });
    if (error) throw new Error(`create reveal: ${error.message}`);

    const row = await fetchNurse(client);
    expect(row!.last_name).toBe(LAST_NAME);
    expect(row!.license_number).toBe(LICENSE);
  });

  it("returns both fields to the nurse viewing their own profile", async () => {
    // Sign in as the nurse we already created.
    const selfClient = createClient(SUPABASE_URL!, ANON_KEY!);
    const { error: signInErr } = await selfClient.auth.signInWithPassword({
      email: `identity-gate-target-${stamp}@example.com`,
      password: "live-supabase-test-password-1234",
    });
    if (signInErr) throw new Error(`sign in as nurse: ${signInErr.message}`);

    const row = await fetchNurse(selfClient);
    expect(row!.last_name).toBe(LAST_NAME);
    expect(row!.license_number).toBe(LICENSE);
  });

  it("returns both fields to an admin", async () => {
    const { client } = await createUser("admin", "admin");
    const row = await fetchNurse(client);
    expect(row!.last_name).toBe(LAST_NAME);
    expect(row!.license_number).toBe(LICENSE);
  });
});
