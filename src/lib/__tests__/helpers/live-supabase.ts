import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local") });

/**
 * Shared setup for tests that write to a live Supabase instance (RLS
 * policies, Data API grants). Centralized so the local-only guard and test
 * user creation aren't duplicated per file. See .claude/CLAUDE.md's
 * "consolidate from the start" rule.
 */

export function getLiveSupabaseEnv(): {
  url: string | undefined;
  anonKey: string | undefined;
  serviceKey: string | undefined;
} {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    serviceKey: process.env.SUPABASE_SECRET_KEY,
  };
}

export function assertLocalSupabaseUrl(url: string | undefined, context: string): void {
  if (url && !/^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(url)) {
    throw new Error(
      `Refusing to run ${context} against a non-local Supabase URL (${url}). ` +
        "These tests write to the database and must only run against a local/CI throwaway stack.",
    );
  }
}

export type TestUserRole = "nurse" | "family" | "admin" | "super_admin";

/**
 * Creates a throwaway auth user, sets their public.users role via the
 * service-role client (bypasses the guard_users_protected_columns trigger,
 * matching how a real signup would arrive with the right role from the
 * start rather than self-escalating), and signs in an anon-key client as
 * that user.
 */
export async function createTestUser(params: {
  service: SupabaseClient;
  url: string;
  anonKey: string;
  role: TestUserRole;
  emailPrefix: string;
  stamp: number;
  password?: string;
}): Promise<{ id: string; client: SupabaseClient }> {
  const { service, url, anonKey, role, emailPrefix, stamp } = params;
  const password = params.password ?? "live-supabase-test-password-1234";
  const email = `${emailPrefix}-${stamp}@example.com`;

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`Failed to create test user: ${createErr?.message}`);
  }

  const { error: updateErr } = await service
    .from("users")
    .update({ role })
    .eq("id", created.user.id);
  if (updateErr) {
    throw new Error(`Failed to set role on test user: ${updateErr.message}`);
  }

  const client = createClient(url, anonKey);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) {
    throw new Error(`Failed to sign in test user: ${signInErr.message}`);
  }

  return { id: created.user.id, client };
}
