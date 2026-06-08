"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Clock, Sparkles, Eye, AlertTriangle, X } from "lucide-react";

const CELEBRATION_KEY = "nursedex.celebrated.verified";

interface NurseDashboardHeroProps {
  status: "pending" | "verified" | "rejected";
  rejectedReason?: string | null;
  slug: string;
  // Profile completeness, 0..100. Only relevant for verified state.
  score: number;
}

export function NurseDashboardHero({
  status,
  rejectedReason,
  slug,
  score,
}: NurseDashboardHeroProps) {
  if (status === "pending") return <PendingHero slug={slug} />;
  if (status === "rejected")
    return <RejectedHero rejectedReason={rejectedReason} />;
  return <VerifiedHero slug={slug} score={score} />;
}

function PendingHero({ slug }: { slug: string }) {
  return (
    <HeroFrame tone="warning">
      <HeroIcon tone="warning" Icon={Clock} />
      <div className="flex-1">
        <HeroHeading>We&apos;re reviewing your license</HeroHeading>
        <HeroBody>
          Verification usually takes 24 to 72 hours. We&apos;ll email you the
          moment your profile is live.
        </HeroBody>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/nurses/${slug}`}
            target="_blank"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Eye className="mr-1.5 size-3.5" aria-hidden="true" />
            Preview your profile
          </Link>
        </div>
      </div>
    </HeroFrame>
  );
}

function RejectedHero({ rejectedReason }: { rejectedReason?: string | null }) {
  return (
    <HeroFrame tone="error">
      <HeroIcon tone="error" Icon={AlertTriangle} />
      <div className="flex-1">
        <HeroHeading>Your verification needs a quick fix</HeroHeading>
        <HeroBody>
          Update what we flagged and resubmit. We&apos;ll re-review within 24
          hours.
        </HeroBody>
        {rejectedReason && (
          <p className="text-error mt-2 text-sm font-medium">
            What to fix: {rejectedReason}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/dashboard/edit"
            className={`${buttonVariants({ size: "sm" })} bg-teal hover:bg-teal-dark text-warm-white`}
          >
            Edit profile
          </Link>
        </div>
      </div>
    </HeroFrame>
  );
}

function VerifiedHero({ slug, score }: { slug: string; score: number }) {
  // Track first-time-verified celebration. Server-rendered first paint
  // assumes already-celebrated; the actual decision happens after mount
  // so a returning user never sees the celebration flash in.
  const [celebrated, setCelebrated] = useState<boolean | null>(null);

  useEffect(() => {
    setCelebrated(window.localStorage.getItem(CELEBRATION_KEY) === "1");
  }, []);

  function dismissCelebration() {
    window.localStorage.setItem(CELEBRATION_KEY, "1");
    setCelebrated(true);
  }

  if (celebrated === false) {
    return <CelebrationHero slug={slug} onDismiss={dismissCelebration} />;
  }

  if (score < 80) {
    return <LiveLowCompletenessHero score={score} />;
  }

  return <LiveHero slug={slug} />;
}

function CelebrationHero({
  slug,
  onDismiss,
}: {
  slug: string;
  onDismiss: () => void;
}) {
  async function handleCopyLink() {
    const url = `https://nursedex.com/nurses/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy automatically. Try again or copy by hand.");
    }
  }

  return (
    <div className="border-teal/20 from-teal/5 to-sage/5 relative rounded-lg border bg-gradient-to-br p-5">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-soft-black-light hover:bg-sage/10 hover:text-soft-black absolute top-3 right-3 rounded-md p-1 transition-colors"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="bg-teal text-warm-white motion-safe:animate-icon-pop flex size-10 shrink-0 items-center justify-center rounded-full">
          <Sparkles className="size-5" />
        </div>
        <div className="flex-1 pr-6">
          <HeroHeading>Welcome to NurseDex. Your profile is live.</HeroHeading>
          <HeroBody>
            Families in New York can now find you. Share your link with people
            who&apos;ve worked with you and reviews can roll in.
          </HeroBody>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleCopyLink}
              className="bg-teal hover:bg-teal-dark text-warm-white"
            >
              Copy my profile link
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="text-soft-black-light hover:bg-sage/10"
            >
              Got it
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveLowCompletenessHero({ score }: { score: number }) {
  return (
    <HeroFrame tone="brand">
      <HeroIcon tone="brand" Icon={Sparkles} />
      <div className="flex-1">
        <HeroHeading>Your profile is live. Make it shine.</HeroHeading>
        <HeroBody>
          You&apos;re at {score}%. Add the last few details so families see a
          fuller picture of you.
        </HeroBody>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/dashboard/edit"
            className={`${buttonVariants({ size: "sm" })} bg-teal hover:bg-teal-dark text-warm-white`}
          >
            Continue editing
          </Link>
        </div>
      </div>
    </HeroFrame>
  );
}

function LiveHero({ slug }: { slug: string }) {
  async function handleCopyLink() {
    const url = `https://nursedex.com/nurses/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy automatically. Try again or copy by hand.");
    }
  }

  return (
    <HeroFrame tone="brand">
      <HeroIcon tone="brand" Icon={Sparkles} />
      <div className="flex-1">
        <HeroHeading>Your profile is live</HeroHeading>
        <HeroBody>
          Families in New York can find you. Share your link to start collecting
          reviews from past clients.
        </HeroBody>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleCopyLink}
            className="bg-teal hover:bg-teal-dark text-warm-white"
          >
            Copy my profile link
          </Button>
          <Link
            href={`/nurses/${slug}`}
            target="_blank"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Eye className="mr-1.5 size-3.5" aria-hidden="true" />
            View public profile
          </Link>
        </div>
      </div>
    </HeroFrame>
  );
}

type Tone = "warning" | "error" | "brand";

const TONE_FRAME: Record<Tone, string> = {
  warning: "border-warning/30 bg-warning/10",
  error: "border-error/30 bg-error/10",
  brand: "border-sage/20 bg-sage/5",
};

const TONE_ICON_BG: Record<Tone, string> = {
  warning: "bg-warning/20 text-warning",
  error: "bg-error/20 text-error",
  brand: "bg-teal text-warm-white",
};

function HeroFrame({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-5 ${TONE_FRAME[tone]}`}
    >
      {children}
    </div>
  );
}

function HeroIcon({
  tone,
  Icon,
}: {
  tone: Tone;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <div
      className={`flex size-10 shrink-0 items-center justify-center rounded-full ${TONE_ICON_BG[tone]}`}
    >
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
