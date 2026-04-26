import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { FamilyOnboardingForm } from "@/components/onboarding/FamilyOnboardingForm";
import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";

export const metadata: Metadata = {
  title: "Welcome to NurseDex",
};

export default async function FamilyOnboardingPage() {
  const user = await requireRole(UserRole.FAMILY);

  // If already onboarded, skip to dashboard.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("family_profiles")
    .select("zip_code")
    .eq("user_id", user.id)
    .single();
  if (profile?.zip_code) {
    redirect("/dashboard");
  }

  return (
    <div className="bg-warm-white flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10 sm:px-6">
        <div className="mb-6 space-y-2">
          <p className="text-soft-black-light text-xs font-medium tracking-wide uppercase">
            One quick step
          </p>
          <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
            A few details to personalize your matches
          </h1>
          <p className="text-soft-black-light text-sm">
            We use this to show nurses near you and to make it easy for them to
            reach you.
          </p>
        </div>
        <FamilyOnboardingForm
          defaultEmail={user.email}
          defaultZip={user.zip_code ?? ""}
          defaultPhone={user.phone ?? ""}
          defaultCommPref={user.communication_preference ?? null}
        />
      </main>
      <Footer />
    </div>
  );
}
