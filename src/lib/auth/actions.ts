"use server";

import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendAccountExistsNoticeEmail } from "@/lib/email/send";
import { captureServerEventAfterResponse } from "@/lib/analytics/server";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { PASSWORD, PASSWORD_RECOVERY } from "@/lib/constants";
import { toTypedFailure } from "@/lib/db/results";
import { isUniqueViolationOn } from "@/lib/db/postgres-errors";
import {
  calculateCompleteness,
  NEW_PROFILE_COMPLETENESS_INPUT,
} from "@/lib/profile/completeness";

export type AuthResult = {
  error?: string;
  success?: string;
};

/**
 * What every one of these actions says when a read or write it depends on
 * failed (#847). One sentence, because the person cannot act differently on
 * which table it was, and the table name is ours rather than theirs. The
 * operation is named to Sentry and the server log instead.
 */
const COULD_NOT_COMPLETE =
  "We couldn't complete that just now. Please try again.";

export async function signUp(formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const tosAccepted = formData.get("tos") === "on";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (password.length < PASSWORD.MIN_LENGTH) {
    return {
      error: `Password must be at least ${PASSWORD.MIN_LENGTH} characters.`,
    };
  }

  if (!tosAccepted) {
    return {
      error: "You must accept the Terms of Service and Privacy Policy.",
    };
  }

  const supabase = await createClient();

  // Check blocked emails with the service-role client: blocked_emails is
  // admin-only under RLS, so the anon signup client reads nothing and the
  // block silently never fires (a removed user could re-signup, and Supabase
  // then obfuscates the response since the auth row still exists).
  const service = createServiceRoleClient();
  const blocked = await toTypedFailure(
    service
      .from("blocked_emails")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle(),
    "the signup block list",
  );

  // A failed read is NOT "not on the list" (#982). This used to discard the
  // error, so any failure to read admitted the address, and a security control
  // that fails open under load is not a control. Dan's call on 4 September
  // 2026: refuse and say so. Signups here are rare enough that the cost of
  // refusing during an outage is small, against a removed user walking back in.
  //
  // The sentence is deliberately about OUR failure and says nothing about the
  // address, so an outage cannot be used to probe who is on the list.
  if (!blocked.ok) {
    return {
      error: "We couldn't complete your signup just now. Please try again.",
    };
  }

  if (blocked.data) {
    return { error: "This email address cannot be used to create an account." };
  }

  // When a confirmed account already exists for this email, Supabase silently
  // obfuscates the signUp response (no error, an empty-identities fake user, no
  // email sent) to prevent enumeration. That left real owners stranded on the
  // "check your email" page forever. Detect the duplicate, then email the owner
  // a login/reset link instead of revealing account existence on screen. The
  // on-screen result below stays byte-for-byte identical to the new-user path,
  // so nothing leaks.
  //
  // The auth schema is NOT exposed to PostgREST, so it cannot be read with
  // service.schema("auth").from("users"). Instead read the public.users mirror
  // (created at signup by the on_auth_user_created trigger) for the id, then
  // ask the GoTrue admin API whether the email is confirmed.
  // A failed read is NOT "this is a brand new address" (#847). Answering that
  // way sends a real owner through signUp, which Supabase silently obfuscates
  // for an address that already has a confirmed account, so they are left on
  // the "check your email" page for a message that will never arrive.
  const existingRead = await toTypedFailure(
    service
      .from("users")
      .select("id, first_name")
      .eq("email", email.toLowerCase())
      .maybeSingle(),
    "an existing account for this address",
  );
  if (!existingRead.ok) return { error: COULD_NOT_COMPLETE };
  const existing = existingRead.data;

  if (existing) {
    const { data: authData } = await service.auth.admin.getUserById(
      existing.id,
    );
    if (authData?.user?.email_confirmed_at) {
      after(() =>
        sendAccountExistsNoticeEmail({
          to: email.toLowerCase(),
          firstName: existing.first_name ?? undefined,
        }),
      );
      return { success: "Check your email for a confirmation link." };
    }
  }

  // No confirmed account exists: the email is either brand new or an existing
  // unconfirmed signup. signUp does the right thing in both cases (creates the
  // user, or resends the confirmation email), so let it proceed.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "https://nursedex.com"}/auth/callback`,
    },
  });

  if (error) {
    // Duplicate emails are handled upstream by the auth.users pre-check above,
    // and with email confirmation enabled Supabase obfuscates the existing
    // account case (returns no error) rather than reporting "already
    // registered". So any error reaching here is an unexpected failure, not a
    // known duplicate, and gets the generic message.
    console.error("Signup error:", error.message);
    return { error: "Something went wrong. Please try again in a moment." };
  }

  // tos_accepted_at is recorded in /auth/callback once the user clicks the
  // confirmation link and a session exists. With email confirmation enabled,
  // there is no session here yet so we can't update the public.users row.

  return { success: "Check your email for a confirmation link." };
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // The two specific messages below reveal that an account exists for this
    // email (unconfirmed, or suspended). This is an intentional tradeoff: both
    // are needed UX (the confirm/resend flow and the suspension support path),
    // and GoTrue only returns these after the password is verified, so they
    // are not a free enumeration oracle. Every other failure, including an
    // unknown email, returns the generic message at the end.
    if (error.message.includes("Email not confirmed")) {
      return {
        error:
          "Please confirm your email before signing in. Check your inbox for a confirmation link.",
      };
    }
    // A suspended/removed account is banned at the auth level, so the login
    // is rejected. Tell them that instead of the generic credentials error.
    if (
      error.code === "user_banned" ||
      error.message.toLowerCase().includes("banned")
    ) {
      return {
        error:
          "This account has been suspended. Email support@nursedex.com if you think this is a mistake.",
      };
    }
    return { error: "Invalid email or password." };
  }

  // Check if user has a role
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // A failed read is NOT "this person has no role" (#847). It decides where
    // they land, and the no-role branch sends somebody who already chose one
    // back to role-select. It also feeds the login event's role property, and
    // a login recorded with a null role is indistinguishable from a real one.
    const profileRead = await toTypedFailure(
      supabase.from("users").select("role").eq("id", user.id).single(),
      "the role of a signing in user",
    );
    if (!profileRead.ok) return { error: COULD_NOT_COMPLETE };
    const profile = profileRead.data;

    // After the response, so a slow or failing analytics call cannot delay a
    // login or break it. Captured here rather than on the client because every
    // success path below redirects, and code after a redirect never runs.
    captureServerEventAfterResponse({
      distinctId: user.id,
      event: ANALYTICS_EVENTS.LOGIN,
      properties: { role: profile?.role ?? null, method: "password" },
    });

    if (!profile?.role) {
      redirect("/role-select");
    }

    // Admins go to the admin home, not the nurse/family dashboard.
    if (profile.role === "admin" || profile.role === "super_admin") {
      redirect("/admin");
    }
  }

  redirect("/dashboard");
}

export async function signInWithGoogle(): Promise<AuthResult | void> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "https://nursedex.com"}/auth/callback`,
      // Deliberately no queryParams. This used to send access_type: "offline"
      // and prompt: "consent" (#742). Together those ask Google for a refresh
      // token and force the consent screen on every sign-in so the token keeps
      // being reissued. Nothing here has ever read provider_token or
      // provider_refresh_token, so the token was requested and never used,
      // while every returning user paid for it with a full "You're signing back
      // in to..." interstitial. Do not add them back without a reader.
    },
  });

  // Returning void on failure was the whole bug (#444): the caller could not
  // tell a sign-in that failed from one that was still working, so the button
  // sat on "Connecting..." forever. Both failure shapes have to come back as an
  // error, including the quiet one where Supabase reports no error but hands
  // back no URL to send the user to.
  if (error || !data.url) {
    console.error("Google sign-in could not start", error);
    return {
      error: "We could not reach Google. Please try again or use your email.",
    };
  }

  redirect(data.url);
}

export async function forgotPassword(formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "https://nursedex.com"}/auth/callback?next=/reset-password`,
  });

  // resetPasswordForEmail never errors for an unknown email (Supabase
  // obfuscates that case to prevent enumeration), so any error here is an
  // internal condition such as a rate limit. Returning its raw message would
  // both leak internals and make the response differ from the generic success
  // below. Log it server-side and always return the same neutral message.
  if (error) {
    console.error("Forgot password error:", error.message);
  }

  return {
    success:
      "If an account exists with this email, you will receive a password reset link.",
  };
}

export async function resetPassword(formData: FormData): Promise<AuthResult> {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    return { error: "Both fields are required." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  if (password.length < PASSWORD.MIN_LENGTH) {
    return {
      error: `Password must be at least ${PASSWORD.MIN_LENGTH} characters.`,
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  redirect("/login?message=password_reset");
}

/**
 * Reset a password from the email recovery flow. Unlike resetPassword (used
 * by the authenticated settings page), this requires the recovery marker
 * cookie set by /auth/callback, so a plain logged-in session visiting
 * /reset-password directly cannot change the password.
 */
export async function resetPasswordRecovery(
  formData: FormData,
): Promise<AuthResult> {
  const cookieStore = await cookies();
  const inRecovery =
    cookieStore.get(PASSWORD_RECOVERY.COOKIE_NAME)?.value === "1";
  if (!inRecovery) {
    return {
      error:
        "This password reset link is invalid or has expired. Please request a new one.",
    };
  }

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    return { error: "Both fields are required." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  if (password.length < PASSWORD.MIN_LENGTH) {
    return {
      error: `Password must be at least ${PASSWORD.MIN_LENGTH} characters.`,
    };
  }

  const supabase = await createClient();

  // updateUser still needs the recovery session that /auth/callback
  // established; if it somehow lapsed, surface a clear error.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "This password reset link is invalid or has expired. Please request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  // One-time use: drop the marker so the link can't be reused.
  cookieStore.delete(PASSWORD_RECOVERY.COOKIE_NAME);

  redirect("/login?message=password_reset");
}

export async function resendConfirmation(
  formData: FormData,
): Promise<AuthResult> {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required." };
  }

  const supabase = await createClient();

  // Supabase silently no-ops resend for already-confirmed accounts and still
  // returns success, which would leave the user staring at an inbox that never
  // gets a new email. Check confirmation status first. If the account is
  // already confirmed, email the owner a login/reset link instead of returning
  // a distinct "already confirmed" message: a distinct message would let this
  // endpoint be used to enumerate which emails have confirmed accounts.
  //
  // The auth schema is NOT exposed to PostgREST, so read the public.users
  // mirror for the id, then ask the GoTrue admin API for confirmation status.
  const admin = createServiceRoleClient();
  const existingRead = await toTypedFailure(
    admin
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle(),
    "an existing account for a resend request",
  );
  if (!existingRead.ok) return { error: COULD_NOT_COMPLETE };
  const existing = existingRead.data;

  const { data: authData } = existing
    ? await admin.auth.admin.getUserById(existing.id)
    : { data: { user: null } };

  if (authData?.user?.email_confirmed_at) {
    after(() => sendAccountExistsNoticeEmail({ to: email.toLowerCase() }));
    return { success: "Confirmation email sent. Check your inbox." };
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "https://nursedex.com"}/auth/callback`,
    },
  });

  if (error) {
    console.error("Resend confirmation error:", error.message);
    return { error: "Something went wrong. Please try again in a moment." };
  }

  return { success: "Confirmation email sent. Check your inbox." };
}

export async function selectRole(
  formData: FormData,
): Promise<AuthResult | void> {
  const role = formData.get("role") as string;

  if (role !== "nurse" && role !== "family") {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Update user role. Checked: unchecked, a failed write left the person with
  // no role at all while the redirect below sent them to a dashboard that
  // gates on having one, so they bounced straight back here (#847).
  const roleWrite = await toTypedFailure(
    supabase.from("users").update({ role }).eq("id", user.id),
    "the role chosen on the role select screen",
  );
  if (!roleWrite.ok) return { error: COULD_NOT_COMPLETE };

  // Create the corresponding profile
  if (role === "nurse") {
    // Generate a temporary slug
    const nameRead = await toTypedFailure(
      supabase
        .from("users")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single(),
      "the name to build a nurse's first slug from",
    );
    if (!nameRead.ok) return { error: COULD_NOT_COMPLETE };
    const userData = nameRead.data;

    const baseName =
      userData?.first_name && userData?.last_name
        ? `${userData.first_name}-${userData.last_name}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "")
        : user.id.slice(0, 8);

    // Checked: the role is already written by now, so an unchecked failure
    // here leaves a nurse with a role and no profile row, and every screen
    // that reads the profile then behaves as though they do not exist.
    const profileInsert = await supabase.from("nurse_profiles").insert({
      user_id: user.id,
      slug: `${baseName}-${Date.now().toString(36)}`,
      credential: "hha", // placeholder, updated during onboarding
      // The score an empty profile already earns, not the column default
      // of 0, so a nurse who stops here is not drift (#1063).
      profile_completeness: calculateCompleteness(
        NEW_PROFILE_COMPLETENESS_INPUT,
      ).score,
    });
    // A duplicate on user_id means an earlier press already created the
    // profile (the button offers a retry while the first is slow), so the
    // work is done and the person carries on rather than seeing a failure.
    if (
      !isUniqueViolationOn(profileInsert.error, "nurse_profiles_user_id_key")
    ) {
      const profileWrite = await toTypedFailure(
        profileInsert,
        "the nurse profile row for a new nurse",
      );
      if (!profileWrite.ok) return { error: COULD_NOT_COMPLETE };
    }
  } else {
    const profileInsert = await supabase.from("family_profiles").insert({
      user_id: user.id,
    });
    // Same repeat as the nurse branch above.
    if (
      !isUniqueViolationOn(profileInsert.error, "family_profiles_user_id_key")
    ) {
      const profileWrite = await toTypedFailure(
        profileInsert,
        "the family profile row for a new family",
      );
      if (!profileWrite.ok) return { error: COULD_NOT_COMPLETE };
    }
  }

  // Which of the two roles people pick is the single most useful fact the
  // funnel was missing: it says whether a visit was a nurse joining or a
  // family looking to hire, which nothing else in the product records.
  captureServerEventAfterResponse({
    distinctId: user.id,
    event: ANALYTICS_EVENTS.ROLE_SELECTED,
    properties: { role },
  });

  // Role just changed (null -> nurse/family), which flips layout gating and
  // the sidebar. Bust the client Router Cache so freshly-gated routes aren't
  // served from a stale (pre-role) cache after the redirect.
  revalidatePath("/", "layout");

  if (role === "family") {
    redirect("/onboarding/family");
  }
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
