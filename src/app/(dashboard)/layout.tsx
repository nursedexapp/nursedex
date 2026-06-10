import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { PastDueBanner } from "@/components/dashboard/PastDueBanner";
import { AppFooter } from "@/components/shared/AppFooter";
import { PostHogIdentify } from "@/components/PostHogIdentify";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const role = user?.role ?? null;

  // Surface payment failure across the dashboard. The webhook flips
  // subscriptions.status to past_due on invoice.payment_failed; we read it
  // here and render a banner above content until the user updates payment.
  let pastDueBanner: React.ReactNode = null;

  if (user) {
    const supabase = await createClient();

    // Two independent reads, so run them together rather than blocking on
    // one before starting the other:
    //  - Family-onboarding gate: a family user with no zip on family_profiles
    //    hasn't onboarded yet, send them there before any dashboard surface.
    //  - Past-due banner: surface a failed payment until they update it.
    const profileQuery =
      role === "family"
        ? supabase
            .from("family_profiles")
            .select("zip_code")
            .eq("user_id", user.id)
            .single()
        : null;
    const pastDueQuery = supabase
      .from("subscriptions")
      .select("plan_type")
      .eq("user_id", user.id)
      .eq("status", "past_due")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const [profileResult, pastDueResult] = await Promise.all([
      profileQuery,
      pastDueQuery,
    ]);

    if (role === "family" && !profileResult?.data?.zip_code) {
      redirect("/onboarding/family");
    }

    if (pastDueResult.data) {
      pastDueBanner = (
        <PastDueBanner
          planType={
            pastDueResult.data.plan_type as "nurse_featured" | "family_access"
          }
        />
      );
    }
  }

  return (
    <div className="bg-warm-white flex min-h-screen flex-col">
      {user && <PostHogIdentify userId={user.id} email={user.email} />}
      {pastDueBanner}
      <div className="flex flex-1">
        <DashboardSidebar role={role} />
        <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      </div>
      {/* mb clears the fixed mobile bottom nav so the footer stays visible */}
      <AppFooter className="mb-16 lg:mb-0" />
    </div>
  );
}
