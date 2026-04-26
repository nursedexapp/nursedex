import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";
import { getSignedPhotoUrls } from "@/lib/profile/photos";
import { ProfileEditForm } from "./ProfileEditForm";

export default async function EditProfilePage() {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("nurse_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    redirect("/dashboard");
  }

  // If onboarding isn't complete, redirect to onboarding
  const needsOnboarding =
    profile.years_experience === null ||
    (profile.credential === "hha" && profile.license_number === null);

  if (needsOnboarding) {
    redirect("/dashboard/onboarding");
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
