import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
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
  // hasn't gone through onboarding yet — send them there before showing
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

  return (
    <div className="bg-warm-white flex min-h-screen">
      <DashboardSidebar role={role} />
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>
    </div>
  );
}
