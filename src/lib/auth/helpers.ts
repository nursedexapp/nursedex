import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toTypedFailure } from "@/lib/db/results";
import type { User } from "@/types/database";
import type { UserRole } from "@/types/enums";

/**
 * Get the current authenticated user with their profile data.
 * Returns null if not authenticated.
 *
 * Wrapped in React cache() so repeated calls within a single request (the
 * dashboard layout and the page it renders both need the user) reuse one
 * auth + users round trip instead of refetching.
 */
export const getCurrentUser = cache(
  async function getCurrentUser(): Promise<User | null> {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) return null;

    // The OUTCOME stays null on a failure, deliberately, and that is not the
    // usual #847 fix. Every guard in the product reads this, so null means
    // "treated as logged out", which is the direction a protective control has
    // to fail. Throwing would take down every page at once, and answering with
    // a user we could not read would admit somebody who may be suspended.
    //
    // What was wrong was the SILENCE. A database problem looked exactly like
    // everybody signing out at once, on the one read where that matters most,
    // with nothing anywhere saying so. toTypedFailure logs it and files it to
    // Sentry; the null is unchanged.
    const read = await toTypedFailure(
      supabase.from("users").select("*").eq("id", authUser.id).single(),
      "the signed in user's own row",
    );

    const user = (read.ok ? read.data : null) as User | null;

    // Treat suspended or removed users as logged out everywhere, not just on
    // requireAuth-gated routes. Their Supabase session may still be valid (and
    // the auth-level ban is best-effort), so this app-layer check is what
    // actually blocks them from public pages too.
    if (user && (user.is_suspended || user.is_deleted)) return null;

    return user;
  },
);

/**
 * Require the user to be authenticated.
 * Redirects to /login if not authenticated.
 * Returns the user profile.
 */
export async function requireAuth(): Promise<User> {
  // getCurrentUser already returns null for suspended/deleted users, so this
  // also bounces them to /login.
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * Require the user to have a specific role.
 * Redirects to /login if not authenticated, or / if wrong role.
 */
export async function requireRole(...roles: UserRole[]): Promise<User> {
  const user = await requireAuth();

  if (!user.role || !roles.includes(user.role as UserRole)) {
    redirect("/");
  }

  return user;
}

/**
 * Require admin or super_admin. Used by /admin routes. Redirects to /
 * (not /login) when authed but not an admin so we don't loop a curious
 * logged-in user back to login.
 */
export async function requireAdmin(): Promise<User> {
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "super_admin") {
    redirect("/");
  }
  return user;
}

export async function requireSuperAdmin(): Promise<User> {
  const user = await requireAuth();
  if (user.role !== "super_admin") {
    redirect("/admin");
  }
  return user;
}
