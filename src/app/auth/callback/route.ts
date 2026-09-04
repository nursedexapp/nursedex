import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { captureServerEventAfterResponse } from "@/lib/analytics/server";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { PASSWORD_RECOVERY } from "@/lib/constants";
import { isSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { unwrapOrThrow, toTypedFailure } from "@/lib/db/results";

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
  // we always honor it, otherwise role-having users were getting bounced
  // straight to /dashboard and skipping the password change. A next that
  // isn't a same-origin relative path is dropped (falls through to the
  // role/dashboard redirect below) rather than honored, since it's appended
  // directly to origin and could otherwise send the user off-site.
  const rawNext = searchParams.get("next");
  const explicitNext = isSafeRedirectPath(rawNext) ? rawNext : null;

  const supabase = await createClient();
  let exchanged = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchanged = !error;
  } else if (
    tokenHash &&
    tokenType &&
    OTP_TYPES.has(tokenType as EmailOtpType)
  ) {
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
      // Reported, not thrown (#847). exchangeCodeForSession above has already
      // set the session cookie, so throwing here does not undo anything: it
      // shows this person an error page while leaving them signed in with no
      // terms acceptance recorded. The failure reaches Sentry instead and the
      // redirect below still happens.
      const firstConfirmation = await toTypedFailure(
        supabase
          .from("users")
          .update({
            tos_accepted_at: new Date().toISOString(),
            tos_version: "1.0",
          })
          .eq("id", user.id)
          .is("tos_accepted_at", null)
          .select("id"),
        "the terms acceptance for a confirming signup",
      );

      // That .is filter means the update touches a row exactly once, on the
      // first confirmation, which makes it the only trustworthy signal that a
      // signup COMPLETED. Re-clicking the email link, or signing in again with
      // Google, updates nothing and is therefore a login rather than a signup.
      // Assume it runs twice: the database decides which event this is, not
      // the shape of the request.
      //
      // So a FAILED write cannot say which this was, and no event is sent at
      // all rather than a guessed one. A wrong signup or login count is worse
      // than a missing one: it is indistinguishable from a real event and
      // nothing downstream can tell it apart (L192).
      if (firstConfirmation.ok) {
        const completedSignup =
          ((firstConfirmation.data as { id: string }[] | null)?.length ?? 0) > 0;
        captureServerEventAfterResponse({
          distinctId: user.id,
          event: completedSignup
            ? ANALYTICS_EVENTS.SIGNUP_COMPLETED
            : ANALYTICS_EVENTS.LOGIN,
          properties: { method: code ? "oauth_or_link" : "email_confirmation" },
        });
      }
    }

    if (explicitNext) {
      const response = NextResponse.redirect(`${origin}${explicitNext}`);
      // Only a genuine recovery link (valid code/token just exchanged above)
      // can reach here with this next target, so mark the session as being in
      // password-recovery mode. The /reset-password page and action require
      // this marker, which blocks a plain logged-in user from changing their
      // password just by visiting /reset-password directly.
      if (tokenType === "recovery" || explicitNext === "/reset-password") {
        response.cookies.set(PASSWORD_RECOVERY.COOKIE_NAME, "1", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: PASSWORD_RECOVERY.TTL_SECONDS,
          path: "/",
        });
      }
      return response;
    }

    if (user) {
      // Throws, unlike the write above. This decides where to send them, and
      // a failed read has no safe default: /role-select asks somebody who
      // already has a role to choose one again. They are signed in either way,
      // so the error page is recoverable by navigating anywhere.
      const profile = await unwrapOrThrow(
        supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
        "the role of a signing in user",
      );
      if (profile?.role) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }
    }

    return NextResponse.redirect(`${origin}/role-select`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
