import { requireAuth } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";
import { calculateCompleteness } from "@/lib/profile/completeness";
import { getOnboardingStatus } from "@/lib/profile/onboarding-status";
import { redirect } from "next/navigation";
import { NurseDashboardHero } from "@/components/dashboard/NurseDashboardHero";
import { FamilyDashboardHero } from "@/components/dashboard/FamilyDashboardHero";
import { Greeting } from "@/components/dashboard/Greeting";
import { CompletenessCard } from "@/components/dashboard/CompletenessCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { FeaturedUpsell } from "@/components/dashboard/FeaturedUpsell";
import { ManageFeatured } from "@/components/dashboard/ManageFeatured";
import { ReviewLinkCard } from "@/components/dashboard/ReviewLinkCard";
import { NurseClaimHireCard } from "@/components/hires/NurseClaimHireCard";
import { getActiveSubscription } from "@/lib/subscriptions/queries";
import { getRevealedNurses } from "@/lib/reveals/queries";
import { getOrCreateReviewLink } from "@/lib/reviews/external-actions";
import { NurseCard } from "@/components/nurses/NurseCard";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const isNurse = user.role === UserRole.NURSE;

  // Family dashboard
  if (!isNurse) {
    const [{ data: familyProfile }, recentReveals] = await Promise.all([
      supabase
        .from("family_profiles")
        .select("survey_completed")
        .eq("user_id", user.id)
        .single(),
      getRevealedNurses(user.id, 3),
    ]);
    const hasTakenSurvey = familyProfile?.survey_completed === true;

    return (
      <div className="p-6 sm:p-8">
        <Greeting firstName={user.first_name || user.email} />

        <div className="mx-auto mt-6 max-w-3xl space-y-6">
          <FamilyDashboardHero
            hasTakenSurvey={hasTakenSurvey}
            recentRevealsCount={recentReveals.length}
          />

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
                  <NurseCard key={nurse.user_id} nurse={nurse} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  // Nurse dashboard
  const { data: profile } = await supabase
    .from("nurse_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

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
    redirect(`/dashboard/onboarding?step=${onboardingStatus.nextStep}`);
  }

  const { score, missing } = calculateCompleteness(profile);

  const featuredSub =
    profile.tier === "featured"
      ? await getActiveSubscription(user.id, "nurse_featured")
      : null;

  const reviewLink =
    profile.verification_status === "verified"
      ? (await getOrCreateReviewLink()).link
      : null;

  const isVerified = profile.verification_status === "verified";

  return (
    <div className="p-6 sm:p-8">
      <Greeting firstName={user.first_name || "there"} />

      <div className="mx-auto mt-6 max-w-3xl space-y-6">
        <NurseDashboardHero
          status={profile.verification_status}
          rejectedReason={profile.verification_rejected_reason}
          slug={profile.slug}
          score={score}
        />

        {/* Secondary lane: only renders meaningful content for verified
            nurses. Pending and rejected states get just the hero so the
            user's attention isn't fragmented. */}
        {isVerified && (
          <>
            {score < 100 && (
              <CompletenessCard score={score} missing={missing} />
            )}
            <QuickActions
              slug={profile.slug}
              isAvailable={profile.is_available}
            />
            {reviewLink && <ReviewLinkCard initialToken={reviewLink.token} />}
            <NurseClaimHireCard />
            {profile.tier === "free" && <FeaturedUpsell isVerified={true} />}
            {profile.tier === "featured" && featuredSub && (
              <ManageFeatured
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
