"use client";

import { useState } from "react";
import { useLatestAttempt } from "@/components/ui/use-latest-attempt";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { PendingButton } from "@/components/ui/pending-button";
import { PAYMENT_STALLED } from "@/components/ui/stalled-copy";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { TurnstileWidget } from "./TurnstileWidget";
import { ProvisioningNotice } from "./ProvisioningNotice";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { revealNurse } from "@/lib/reveals/actions";
import {
  createFamilyAccessCheckout,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";
import { PRICING, GRACE_PERIODS } from "@/lib/constants";

// Creating a checkout session never charges anyone, so a refresh is a safe way
// out of a stall and the message says so.
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
  const searchParams = useSearchParams();
  const [captchaOpen, setCaptchaOpen] = useState(false);
  // A local flag, not useTransition's isPending (#669). A retry does not cancel
  // the request it supersedes, and useTransition stays pending until EVERY
  // transition it started has settled, so the hung one would pin the button in
  // "Revealing..." forever and the retry's success could never clear it.
  const [isPending, setIsPending] = useState(false);
  const { begin, isLatest } = useLatestAttempt();

  const fireReveal = (turnstileToken?: string) => {
    const attempt = begin();
    setIsPending(true);

    void (async () => {
      if (posthog.__loaded) {
        posthog.capture(ANALYTICS_EVENTS.REVEAL_ATTEMPTED, {
          nurse_user_id: nurseUserId,
        });
      }
      const result = await revealNurse(nurseUserId, turnstileToken);

      // Superseded by a retry. The reveal itself is safe (migration 059 spends
      // nothing for a nurse the family already has), but this attempt no longer
      // owns the button: reporting here would toast over the retry's result and
      // hand back a control the retry is still using.
      if (!isLatest(attempt)) return;
      setIsPending(false);

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
    })();
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
        {/* retry, not wait (#669). This used to stay dead on a stall, because a
            second reveal could spend a second slot from the family's capped daily
            allowance for one nurse (#653). Migration 059 closed that: the check,
            the spend and the write are one transaction, so a repeat spends
            nothing and hands back the contact the family already owns. A stalled
            reveal can now simply be tried again. */}
        <PendingButton
          pending={isPending}
          mode="retry"
          idleLabel="Reveal contact info"
          workingLabel="Revealing..."
          slowLabel="Still revealing..."
          icon={<Lock className="size-3.5" aria-hidden="true" />}
          onClick={() => fireReveal()}
          onRetry={() => fireReveal()}
        />
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

  // mode === "no_sub". Right after checkout, our webhook may not have
  // granted access yet even though the family already paid; showing the
  // paywall again here would be confusing, so show a working state instead
  // until access catches up (#426).
  if (searchParams.get("provisioning") === "pending") {
    return <ProvisioningNotice />;
  }
  return <PaywallTrigger returnTo={returnTo} />;
}

function PaywallTrigger({ returnTo }: { returnTo: string }) {
  const [subscribing, setSubscribing] = useState<"month" | "year" | null>(null);

  const handleSubscribe = async (interval: "month" | "year") => {
    setSubscribing(interval);
    const result = await createFamilyAccessCheckout({ returnTo, interval });
    if (result.error) {
      toast.error(result.error);
      setSubscribing(null);
      return;
    }

    // Counted once a session actually exists, not on click. The same defect
    // #657 names in CheckoutButton: firing on click counted a subscription start
    // for a checkout that never reached Stripe, and counted another on the next
    // attempt.
    if (posthog.__loaded) {
      posthog.capture(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, {
        plan: "family_access",
        interval,
        source: "reveal_paywall",
      });
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
            {PRICING.FAMILY_ACCESS_ANNUAL_FIRST_YEAR} for your first year, then
            ${PRICING.FAMILY_ACCESS_ANNUAL}/yr
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
        {/* Both are `wait` mode (#443 phase 3): a checkout session cannot be
            aborted, so a stall never hands back a button that opens a second one.
            Each knows which interval is in flight, so the button the family did
            not press keeps its own label and simply goes dead. */}
        <PendingButton
          pending={subscribing === "year"}
          mode="wait"
          idleLabel={`Get your first year for $${PRICING.FAMILY_ACCESS_ANNUAL_FIRST_YEAR}`}
          workingLabel="Redirecting to checkout..."
          slowLabel="Still opening Stripe..."
          stalledMessage={PAYMENT_STALLED}
          disabled={subscribing !== null}
          onClick={() => handleSubscribe("year")}
          className="w-full"
        />
        <PendingButton
          pending={subscribing === "month"}
          mode="wait"
          variant="link"
          idleLabel={`Or subscribe monthly for $${PRICING.FAMILY_ACCESS_MONTHLY}/month`}
          workingLabel="Redirecting to checkout..."
          slowLabel="Still opening Stripe..."
          stalledMessage={PAYMENT_STALLED}
          disabled={subscribing !== null}
          onClick={() => handleSubscribe("month")}
          className="text-teal-dark hover:text-teal w-full text-center text-sm font-medium underline underline-offset-2"
        />
        <p className="text-soft-black-light text-center text-xs">
          You&apos;ll be redirected to Stripe to enter payment details securely.
          No charges until you confirm.
        </p>
      </DialogContent>
    </Dialog>
  );
}
