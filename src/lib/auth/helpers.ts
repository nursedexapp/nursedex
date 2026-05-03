import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@/types/database";
import type { UserRole } from "@/types/enums";

/**
 * Get the current authenticated user with their profile data.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  return data as User | null;
}

/**
 * Require the user to be authenticated.
 * Redirects to /login if not authenticated.
 * Returns the user profile.
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.is_deleted || user.is_suspended) {
    const supabase = await createClient();
    await supabase.auth.signOut();
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
