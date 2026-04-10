import { requireAuth } from "@/lib/auth/helpers";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/enums";
import { calculateCompleteness } from "@/lib/profile/completeness";
import { VerificationBanner } from "@/components/dashboard/VerificationBanner";
import { CompletenessCard } from "@/components/dashboard/CompletenessCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { FeaturedUpsell } from "@/components/dashboard/FeaturedUpsell";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const isNurse = user.role === UserRole.NURSE;

  // Family dashboard (minimal for now)
  if (!isNurse) {
    return (
      <div className="p-6 sm:p-8">
        <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back, {user.first_name || user.email}
        </p>
        <Card className="mt-6 border-sage/20">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Family dashboard features are coming soon. You will be able to
            search for nurses, save favorites, and manage your subscription
            here.
          </CardContent>
        </Card>
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
        <p className="text-sm text-muted-foreground">Profile not found.</p>
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
        <p className="mt-1 text-sm text-muted-foreground">
          Let's get your profile set up so families on Long Island can find you.
        </p>
        <Card className="mt-6 border-teal/30 bg-teal/5">
          <CardContent className="flex flex-col items-start gap-3 pt-6">
            <h2 className="font-heading text-lg font-semibold">
              Finish setting up your profile
            </h2>
            <p className="text-sm text-muted-foreground">
              Complete your profile in just a few minutes. You will need your
              license number and a professional photo.
            </p>
            <Link
              href="/dashboard/onboarding"
              className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
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

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back, {user.first_name || "there"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Verification status */}
          <VerificationBanner
            status={profile.verification_status}
            rejectedReason={profile.verification_rejected_reason}
          />

          {/* Completeness */}
          <CompletenessCard score={score} missing={missing} />

          {/* Quick actions */}
          <QuickActions
            slug={profile.slug}
            isAvailable={profile.is_available}
            tier={profile.tier}
          />

          {/* Reviews placeholder */}
          <Card className="border-sage/20">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Reviews will appear here once families start leaving feedback.
            </CardContent>
          </Card>
        </div>

        {/* Sidebar column */}
        <div className="space-y-6">
          {/* Featured upsell (only for free tier) */}
          {profile.tier === "free" && <FeaturedUpsell />}

          {/* Confirmed hires placeholder */}
          <Card className="border-sage/20">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Confirmed hires will appear here.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
