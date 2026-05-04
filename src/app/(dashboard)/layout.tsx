import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { PastDueBanner } from "@/components/dashboard/PastDueBanner";
import { getCurrentUser } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const role = user?.role ?? null;

  // Family-onboarding gate: a family user with no zip on family_profiles
  // hasn't gone through onboarding yet, send them there before showing
  // any dashboard surface.
  if (user && role === "family") {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("family_profiles")
      .select("zip_code")
      .eq("user_id", user.id)
      .single();
    if (!profile?.zip_code) {
      redirect("/onboarding/family");
    }
  }

  // Surface payment failure across the dashboard. The webhook flips
  // subscriptions.status to past_due on invoice.payment_failed; we read it
  // here and render a banner above content until the user updates payment.
  let pastDueBanner: React.ReactNode = null;
  if (user) {
    const supabase = await createClient();
    const { data: pastDue } = await supabase
      .from("subscriptions")
      .select("plan_type")
      .eq("user_id", user.id)
      .eq("status", "past_due")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pastDue) {
      pastDueBanner = (
        <PastDueBanner
          planType={pastDue.plan_type as "nurse_featured" | "family_access"}
        />
      );
    }
  }

  return (
    <div className="bg-warm-white flex min-h-screen flex-col">
      {pastDueBanner}
      <div className="flex flex-1">
        <DashboardSidebar role={role} />
        <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      </div>
    </div>
  );
}
