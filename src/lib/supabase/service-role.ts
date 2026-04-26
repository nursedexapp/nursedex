import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client using the service-role secret key. Bypasses RLS.
 *
 * Use this only from contexts where there is no end-user session
 * (Stripe webhooks, cron jobs, internal API routes verified by
 * CRON_SECRET). Never expose results from this client to the browser
 * without re-checking ownership in code.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY for service-role client.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
