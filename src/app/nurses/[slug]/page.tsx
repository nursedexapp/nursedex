import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { NurseProfilePublic } from "@/components/profile/NurseProfilePublic";
import { getCurrentUser } from "@/lib/auth/helpers";
import {
  getNurseBySlug,
  getSlugRedirect,
  getPublicPhotoUrls,
  getLicenseVerifyUrl,
  getDistanceBetweenZips,
} from "@/lib/profile/queries";
import { createClient } from "@/lib/supabase/server";
import { CREDENTIAL_LABELS } from "@/types/enums";
import type { Credential } from "@/types/enums";

interface NurseProfilePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: NurseProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const nurse = await getNurseBySlug(slug);

  if (!nurse) {
    return { title: "Nurse Not Found | NurseDex" };
  }

  const credentialLabel =
    CREDENTIAL_LABELS[nurse.credential as Credential] || nurse.credential;
  const title = `${nurse.first_name} ${nurse.last_name}, ${credentialLabel} | NurseDex`;
  const description = nurse.bio
    ? nurse.bio.slice(0, 160)
    : `${nurse.first_name} ${nurse.last_name} is a ${credentialLabel} on NurseDex, Long Island's trusted nurse directory.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `https://nursedex.com/nurses/${nurse.slug}`,
    },
  };
}

export default async function NurseProfilePage({
  params,
}: NurseProfilePageProps) {
  const { slug } = await params;

  // Check for slug redirects first
  const redirectSlug = await getSlugRedirect(slug);
  if (redirectSlug) {
    redirect(`/nurses/${redirectSlug}`);
  }

  // Fetch nurse data
  const nurse = await getNurseBySlug(slug);
  if (!nurse) {
    notFound();
  }

  // Determine view mode based on auth state
  const user = await getCurrentUser();
  let viewMode: "anon" | "free" | "subscribed" = "anon";
  let distanceMiles: number | null = null;

  if (user) {
    if (user.role === "family") {
      // Check if family has an active subscription and has revealed this nurse
      const supabase = await createClient();
      const { data: reveal } = await supabase
        .from("reveals")
        .select("id")
        .eq("family_user_id", user.id)
        .eq("nurse_user_id", nurse.user_id)
        .single();

      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .eq("plan_type", "family_access")
        .eq("status", "active")
        .single();

      viewMode = reveal && subscription ? "subscribed" : "free";

      // Calculate distance if family has a zip code
      if (user.zip_code && nurse.zip_code) {
        distanceMiles = await getDistanceBetweenZips(
          user.zip_code,
          nurse.zip_code,
        );
      }
    } else {
      // Nurses, admins viewing profiles get the full view (minus contact)
      viewMode = "free";
    }
  }

  // Fetch photo URLs and license verify URL in parallel
  const [photoUrls, licenseVerifyUrl] = await Promise.all([
    getPublicPhotoUrls(nurse.photos),
    getLicenseVerifyUrl(nurse.credential),
  ]);

  // Track profile view (fire and forget, don't block rendering)
  trackProfileView(nurse.user_id);

  return (
    <div className="flex min-h-screen flex-col bg-warm-white">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <NurseProfilePublic
          nurse={nurse}
          photoUrl={photoUrls[0] ?? null}
          licenseVerifyUrl={licenseVerifyUrl}
          distanceMiles={distanceMiles}
          viewMode={viewMode}
        />
      </main>
      <Footer />
    </div>
  );
}

/**
 * Fire-and-forget profile view tracking.
 * Uses the DB function to increment the daily counter.
 */
async function trackProfileView(nurseUserId: string) {
  try {
    const supabase = await createClient();
    await supabase.rpc("increment_nurse_analytics", {
      p_nurse_user_id: nurseUserId,
      p_field: "profile_views",
    });
  } catch {
    // Silently fail - analytics should never break the page
  }
}
