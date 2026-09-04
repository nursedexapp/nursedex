import { requireAuth } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";
import { calculateCompleteness } from "@/lib/profile/completeness";
import { isListed } from "@/lib/nurses/listing";
import {
  getOnboardingStatus,
  onboardingRedirectPath,
} from "@/lib/profile/onboarding-status";
import { redirect } from "next/navigation";
import { NurseDashboardHero } from "@/components/dashboard/NurseDashboardHero";
import { FamilyDashboardHero } from "@/components/dashboard/FamilyDashboardHero";
import { Greeting } from "@/components/dashboard/Greeting";
import { CompletenessCard } from "@/components/dashboard/CompletenessCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { FeaturedUpsell } from "@/components/dashboard/FeaturedUpsell";
import { ManageSubscriptionCard } from "@/components/dashboard/ManageSubscriptionCard";
import { ReviewLinkCard } from "@/components/dashboard/ReviewLinkCard";
import { NurseClaimHireCard } from "@/components/hires/NurseClaimHireCard";
import { UpgradeCelebration } from "@/components/dashboard/UpgradeCelebration";
import { Suspense } from "react";
import { getActiveSubscription } from "@/lib/subscriptions/queries";
import { getRevealedNurses } from "@/lib/reveals/queries";
import { NurseCard } from "@/components/nurses/NurseCard";
import { searchNurses } from "@/lib/nurses/search";
import { parseSearchParams } from "@/lib/nurses/search-params";
import Link from "next/link";

import { unwrapOrThrow } from "@/lib/db/results";
export default async function DashboardPage() {
  const user = await requireAuth();

  // Admins live in the /admin route group. If they land here directly
  // (after sign-in, after clicking a logo link, etc.) send them along
  // instead of rendering the family/nurse dashboard, which doesn't
  // apply to them.
  if (user.role === "admin" || user.role === "super_admin") {
    redirect("/admin");
  }

  const supabase = await createClient();

  const isNurse = user.role === UserRole.NURSE;

  // Family dashboard
  if (!isNurse) {
    const [familyProfile, recentReveals, featured, familySub] =
      await Promise.all([
        // Wrapped inside the Promise.all: an element of one has no
        // destructuring for any rule to inspect (#847, #991). A failed read
        // here answered "this family has not done the survey", so the
        // dashboard kept asking somebody who had.
        unwrapOrThrow(
          supabase
            .from("family_profiles")
            .select("survey_completed")
            .eq("user_id", user.id)
            .single(),
          "whether this family has completed the survey",
        ),
        getRevealedNurses(user.id, 3),
        searchNurses({
          filters: parseSearchParams(new URLSearchParams()),
          viewerZip: user.zip_code ?? null,
          viewerCommPref: user.communication_preference ?? null,
          // Behind requireAuth, so the viewer is signed in by construction and
          // sees bio, rate and availability (#773).
          viewerIsSignedIn: true,
        }),
        getActiveSubscription(user.id, "family_access"),
      ]);
    const hasTakenSurvey = familyProfile?.survey_completed === true;
    // Featured nurses to fill the dashboard for families who haven't
    // revealed anyone yet, so the page isn't a near-empty survey prompt.
    const featuredNurses = featured.items
      .filter((n) => n.tier === "featured")
      .slice(0, 3);

    return (
      <div className="p-6 sm:p-8">
        <Greeting firstName={user.first_name || "there"} />

        <div className="mx-auto mt-6 max-w-3xl space-y-6">
          <FamilyDashboardHero
            hasTakenSurvey={hasTakenSurvey}
            recentRevealsCount={recentReveals.length}
          />

          {familySub && (
            <ManageSubscriptionCard
              planLabel="Family Access"
              title="Subscription"
              returnTo="/dashboard"
              renewsOn={familySub.current_period_end}
              cancelAtPeriodEnd={familySub.cancel_at_period_end}
              isPastDue={familySub.status === "past_due"}
            />
          )}

          {recentReveals.length > 0 && (
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="font-heading text-soft-black text-lg font-medium">
                  Recent reveals
                </h2>
                <Link
                  href="/dashboard/revealed"
                  className="text-soft-black-light hover:text-teal text-sm underline-offset-4 hover:underline"
                >
                  View all
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recentReveals.map((nurse) => (
                  <NurseCard key={nurse.user_id} nurse={nurse} showLastName />
                ))}
              </div>
            </section>
          )}

          {recentReveals.length === 0 && featuredNurses.length > 0 && (
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="font-heading text-soft-black text-lg font-medium">
                  Featured nurses
                </h2>
                <Link
                  href="/nurses"
                  className="text-soft-black-light hover:text-teal text-sm underline-offset-4 hover:underline"
                >
                  Browse all
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featuredNurses.map((nurse) => (
                  <NurseCard
                    key={nurse.user_id}
                    nurse={nurse}
                    showLastName={familySub !== null}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  // Nurse dashboard
  const profile = await unwrapOrThrow(
    supabase.from("nurse_profiles").select("*").eq("user_id", user.id).single(),
    "nurse_profiles (DashboardPage)",
  );

  if (!profile) {
    return (
      <div className="p-6 sm:p-8">
        <p className="text-muted-foreground text-sm">
          We couldn&apos;t load your profile. Try signing out and back in, or
          reach out to{" "}
          <a
            href="mailto:support@nursedex.com"
            className="text-teal hover:underline"
          >
            support@nursedex.com
          </a>{" "}
          if this keeps happening.
        </p>
      </div>
    );
  }

  // Onboarding gate. If the nurse hasn't finished the wizard, send them
  // back to the exact step they left off at instead of letting them sit
  // on a "We're reviewing your license" hero on the dashboard. The
  // wizard reads ?step= and the saveOnboardingStep action persists each
  // step's fields to the DB, so we can derive resume state from there.
  const onboardingStatus = getOnboardingStatus(profile, user);
  if (!onboardingStatus.complete) {
    redirect(onboardingRedirectPath(onboardingStatus));
  }

  const { score, missing } = calculateCompleteness(profile);

  const featuredSub =
    profile.tier === "featured"
      ? await getActiveSubscription(user.id, "nurse_featured")
      : null;

  const isVerified = profile.verification_status === "verified";

  return (
    <div className="p-6 sm:p-8">
      <Suspense fallback={null}>
        <UpgradeCelebration />
      </Suspense>
      <Greeting firstName={user.first_name || "there"} />

      <div className="mx-auto mt-6 max-w-3xl space-y-6">
        <NurseDashboardHero
          status={profile.verification_status}
          rejectedReason={profile.verification_rejected_reason}
          slug={profile.slug}
          score={score}
          listed={isListed(profile)}
        />

        {/* Secondary lane: only renders meaningful content for verified
            nurses. Pending and rejected states get just the hero so the
            user's attention isn't fragmented. */}
        {isVerified && (
          <>
            {score < 100 && (
              <CompletenessCard score={score} missing={missing} />
            )}
            <QuickActions isAvailable={profile.is_available} />
            <ReviewLinkCard slug={profile.slug} />
            <NurseClaimHireCard slug={profile.slug} />
            {profile.tier === "free" && <FeaturedUpsell isVerified={true} />}
            {profile.tier === "featured" && featuredSub && (
              <ManageSubscriptionCard
                planLabel="Featured"
                featured
                returnTo="/dashboard"
                renewsOn={featuredSub.current_period_end}
                cancelAtPeriodEnd={featuredSub.cancel_at_period_end}
                isPastDue={featuredSub.status === "past_due"}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
