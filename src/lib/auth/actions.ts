"use server";

import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendAccountExistsNoticeEmail } from "@/lib/email/send";
import { PASSWORD, PASSWORD_RECOVERY } from "@/lib/constants";

export type AuthResult = {
  error?: string;
  success?: string;
};

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
  const { data: blocked } = await service
    .from("blocked_emails")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (blocked) {
    return { error: "This email address cannot be used to create an account." };
  }

  // When a confirmed account already exists for this email, Supabase silently
  // obfuscates the signUp response (no error, an empty-identities fake user, no
  // email sent) to prevent enumeration. That left real owners stranded on the
  // "check your email" page forever. Detect the duplicate authoritatively
  // against auth.users, then email the owner a login/reset link instead of
  // revealing account existence on screen. The on-screen result below stays
  // byte-for-byte identical to the new-user path, so nothing leaks.
  const { data: existing } = await service
    .schema("auth")
    .from("users")
    .select("id, email_confirmed_at")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (existing?.email_confirmed_at) {
    after(async () => {
      const { data: profile } = await service
        .from("users")
        .select("first_name")
        .eq("id", existing.id)
        .maybeSingle();
      await sendAccountExistsNoticeEmail({
        to: email.toLowerCase(),
        firstName: profile?.first_name ?? undefined,
      }).catch((err) =>
        console.error("[email] Account exists notice error:", err),
      );
    });
    return { success: "Check your email for a confirmation link." };
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
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

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

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "https://nursedex.com"}/auth/callback`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    return;
  }

  if (data.url) {
    redirect(data.url);
  }
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
  // gets a new email. Check the auth.users row first. If the account is already
  // confirmed, email the owner a login/reset link instead of returning a
  // distinct "already confirmed" message: a distinct message would let this
  // endpoint be used to enumerate which emails have confirmed accounts.
  const admin = createServiceRoleClient();
  const { data: authUser } = await admin
    .schema("auth")
    .from("users")
    .select("email_confirmed_at")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (authUser?.email_confirmed_at) {
    after(() =>
      sendAccountExistsNoticeEmail({ to: email.toLowerCase() }).catch((err) =>
        console.error("[email] Account exists notice error:", err),
      ),
    );
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

export async function selectRole(formData: FormData): Promise<void> {
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

  // Update user role
  await supabase.from("users").update({ role }).eq("id", user.id);

  // Create the corresponding profile
  if (role === "nurse") {
    // Generate a temporary slug
    const { data: userData } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    const baseName =
      userData?.first_name && userData?.last_name
        ? `${userData.first_name}-${userData.last_name}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "")
        : user.id.slice(0, 8);

    await supabase.from("nurse_profiles").insert({
      user_id: user.id,
      slug: `${baseName}-${Date.now().toString(36)}`,
      credential: "hha", // placeholder, updated during onboarding
    });
  } else {
    await supabase.from("family_profiles").insert({
      user_id: user.id,
    });
  }

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
