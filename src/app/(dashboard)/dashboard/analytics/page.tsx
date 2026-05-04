import type { Metadata } from "next";
import Link from "next/link";
import {
  Eye,
  Heart,
  Lock,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { requireRole } from "@/lib/auth/helpers";
import { UserRole } from "@/types/enums";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import {
  getNurseStats,
  getCohortComparison,
  percentChange,
} from "@/lib/analytics/nurse-stats";
import { StatsChart } from "@/components/analytics/StatsChart";

export const metadata: Metadata = {
  title: "Analytics | NurseDex",
};

export default async function NurseAnalyticsPage() {
  const user = await requireRole(UserRole.NURSE);
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("nurse_profiles")
    .select("tier, verification_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const isFeatured = profile?.tier === "featured";
  const stats = isFeatured ? await getNurseStats(user.id) : null;
  const cohort =
    isFeatured && stats
      ? await getCohortComparison(user.id, stats.thisWindow.profileViews)
      : null;

  const totalActivity = stats
    ? stats.thisWindow.profileViews +
      stats.thisWindow.saves +
      stats.thisWindow.reveals
    : 0;

  return (
    <div className="mx-auto w-full max-w-4xl p-6 sm:p-8">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
            Analytics
          </h1>
          {isFeatured && (
            <Badge className="bg-teal text-white">Featured</Badge>
          )}
        </div>
        <p className="text-soft-black-light mt-1 text-sm">
          {isFeatured
            ? "Profile views, saves, and reveals over the last 30 days."
            : "Featured nurses see profile performance over time. Upgrade to unlock."}
        </p>
      </header>

      {!isFeatured && <LockedPreview />}

      {isFeatured && stats && totalActivity === 0 && <EmptyState />}

      {isFeatured && stats && totalActivity > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              icon={<Eye className="size-4" />}
              label="Profile views"
              current={stats.thisWindow.profileViews}
              prior={stats.priorWindow.profileViews}
            />
            <Stat
              icon={<Heart className="size-4" />}
              label="Saves"
              current={stats.thisWindow.saves}
              prior={stats.priorWindow.saves}
            />
            <Stat
              icon={<Star className="size-4" />}
              label="Reveals"
              current={stats.thisWindow.reveals}
              prior={stats.priorWindow.reveals}
            />
          </div>

          <Card className="border-sage/20 mt-6">
            <CardContent className="pt-5">
              <h2 className="text-soft-black mb-3 text-sm font-semibold">
                Last 30 days
              </h2>
              <StatsChart daily={stats.daily} />
            </CardContent>
          </Card>

          {cohort?.available && cohort.multiplier !== null && (
            <Card className="border-sage/20 mt-6">
              <CardContent className="pt-5">
                <h2 className="text-soft-black mb-1 text-sm font-semibold">
                  How you compare
                </h2>
                <p className="text-soft-black text-sm">
                  {cohort.multiplier > 1
                    ? `You got ${cohort.multiplier}x more profile views than the median nurse with your credential and primary care type over the last 30 days.`
                    : cohort.multiplier < 1
                      ? `Your views are at ${Math.round(cohort.multiplier * 100)}% of the median nurse with your credential and primary care type. Consider freshening up your bio or photo.`
                      : `You're roughly on par with the median for your credential and primary care type.`}
                </p>
                <p className="text-muted-foreground mt-2 text-xs">
                  Cohort: {cohort.cohortSize} verified nurses with your
                  credential and primary care type. Median 30 day views ={" "}
                  {cohort.cohortMedianViews?.toLocaleString() ?? "0"}.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  current,
  prior,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  prior: number;
}) {
  const pct = percentChange(current, prior);
  return (
    <Card className="border-sage/20">
      <CardContent className="space-y-1 pt-4">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {icon}
          {label}
        </div>
        <p className="font-heading text-soft-black text-2xl font-semibold">
          {current.toLocaleString()}
        </p>
        <Delta pct={pct} />
      </CardContent>
    </Card>
  );
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <p className="text-muted-foreground text-xs">No prior data to compare</p>
    );
  }
  if (pct === 0) {
    return <p className="text-muted-foreground text-xs">No change</p>;
  }
  const Icon = pct > 0 ? TrendingUp : TrendingDown;
  const color = pct > 0 ? "text-teal-dark" : "text-red-700";
  return (
    <p className={`flex items-center gap-1 text-xs ${color}`}>
      <Icon className="size-3.5" />
      {pct > 0 ? "+" : ""}
      {pct}% vs prior 30 days
    </p>
  );
}

function EmptyState() {
  return (
    <Card className="border-sage/20">
      <CardContent className="space-y-3 py-10 text-center">
        <Eye className="text-muted-foreground mx-auto size-8" />
        <h2 className="font-heading text-soft-black text-lg font-medium">
          No activity yet
        </h2>
        <p className="text-soft-black-light mx-auto max-w-md text-sm">
          We&apos;ll start showing profile views, saves, and reveals here as
          soon as families start finding you. Make sure your photo and bio
          are filled in to give the algorithm something to work with.
        </p>
      </CardContent>
    </Card>
  );
}

function LockedPreview() {
  return (
    <Card className="border-teal/30 bg-gradient-to-br from-teal/5 to-sage/10">
      <CardContent className="space-y-4 pt-6">
        <Lock className="text-teal size-7" />
        <h2 className="font-heading text-soft-black text-xl font-semibold">
          Analytics is a Featured perk
        </h2>
        <p className="text-soft-black-light text-sm">
          Featured nurses see how many families view, save, and reveal their
          profile, plus a 30 day chart and a benchmark against the median
          nurse with their credential and primary care type.
        </p>
        <div className="space-y-2">
          <Preview label="Profile views" />
          <Preview label="Saves" />
          <Preview label="Reveals" />
        </div>
        <Link
          href="/dashboard"
          className="bg-teal hover:bg-teal-dark inline-block rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          Upgrade to Featured
        </Link>
      </CardContent>
    </Card>
  );
}

function Preview({ label }: { label: string }) {
  return (
    <div
      className="border-sage/20 flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm"
      aria-hidden="true"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-muted-foreground/30 font-mono blur-sm select-none">
        ███
      </span>
    </div>
  );
}

// The cohort query reads every cohort member's analytics rows — small
// volume at our population size, but we don't want a stale prerender.
export const dynamic = "force-dynamic";
