import { requireAuth } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";
import { calculateCompleteness } from "@/lib/profile/completeness";
import { VerificationStatus } from "@/components/dashboard/VerificationStatus";
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
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const isNurse = user.role === UserRole.NURSE;

  // Family dashboard (minimal for now)
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
        <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
        <Greeting firstName={user.first_name || user.email} />

        {!hasTakenSurvey && (
          <Card className="border-teal/30 bg-teal/5 mt-6">
            <CardContent className="flex flex-col items-start gap-3 pt-6">
              <h2 className="font-heading text-lg font-semibold">
                Find your match in 4 quick questions
              </h2>
              <p className="text-soft-black-light text-sm">
                Take the survey and we&apos;ll show you nurses on Long Island
                who fit what you&apos;re looking for.
              </p>
              <Link
                href="/survey"
                className="bg-teal hover:bg-teal-dark inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-white transition-colors"
              >
                Take the survey
              </Link>
            </CardContent>
          </Card>
        )}

        {recentReveals.length > 0 && (
          <section className="mt-8">
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

  // Check if onboarding is incomplete
  const needsOnboarding =
    profile.years_experience === null ||
    (profile.credential === "hha" && profile.license_number === null);

  if (needsOnboarding) {
    return (
      <div className="p-6 sm:p-8">
        <h1 className="font-heading text-2xl font-semibold">
          Welcome to NurseDex
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Let's get your profile set up so families on Long Island can find you.
        </p>
        <Card className="border-teal/30 bg-teal/5 mt-6">
          <CardContent className="flex flex-col items-start gap-3 pt-6">
            <h2 className="font-heading text-lg font-semibold">
              Finish setting up your profile
            </h2>
            <p className="text-muted-foreground text-sm">
              Complete your profile in just a few minutes. You will need your
              license number and a professional photo.
            </p>
            <Link
              href="/dashboard/onboarding"
              className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-8 items-center justify-center rounded-lg px-3 text-sm font-medium transition-all"
            >
              Continue Setup
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate completeness
  const { score, missing } = calculateCompleteness(profile);

  // For Featured nurses, fetch the subscription so we can render the
  // "Manage subscription" card with renewal info.
  const featuredSub =
    profile.tier === "featured"
      ? await getActiveSubscription(user.id, "nurse_featured")
      : null;

  // Verified nurses get a permanent share link for collecting reviews
  // from past clients.
  const reviewLink =
    profile.verification_status === "verified"
      ? (await getOrCreateReviewLink()).link
      : null;

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
        <Greeting firstName={user.first_name || "there"} />
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        <VerificationStatus
          status={profile.verification_status}
          rejectedReason={profile.verification_rejected_reason}
          slug={profile.slug}
        />

        <CompletenessCard score={score} missing={missing} />

        <QuickActions slug={profile.slug} isAvailable={profile.is_available} />

        {reviewLink && <ReviewLinkCard initialToken={reviewLink.token} />}

        {profile.verification_status === "verified" && <NurseClaimHireCard />}

        {profile.tier === "free" && (
          <FeaturedUpsell
            isVerified={profile.verification_status === "verified"}
          />
        )}
        {profile.tier === "featured" && featuredSub && (
          <ManageFeatured
            renewsOn={featuredSub.current_period_end}
            cancelAtPeriodEnd={featuredSub.cancel_at_period_end}
            isPastDue={featuredSub.status === "past_due"}
          />
        )}
      </div>
    </div>
  );
}
