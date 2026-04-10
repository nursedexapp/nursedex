import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";
import { getSignedPhotoUrls } from "@/lib/profile/photos";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage() {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  // Fetch nurse profile
  const { data: profile } = await supabase
    .from("nurse_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    // No profile yet (shouldn't happen, role-select creates it)
    redirect("/role-select");
  }

  // If onboarding is already complete (years_experience is set during step 1),
  // and the profile has moved past the placeholder credential, redirect to dashboard
  const onboardingComplete =
    profile.years_experience !== null && profile.credential !== "hha";

  // Allow re-entry if credential is still placeholder even if years_experience is set
  // (edge case: user completed step 1 but not step 2)
  if (onboardingComplete && profile.license_number !== null) {
    redirect("/dashboard");
  }

  // Fetch signed URLs for any existing photos
  const photoUrls = profile.photos.length > 0
    ? await getSignedPhotoUrls(profile.photos)
    : [];

  return (
    <div className="min-h-screen bg-warm-white px-4 py-8 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-2xl animate-pulse space-y-6">
            <div className="h-8 w-48 rounded bg-sage/20" />
            <div className="h-4 w-72 rounded bg-sage/20" />
          </div>
        }
      >
        <OnboardingWizard
          profile={profile}
          userName={{
            first_name: user.first_name,
            last_name: user.last_name,
          }}
          userEmail={user.email}
          initialPhotoUrls={photoUrls}
        />
      </Suspense>
    </div>
  );
}
