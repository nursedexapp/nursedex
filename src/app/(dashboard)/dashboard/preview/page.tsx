import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";
import { getSignedPhotoUrl } from "@/lib/profile/photos";
import { getOnboardingStatus } from "@/lib/profile/onboarding-status";
import { getNurseBySlugUnfiltered } from "@/lib/profile/queries";
import { buildPreviewViews } from "@/lib/profile/preview";
import { PreviewViews } from "./PreviewViews";

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

  // Preview only makes sense once the profile is complete. If the user
  // gets here mid-wizard (e.g., via the sidebar nav), send them back to
  // the right step instead of rendering a half-empty preview.
  const onboardingStatus = getOnboardingStatus(profile, user);
  if (!onboardingStatus.complete) {
    redirect(`/dashboard/onboarding?step=${onboardingStatus.nextStep}`);
  }

  // The same record the public page reads, through the same query, rather than
  // a hand-assembled object (#447). The unfiltered variant exists for exactly
  // this caller: a nurse looking at her own profile before it is verified.
  // Requesting it is gated by requireRole plus the user_id match above.
  const nurse = await getNurseBySlugUnfiltered(profile.slug);
  if (!nurse) {
    redirect("/dashboard");
  }

  const { visitor, subscribed, hasLicenseNumber } = buildPreviewViews(
    nurse,
    user,
  );

  const photoUrl =
    profile.photos.length > 0
      ? await getSignedPhotoUrl(profile.photos[0])
      : null;

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
          Your profile exactly as families see it. Most people arrive without a
          subscription, so that is the view shown first.
        </p>
      </div>
      <div className="max-w-5xl">
        <PreviewViews
          visitor={visitor}
          subscribed={subscribed}
          photoUrl={photoUrl}
          licenseVerifyUrl={licenseUrl?.url ?? null}
          hasLicenseNumber={hasLicenseNumber}
        />
      </div>
    </div>
  );
}
