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
  // Distinguish "caller said next=/foo" from "no next provided." When the
  // caller is explicit (e.g. password recovery sets next=/reset-password),
  // we always honor it — otherwise role-having users were getting bounced
  // straight to /dashboard and skipping the password change.
  const explicitNext = searchParams.get("next");

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

    // Record TOS acceptance now that a session exists (signups confirm
    // here, not at the /signup step where there's no session yet). The
    // .is filter makes this a no-op if it was already recorded, e.g.
    // when the user re-clicks the email link.
    if (user && (tokenType === "signup" || code)) {
      await supabase
        .from("users")
        .update({
          tos_accepted_at: new Date().toISOString(),
          tos_version: "1.0",
        })
        .eq("id", user.id)
        .is("tos_accepted_at", null);
    }

    if (explicitNext) {
      return NextResponse.redirect(`${origin}${explicitNext}`);
    }

    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.role) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }
    }

    return NextResponse.redirect(`${origin}/role-select`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
