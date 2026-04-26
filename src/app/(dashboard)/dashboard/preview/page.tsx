import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";
import { getSignedPhotoUrl } from "@/lib/profile/photos";
import { NurseProfileFull } from "@/components/profile/NurseProfileFull";

export default async function PreviewPage() {
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

  // Get photo URL for first photo
  const photoUrl =
    profile.photos.length > 0
      ? await getSignedPhotoUrl(profile.photos[0])
      : null;

  // Get license verification URL
  const { data: licenseUrl } = await supabase
    .from("license_verification_urls")
    .select("url")
    .eq("credential", profile.credential)
    .eq("state", "NY")
    .single();

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Profile Preview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          See how your profile looks to families.
        </p>
      </div>
      <div className="max-w-2xl">
        <NurseProfileFull
          nurse={{
            first_name: user.first_name || "",
            last_name: user.last_name || "",
            credential: profile.credential,
            license_number: profile.license_number,
            bio: profile.bio,
            care_types: profile.care_types,
            primary_care_type: profile.primary_care_type,
            skills: profile.skills,
            gender: profile.gender,
            years_experience: profile.years_experience,
            languages: profile.languages,
            availability_commitment: profile.availability_commitment,
            time_slots: profile.time_slots,
            rate_min: profile.rate_min,
            rate_max: profile.rate_max,
            has_transportation: profile.has_transportation,
            care_philosophy: profile.care_philosophy,
            additional_certs: profile.additional_certs,
            avg_rating: profile.avg_rating,
            review_count: profile.review_count,
            is_available: profile.is_available,
            tier: profile.tier,
          }}
          photoUrl={photoUrl}
          licenseVerifyUrl={licenseUrl?.url}
          isPreview
        />
      </div>
    </div>
  );
}
