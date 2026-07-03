import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveSupabaseEnv,
  assertLocalSupabaseUrl,
  createTestUser as createLiveTestUser,
} from "./helpers/live-supabase";

// Regression guard for issue #387: migration 042 granted anon/authenticated
// ALL privileges on every public table, so RLS was the *only* thing standing
// between a role and a write it shouldn't have. These tests create throwaway
// users/rows against a live Supabase instance and attempt writes that #387's
// grants migration is meant to close off at the grant layer (independent of
// RLS), so they must NEVER run against anything but a local/CI throwaway
// stack.
const { url: SUPABASE_URL, anonKey: ANON_KEY, serviceKey: SERVICE_KEY } = getLiveSupabaseEnv();

assertLocalSupabaseUrl(SUPABASE_URL, "Data API grants tests");

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
    emailPrefix: `grants-${emailPrefix}`,
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

describe("#387: newsletter_subscribers is not reachable via the Data API", () => {
  it("anon cannot insert despite the table's own RLS policy allowing it", async () => {
    const email = `grants-newsletter-${stamp}@example.com`;

    const { error } = await anon.from("newsletter_subscribers").insert({ email });

    expect(error).not.toBeNull();

    const { data: row } = await service
      .from("newsletter_subscribers")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    expect(row).toBeNull();
  });
});

describe("#387: fully-locked-out tables fail closed at the grant layer, not silently via RLS", () => {
  it("anon reading subscriptions returns a permission error, not an empty array", async () => {
    const { data, error } = await anon.from("subscriptions").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("anon reading admin_actions returns a permission error, not an empty array", async () => {
    const { data, error } = await anon.from("admin_actions").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("anon reading users returns a permission error, not an empty array", async () => {
    const { data, error } = await anon.from("users").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe("#387: blog_posts stays admin-only through the Data API grant tightening", () => {
  it("an authenticated admin can create, update, and delete a post", async () => {
    const { client } = await createTestUser("admin", "blog-admin");

    const { data: created, error: insertErr } = await client
      .from("blog_posts")
      .insert({
        title: `Grants test post ${stamp}`,
        slug: `grants-test-post-${stamp}`,
        content: { type: "doc", content: [] },
      })
      .select("id")
      .single();
    expect(insertErr).toBeNull();
    expect(created).toBeTruthy();

    const { error: updateErr } = await client
      .from("blog_posts")
      .update({ title: "Updated title" })
      .eq("id", created!.id);
    expect(updateErr).toBeNull();

    const { error: deleteErr } = await client.from("blog_posts").delete().eq("id", created!.id);
    expect(deleteErr).toBeNull();
  });

  it("a non-admin authenticated user cannot create a post", async () => {
    const { client } = await createTestUser("family", "blog-nonadmin");

    const { error } = await client.from("blog_posts").insert({
      title: `Should not be created ${stamp}`,
      slug: `should-not-be-created-${stamp}`,
      content: { type: "doc", content: [] },
    });

    expect(error).not.toBeNull();
  });

  it("anon cannot read blog_posts directly (public listing goes through service-role)", async () => {
    const { data, error } = await anon.from("blog_posts").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe("#387: admin_actions accepts the real admin write path, blocks everyone else", () => {
  it("an authenticated admin can insert an admin action for their own user", async () => {
    const { id: adminId, client } = await createTestUser("admin", "action-writer");

    const { error } = await client.from("admin_actions").insert({
      admin_user_id: adminId,
      action_type: "verify_nurse",
    });

    expect(error).toBeNull();
  });

  it("a non-admin authenticated user cannot insert an admin action", async () => {
    const { id: familyId, client } = await createTestUser("family", "action-nonadmin");

    const { error } = await client.from("admin_actions").insert({
      admin_user_id: familyId,
      action_type: "verify_nurse",
    });

    expect(error).not.toBeNull();
  });
});
