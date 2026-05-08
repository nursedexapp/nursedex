import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tokenType = searchParams.get("type");
  const next = searchParams.get("next") ?? "/role-select";

  const supabase = await createClient();
  let exchanged = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchanged = !error;
  } else if (tokenHash && tokenType && OTP_TYPES.has(tokenType as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: tokenType as EmailOtpType,
    });
    exchanged = !error;
  }

  if (exchanged) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
