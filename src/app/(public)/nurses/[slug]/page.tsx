import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { NurseProfilePublic } from "@/components/profile/NurseProfilePublic";
import { getCurrentUser } from "@/lib/auth/helpers";
import {
  getNurseBySlug,
  getNurseBySlugUnfiltered,
  getNurseContactInfo,
  getSlugRedirect,
  getPublicPhotoUrls,
  getLicenseVerifyUrl,
  getDistanceBetweenZips,
} from "@/lib/profile/queries";
import { createClient } from "@/lib/supabase/server";
import { hasActiveFamilyAccess } from "@/lib/subscriptions/queries";
import { hasRevealedNurse } from "@/lib/reveals/actions";
import {
  getFamilyReviewForNurse,
  getApprovedReviews,
} from "@/lib/reviews/queries";
import { getFamilyHireForNurse } from "@/lib/hires/queries";
import { NurseJsonLd } from "@/components/profile/NurseJsonLd";
import { CREDENTIAL_LABELS } from "@/types/enums";
import type { Credential } from "@/types/enums";
import type { Review, Hire } from "@/types/database";

interface NurseProfilePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: NurseProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  // Mirror the page's fallback so an admin or the nurse themselves
  // doesn't see "Nurse Not Found" in the browser tab while previewing
  // a pending profile.
  let nurse = await getNurseBySlug(slug);
  if (!nurse) {
    const user = await getCurrentUser();
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    if (isAdmin) {
      nurse = await getNurseBySlugUnfiltered(slug);
    } else if (user) {
      const candidate = await getNurseBySlugUnfiltered(slug);
      if (candidate && candidate.user_id === user.id) {
        nurse = candidate;
      }
    }
  }

  if (!nurse) {
    return { title: "Nurse Not Found | NurseDex" };
  }

  const credentialLabel =
    CREDENTIAL_LABELS[nurse.credential as Credential] || nurse.credential;
  const title = `${nurse.first_name} ${nurse.last_name}, ${credentialLabel} | NurseDex`;
  const description = nurse.bio
    ? nurse.bio.slice(0, 160)
    : `${nurse.first_name} ${nurse.last_name} is a ${credentialLabel} on NurseDex, New York's trusted nurse directory.`;

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

  // Fetch nurse data. The public RPC filters to verified profiles, so a
  // pending nurse can't see their own preview and an admin can't review
  // a pending profile. If the verified-only path returns nothing, retry
  // unfiltered when the caller is an admin or the nurse themselves.
  const user = await getCurrentUser();
  let nurse = await getNurseBySlug(slug);
  if (!nurse) {
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    if (isAdmin) {
      nurse = await getNurseBySlugUnfiltered(slug);
    } else if (user) {
      // Could be the nurse themselves looking at their own pending profile.
      const candidate = await getNurseBySlugUnfiltered(slug);
      if (candidate && candidate.user_id === user.id) {
        nurse = candidate;
      }
    }
  }
  if (!nurse) {
    notFound();
  }

  // Determine view mode based on auth state
  let viewMode: "anon" | "free" | "subscribed" = "anon";
  let revealMode: "anon" | "no_sub" | "subscribed" | null = null;
  let distanceMiles: number | null = null;
  let viewerReview: Review | null = null;
  let viewerHire: Hire | null = null;

  if (user) {
    if (user.role === "family") {
      const [hasSub, hasReveal] = await Promise.all([
        hasActiveFamilyAccess(user.id),
        hasRevealedNurse(nurse.user_id),
      ]);

      if (hasReveal) {
        viewMode = "subscribed"; // contact info will be server-rendered
        revealMode = null;
        [viewerReview, viewerHire] = await Promise.all([
          getFamilyReviewForNurse(user.id, nurse.user_id),
          getFamilyHireForNurse(user.id, nurse.user_id),
        ]);
      } else if (hasSub) {
        viewMode = "free";
        revealMode = "subscribed"; // can fire reveal action
      } else {
        viewMode = "free";
        revealMode = "no_sub"; // needs to subscribe
      }

      // Calculate distance if family has a zip code
      if (user.zip_code && nurse.zip_code) {
        distanceMiles = await getDistanceBetweenZips(
          user.zip_code,
          nurse.zip_code,
        );
      }
    } else {
      // Nurses, admins viewing profiles get the full view (minus contact).
      viewMode = "free";
      revealMode = null;
    }
  } else {
    revealMode = "anon";
  }

  // Fetch photo URLs, license verify URL, and approved reviews in parallel
  const [photoUrls, licenseVerifyUrl, approvedReviews] = await Promise.all([
    getPublicPhotoUrls(nurse.photos),
    getLicenseVerifyUrl(nurse.credential),
    getApprovedReviews(nurse.user_id),
  ]);

  // Contact info is gated server-side by a SECURITY DEFINER RPC.
  // Only fetch when the page will actually render it: revealed
  // family viewers, the nurse themselves, or admins.
  if (viewMode === "subscribed") {
    const contact = await getNurseContactInfo(nurse.user_id);
    nurse.contact_email = contact.email;
    nurse.contact_phone = contact.phone;
    nurse.communication_preference = contact.communication_preference;
  }

  // Track profile view (fire and forget, don't block rendering)
  trackProfileView(nurse.user_id);

  const credentialLabel =
    CREDENTIAL_LABELS[nurse.credential as Credential] || nurse.credential;

  return (
    <div className="flex flex-1 flex-col">
      <NurseJsonLd
        firstName={nurse.first_name}
        lastName={nurse.last_name}
        credentialLabel={credentialLabel}
        slug={nurse.slug}
        bio={nurse.bio}
        photoUrl={photoUrls[0] ?? null}
        avgRating={nurse.avg_rating}
        reviewCount={nurse.review_count}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <NurseProfilePublic
          nurse={nurse}
          photoUrl={photoUrls[0] ?? null}
          licenseVerifyUrl={licenseVerifyUrl}
          distanceMiles={distanceMiles}
          viewMode={viewMode}
          revealMode={revealMode}
          viewerReview={viewerReview}
          viewerFirstName={user?.first_name ?? ""}
          viewerHire={viewerHire}
          approvedReviews={approvedReviews}
        />
      </main>
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
