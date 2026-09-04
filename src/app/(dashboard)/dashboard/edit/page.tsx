import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";
import { getSignedPhotoUrls } from "@/lib/profile/photos";
import {
  getOnboardingStatus,
  onboardingRedirectPath,
} from "@/lib/profile/onboarding-status";
import { ProfileEditForm } from "./ProfileEditForm";

import { unwrapOrThrow } from "@/lib/db/results";
export default async function EditProfilePage() {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  const profile = await unwrapOrThrow(
    supabase.from("nurse_profiles").select("*").eq("user_id", user.id).single(),
    "nurse_profiles (EditProfilePage)",
  );

  if (!profile) {
    redirect("/dashboard");
  }

  // If onboarding isn't complete, send the user back to the wizard at the
  // exact step they're on. Use the shared helper so this page agrees with
  // /dashboard and /dashboard/onboarding about what counts as complete;
  // the previous narrow check (years_experience + non-HHA license) let
  // partially-onboarded nurses through to a half-rendered edit form.
  const onboardingStatus = getOnboardingStatus(profile, user);
  if (!onboardingStatus.complete) {
    redirect(onboardingRedirectPath(onboardingStatus));
  }

  const photoUrls =
    profile.photos.length > 0 ? await getSignedPhotoUrls(profile.photos) : [];

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Edit Profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Update your profile information. Changes to your name or credential
          will require re-verification.
        </p>
      </div>
      <div className="max-w-2xl">
        <ProfileEditForm
          profile={profile}
          userName={{
            first_name: user.first_name || "",
            last_name: user.last_name || "",
          }}
          userEmail={user.email}
          userPhone={user.phone || ""}
          userZip={user.zip_code || ""}
          userCommPref={user.communication_preference || ""}
          photoUrls={photoUrls}
        />
      </div>
    </div>
  );
}
