"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { TurnstileWidget } from "./TurnstileWidget";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { revealNurse } from "@/lib/reveals/actions";
import {
  createFamilyAccessCheckout,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";
import { PRICING, GRACE_PERIODS } from "@/lib/constants";

interface RevealCTAProps {
  nurseUserId: string;
  nurseFirstName: string;
  // Where to come back to after subscribing, usually the current profile.
  returnTo: string;
  // Render mode:
  //   "anon"      , show "Sign up to reveal" link to /signup
  //   "no_sub"    , show "Reveal contact" button → opens paywall modal
  //   "subscribed", show "Reveal contact" button → fires action immediately
  mode: "anon" | "no_sub" | "subscribed";
}

export function RevealCTA({ nurseUserId, returnTo, mode }: RevealCTAProps) {
  const router = useRouter();
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fireReveal = (turnstileToken?: string) => {
    startTransition(async () => {
      if (posthog.__loaded) {
        posthog.capture(ANALYTICS_EVENTS.REVEAL_ATTEMPTED, {
          nurse_user_id: nurseUserId,
        });
      }
      const result = await revealNurse(nurseUserId, turnstileToken);
      if (!result.success) {
        if (result.error === "needs_captcha") {
          setCaptchaOpen(true);
          return;
        }
        if (result.error === "captcha_failed") {
          toast.error("Verification failed. Please try again.");
          return;
        }
        if (result.error === "rate_limited") {
          toast.error("You've hit today's reveal limit. Try again tomorrow.");
          return;
        }
        toast.error(
          result.error === "no_subscription"
            ? "Subscribe to reveal contact info"
            : "Couldn't reveal contact info. Try again.",
        );
        return;
      }
      setCaptchaOpen(false);
      if (posthog.__loaded) {
        posthog.capture(ANALYTICS_EVENTS.REVEAL_COMPLETED, {
          nurse_user_id: nurseUserId,
        });
      }
      router.refresh();
    });
  };

  const handleCaptchaSolved = (token: string) => {
    fireReveal(token);
  };

  if (mode === "anon") {
    return (
      <a
        href={`/signup?next=${encodeURIComponent(returnTo)}`}
        className="bg-teal hover:bg-teal-dark inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-white transition-colors"
      >
        <Lock className="mr-1.5 size-3.5" aria-hidden="true" />
        Sign up to reveal
      </a>
    );
  }

  if (mode === "subscribed") {
    return (
      <>
        <Button onClick={() => fireReveal()} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Revealing...
            </>
          ) : (
            <>
              <Lock className="mr-1.5 size-3.5" aria-hidden="true" />
              Reveal contact info
            </>
          )}
        </Button>
        <Dialog open={captchaOpen} onOpenChange={setCaptchaOpen}>
          <DialogContent>
            <DialogTitle className="font-heading text-lg font-semibold">
              Quick check
            </DialogTitle>
            <DialogDescription className="text-soft-black-light text-sm">
              You&apos;ve revealed several nurses today. Please confirm
              you&apos;re human to keep going.
            </DialogDescription>
            <div className="flex justify-center py-2">
              <TurnstileWidget onSolved={handleCaptchaSolved} />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // mode === "no_sub", show paywall modal
  return <PaywallTrigger returnTo={returnTo} />;
}

function PaywallTrigger({ returnTo }: { returnTo: string }) {
  const [subscribing, setSubscribing] = useState<"month" | "year" | null>(null);

  const handleSubscribe = async (interval: "month" | "year") => {
    setSubscribing(interval);
    if (posthog.__loaded) {
      posthog.capture(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, {
        plan: "family_access",
        interval,
      });
    }
    const result = await createFamilyAccessCheckout({ returnTo, interval });
    if (result.error) {
      toast.error(result.error);
      setSubscribing(null);
      return;
    }
    await redirectToCheckout(result);
  };

  return (
    <Dialog>
      <DialogTrigger className="bg-teal hover:bg-teal-dark inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-white transition-colors">
        <Lock className="mr-1.5 size-3.5" aria-hidden="true" />
        Reveal contact info
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-heading text-xl font-semibold">
          Subscribe to reveal contact info
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          Family Access lets you see contact info for any verified nurse on
          NurseDex and reach out directly.
        </DialogDescription>
        <ul className="text-soft-black space-y-2 py-2 text-sm">
          <li>
            <span className="text-teal mr-2">•</span>$
            {PRICING.FAMILY_ACCESS_MONTHLY}/month, billed monthly
          </li>
          <li>
            <span className="text-teal mr-2">•</span>
            Unlimited reveals while subscribed
          </li>
          <li>
            <span className="text-teal mr-2">•</span>
            Cancel anytime, keep access to nurses you&apos;ve already revealed
            for {GRACE_PERIODS.CANCELLED_ACCESS_DAYS} days
          </li>
        </ul>
        <Button
          onClick={() => handleSubscribe("month")}
          disabled={subscribing !== null}
          className="w-full"
        >
          {subscribing === "month" ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Redirecting to checkout...
            </>
          ) : (
            "Subscribe monthly"
          )}
        </Button>
        <button
          type="button"
          onClick={() => handleSubscribe("year")}
          disabled={subscribing !== null}
          className="text-teal-dark hover:text-teal w-full text-center text-sm font-medium underline underline-offset-2 disabled:opacity-50"
        >
          {subscribing === "year" ? (
            "Redirecting to checkout..."
          ) : (
            <>
              Or get your first year for $
              {PRICING.FAMILY_ACCESS_ANNUAL_FIRST_YEAR}
            </>
          )}
        </button>
        <p className="text-soft-black-light text-center text-xs">
          You&apos;ll be redirected to Stripe to enter payment details securely.
          No charges until you confirm.
        </p>
      </DialogContent>
    </Dialog>
  );
}
