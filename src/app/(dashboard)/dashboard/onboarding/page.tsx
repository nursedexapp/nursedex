import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";
import { getSignedPhotoUrls } from "@/lib/profile/photos";
import { getOnboardingStatus } from "@/lib/profile/onboarding-status";
import { OnboardingWizard } from "./OnboardingWizard";

import { unwrapOrThrow } from "@/lib/db/results";
export default async function OnboardingPage() {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  // Fetch nurse profile
  const profile = await unwrapOrThrow(
    supabase.from("nurse_profiles").select("*").eq("user_id", user.id).single(),
    "nurse_profiles (OnboardingPage)",
  );

  if (!profile) {
    // No profile yet (shouldn't happen, role-select creates it)
    redirect("/role-select");
  }

  // If onboarding is fully complete, send the user to the dashboard. Use
  // the shared getOnboardingStatus so this page agrees with the
  // dashboard's redirect rule. Earlier this page used a narrower check
  // (just years_experience + non-HHA credential + license), which fired
  // true after Step 2, and the dashboard then redirected back here,
  // causing an infinite loop with /dashboard/onboarding?step=3.
  const onboardingStatus = getOnboardingStatus(profile, user);
  if (onboardingStatus.complete) {
    redirect("/dashboard");
  }

  // Fetch signed URLs for any existing photos
  const photoUrls =
    profile.photos.length > 0 ? await getSignedPhotoUrls(profile.photos) : [];

  return (
    <div className="bg-warm-white min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-2xl animate-pulse space-y-6">
            <div className="bg-sage/20 h-8 w-48 rounded" />
            <div className="bg-sage/20 h-4 w-72 rounded" />
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
