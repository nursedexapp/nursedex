"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Heart, ListChecks, Search } from "lucide-react";

interface FamilyDashboardHeroProps {
  hasTakenSurvey: boolean;
  recentRevealsCount: number;
}

export function FamilyDashboardHero({
  hasTakenSurvey,
  recentRevealsCount,
}: FamilyDashboardHeroProps) {
  if (!hasTakenSurvey) return <PreSurveyHero />;
  if (recentRevealsCount === 0) return <SurveyDoneHero />;
  return <ActiveSearchHero />;
}

function PreSurveyHero() {
  return (
    <HeroFrame>
      <HeroIcon Icon={ListChecks} />
      <div className="flex-1">
        <HeroHeading>Find your match in 4 quick questions</HeroHeading>
        <HeroBody>
          Tell us about the care you&apos;re looking for and we&apos;ll show you
          nurses on Long Island who fit.
        </HeroBody>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/survey"
            className={`${buttonVariants({ size: "sm" })} bg-teal hover:bg-teal-dark text-warm-white`}
          >
            Take the survey
          </Link>
        </div>
      </div>
    </HeroFrame>
  );
}

function SurveyDoneHero() {
  return (
    <HeroFrame>
      <HeroIcon Icon={Search} />
      <div className="flex-1">
        <HeroHeading>Time to meet your matches</HeroHeading>
        <HeroBody>
          We&apos;ve lined up nurses who fit what you described. Browse profiles
          and save the ones you&apos;d like to learn more about.
        </HeroBody>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/nurses?from=survey"
            className={`${buttonVariants({ size: "sm" })} bg-teal hover:bg-teal-dark text-warm-white`}
          >
            View matches
          </Link>
          <Link
            href="/survey"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Retake survey
          </Link>
        </div>
      </div>
    </HeroFrame>
  );
}

function ActiveSearchHero() {
  return (
    <HeroFrame>
      <HeroIcon Icon={Heart} />
      <div className="flex-1">
        <HeroHeading>Pick up where you left off</HeroHeading>
        <HeroBody>
          The nurses you&apos;ve revealed are below. When you&apos;re ready,
          reach out directly using the contact info on their profile.
        </HeroBody>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/dashboard/revealed"
            className={`${buttonVariants({ size: "sm" })} bg-teal hover:bg-teal-dark text-warm-white`}
          >
            See revealed nurses
          </Link>
          <Link
            href="/nurses"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Keep browsing
          </Link>
        </div>
      </div>
    </HeroFrame>
  );
}

function HeroFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-sage/20 bg-sage/5 flex items-start gap-3 rounded-lg border p-5">
      {children}
    </div>
  );
}

function HeroIcon({
  Icon,
}: {
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <div className="bg-teal text-warm-white flex size-10 shrink-0 items-center justify-center rounded-full">
      <Icon className="size-5" aria-hidden={true} />
    </div>
  );
}

function HeroHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-soft-black text-lg font-semibold">
      {children}
    </h2>
  );
}

function HeroBody({ children }: { children: React.ReactNode }) {
  return <p className="text-soft-black-light mt-1 text-sm">{children}</p>;
}
