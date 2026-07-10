import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveSupabaseEnv,
  assertLocalSupabaseUrl,
  createTestUser as createLiveTestUser,
} from "./helpers/live-supabase";

// Issue #523: a systematic re-audit of every self-write INSERT policy for the
// bug class #522 found in hires and reviews. Those policies checked WHO owned
// the row but not its SHAPE, so a caller could insert a row in a state the app
// would never create (an already-confirmed hire, an already-approved review).
//
// Two more tables had the same gap:
//
//   contact_submissions  WITH CHECK (true), granted to anon. A submitter could
//                        pre-mark their message is_read = true, hiding it from
//                        the admin unread queue, and write admin_notes.
//
//   admin_actions        WITH CHECK (is_admin()) only. Any admin could write an
//                        audit-log row attributing an action to a DIFFERENT
//                        admin. The app always writes its own id, and it uses
//                        the user client, so this is reachable over PostgREST.
//
// These tests attempt each write as the attacker would, so they must never run
// against anything but a local/CI throwaway stack.
const { url: SUPABASE_URL, anonKey: ANON_KEY, serviceKey: SERVICE_KEY } = getLiveSupabaseEnv();

assertLocalSupabaseUrl(SUPABASE_URL, "RLS insert-shape tests");

let service: SupabaseClient;
let anon: SupabaseClient;
const stamp = Date.now();
const createdUserIds: string[] = [];

async function createUser(
  role: "nurse" | "family" | "admin",
  emailPrefix: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const { id, client } = await createLiveTestUser({
    service,
    url: SUPABASE_URL!,
    anonKey: ANON_KEY!,
    role,
    emailPrefix: `insert-shape-${emailPrefix}`,
    stamp,
  });
  createdUserIds.push(id);
  return { id, client };
}

beforeAll(() => {
  expect(SUPABASE_URL).toBeTruthy();
  expect(SERVICE_KEY).toBeTruthy();
  service = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  anon = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

afterAll(async () => {
  await service
    .from("contact_submissions")
    .delete()
    .like("email", `insert-shape-%${stamp}%`);
  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id).catch(() => {});
  }
});

describe("contact_submissions insert shape (issue #523)", () => {
  const email = () => `insert-shape-contact-${stamp}-${Math.random()}@example.com`;

  it("lets an anonymous visitor submit a normal contact form", async () => {
    const { error } = await anon.from("contact_submissions").insert({
      name: "Test Visitor",
      email: email(),
      subject: "Question",
      message: "A legitimate contact submission.",
    });
    expect(error).toBeNull();
  });

  it("blocks a submission pre-marked as already read", async () => {
    // Otherwise a submitter hides their own message from the admin queue.
    const { error } = await anon.from("contact_submissions").insert({
      name: "Sneaky Visitor",
      email: email(),
      message: "Hide me from the admin queue.",
      is_read: true,
    });
    expect(error).not.toBeNull();
  });

  it("blocks a submission that plants its own admin notes", async () => {
    const { error } = await anon.from("contact_submissions").insert({
      name: "Sneaky Visitor",
      email: email(),
      message: "Planting notes.",
      admin_notes: "Handled, ignore this one.",
    });
    expect(error).not.toBeNull();
  });

  it("still defaults a normal submission to unread with no notes", async () => {
    const addr = email();
    const { error } = await anon.from("contact_submissions").insert({
      name: "Test Visitor",
      email: addr,
      message: "Check the defaults.",
    });
    expect(error).toBeNull();

    const { data } = await service
      .from("contact_submissions")
      .select("is_read, admin_notes")
      .eq("email", addr)
      .single();
    expect(data!.is_read).toBe(false);
    expect(data!.admin_notes).toBeNull();
  });
});

describe("admin_actions insert shape (issue #523)", () => {
  let adminA: { id: string; client: SupabaseClient };
  let adminB: { id: string; client: SupabaseClient };
  let victim: { id: string; client: SupabaseClient };

  beforeAll(async () => {
    adminA = await createUser("admin", "admin-a");
    adminB = await createUser("admin", "admin-b");
    victim = await createUser("family", "victim");
  });

  it("lets an admin log an action against their own id", async () => {
    const { error } = await adminA.client.from("admin_actions").insert({
      admin_user_id: adminA.id,
      action_type: "suspend_user",
      target_user_id: victim.id,
    });
    expect(error).toBeNull();
  });

  it("blocks an admin from attributing an action to another admin", async () => {
    // Forging the audit trail: adminA suspends someone, adminB takes the blame.
    const { error } = await adminA.client.from("admin_actions").insert({
      admin_user_id: adminB.id,
      action_type: "remove_user",
      target_user_id: victim.id,
    });
    expect(error).not.toBeNull();
  });

  it("blocks a non-admin from writing the audit log at all", async () => {
    const { error } = await victim.client.from("admin_actions").insert({
      admin_user_id: victim.id,
      action_type: "suspend_user",
      target_user_id: victim.id,
    });
    expect(error).not.toBeNull();
  });
});

describe("self-write INSERT policies verified safe (issue #523)", () => {
  // Documented here rather than in a migration comment alone, so the audit's
  // reasoning is executable: these tables have no column whose value crosses a
  // security boundary, and the owner check is therefore sufficient.
  let family: { id: string; client: SupabaseClient };
  let nurse: { id: string; client: SupabaseClient };

  beforeAll(async () => {
    family = await createUser("family", "safe-family");
    nurse = await createUser("nurse", "safe-nurse");
  });

  it("saved_nurses still refuses a row owned by someone else", async () => {
    const { error } = await family.client.from("saved_nurses").insert({
      family_user_id: nurse.id,
      nurse_user_id: nurse.id,
    });
    expect(error).not.toBeNull();
  });

  it("family_profiles still refuses a row owned by someone else", async () => {
    const { error } = await family.client.from("family_profiles").insert({
      user_id: nurse.id,
      zip_code: "11501",
    });
    expect(error).not.toBeNull();
  });
});
