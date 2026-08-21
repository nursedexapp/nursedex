import { createBrowserClient } from "@supabase/ssr";
import { authCookieOptions } from "./auth-cookie";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    authCookieOptions(),
  );
}
