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
  canSeeNurseIdentity,
  redactNurseIdentity,
  publicNurseMetaTitle,
  publicNurseMetaDescription,
} from "@/lib/profile/identity";
import {
  getFamilyReviewForNurse,
  getApprovedReviews,
} from "@/lib/reviews/queries";
import { getFamilyHireForNurse } from "@/lib/hires/queries";
import { NurseJsonLd } from "@/components/profile/NurseJsonLd";
import { CREDENTIAL_LABELS } from "@/types/enums";
import type { Credential } from "@/types/enums";
import type { Review, Hire } from "@/types/database";
import { CaptureOnMount } from "@/components/analytics/CaptureOnMount";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

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
    // A missing or hidden profile renders the not-found UI, but the route
    // streams behind nurses/loading.tsx, so the response is already a 200 and
    // notFound() can't change the status. noindex the soft-404 so search
    // engines drop it instead of indexing a "not found" page. See #323.
    return {
      title: "Nurse Not Found | NurseDex",
      robots: { index: false, follow: false },
    };
  }

  const credentialLabel =
    CREDENTIAL_LABELS[nurse.credential as Credential] || nurse.credential;
  // Public metadata is visible to anyone (including crawlers), so it never
  // includes the last name. Identity is gated behind a subscription.
  const title = publicNurseMetaTitle(nurse.first_name, credentialLabel);
  const description = publicNurseMetaDescription(
    nurse.first_name,
    credentialLabel,
    nurse.bio,
  );

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

  // Identity (last name + license number) is shown to admins, the nurse
  // themselves, and any family with an active subscription. A family in the
  // post-cancellation grace window keeps access to nurses they already
  // revealed, so an existing reveal also unlocks identity for that nurse.
  let hasSub = false;
  let hasReveal = false;

  if (user) {
    if (user.role === "family") {
      [hasSub, hasReveal] = await Promise.all([
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

  const canSeeIdentity = canSeeNurseIdentity(nurse.user_id, {
    role: user?.role,
    viewerId: user?.id,
    hasSubscription: hasSub,
    hasReveal,
  });
  // Capture whether a license number exists before redacting, so the License
  // Information section can still render a "subscribe to unlock" hint without
  // exposing the number itself.
  const { hasLicenseNumber } = redactNurseIdentity(nurse, canSeeIdentity);

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
      {/*
        Separate from trackProfileView above, and deliberately so: that
        increments a per-nurse daily counter the nurse sees on their own
        dashboard, this attributes the view to a visitor so it can sit in a
        funnel. Same word, two different questions (#867). No name or slug is
        sent, since $current_url already carries the slug on every pageview.
      */}
      <CaptureOnMount
        event={ANALYTICS_EVENTS.PROFILE_VIEWED}
        dedupeKey={nurse.user_id}
        properties={{
          nurse_user_id: nurse.user_id,
          credential: nurse.credential,
          can_see_identity: canSeeIdentity,
          view_mode: viewMode,
        }}
      />
      <NurseJsonLd
        firstName={nurse.first_name}
        lastName=""
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
          canSeeIdentity={canSeeIdentity}
          hasLicenseNumber={hasLicenseNumber}
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
