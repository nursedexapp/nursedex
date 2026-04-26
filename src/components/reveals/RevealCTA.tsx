"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, Phone, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { revealNurse } from "@/lib/reveals/actions";
import {
  createFamilyAccessCheckout,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";
import { PRICING, GRACE_PERIODS } from "@/lib/constants";
import { COMMUNICATION_PREFERENCE_LABELS } from "@/types/enums";
import type { CommunicationPreference } from "@/types/enums";

interface RevealCTAProps {
  nurseUserId: string;
  nurseFirstName: string;
  // Where to come back to after subscribing — usually the current profile.
  returnTo: string;
  // Render mode:
  //   "anon"       — show "Sign up to reveal" link to /signup
  //   "no_sub"     — show "Reveal contact" button → opens paywall modal
  //   "subscribed" — show "Reveal contact" button → fires action immediately
  mode: "anon" | "no_sub" | "subscribed";
}

interface RevealedContact {
  email: string | null;
  phone: string | null;
  communication_preference: string | null;
}

export function RevealCTA({
  nurseUserId,
  nurseFirstName,
  returnTo,
  mode,
}: RevealCTAProps) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<RevealedContact | null>(null);
  const [isPending, startTransition] = useTransition();

  const fireReveal = () => {
    startTransition(async () => {
      if (posthog.__loaded) {
        posthog.capture(ANALYTICS_EVENTS.REVEAL_ATTEMPTED, {
          nurse_user_id: nurseUserId,
        });
      }
      const result = await revealNurse(nurseUserId);
      if (!result.success) {
        toast.error(
          result.error === "no_subscription"
            ? "Subscribe to reveal contact info"
            : "Couldn't reveal contact info. Try again.",
        );
        return;
      }
      setRevealed(result.contact ?? null);
      if (posthog.__loaded) {
        posthog.capture(ANALYTICS_EVENTS.REVEAL_COMPLETED, {
          nurse_user_id: nurseUserId,
        });
      }
      router.refresh();
    });
  };

  if (revealed) {
    return <ContactCard nurseFirstName={nurseFirstName} contact={revealed} />;
  }

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
      <Button onClick={fireReveal} disabled={isPending}>
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
    );
  }

  // mode === "no_sub" — show paywall modal
  return <PaywallTrigger returnTo={returnTo} />;
}

function PaywallTrigger({ returnTo }: { returnTo: string }) {
  const [subscribing, setSubscribing] = useState(false);

  const handleSubscribe = async () => {
    setSubscribing(true);
    if (posthog.__loaded) {
      posthog.capture(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, {
        plan: "family_access",
      });
    }
    const result = await createFamilyAccessCheckout({ returnTo });
    if (result.error) {
      toast.error(result.error);
      setSubscribing(false);
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
            Cancel anytime — keep access to nurses you&apos;ve already revealed
            for {GRACE_PERIODS.CANCELLED_ACCESS_DAYS} days
          </li>
        </ul>
        <Button
          onClick={handleSubscribe}
          disabled={subscribing}
          className="w-full"
        >
          {subscribing ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Redirecting to checkout...
            </>
          ) : (
            "Subscribe"
          )}
        </Button>
        <p className="text-soft-black-light text-center text-xs">
          You&apos;ll be redirected to Stripe to enter payment details securely.
          No charges until you confirm.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function ContactCard({
  nurseFirstName,
  contact,
}: {
  nurseFirstName: string;
  contact: RevealedContact;
}) {
  const prefLabel = contact.communication_preference
    ? COMMUNICATION_PREFERENCE_LABELS[
        contact.communication_preference as CommunicationPreference
      ]
    : null;

  const subject = encodeURIComponent("NurseDex Inquiry");
  const body = encodeURIComponent(
    `Hi ${nurseFirstName},\n\nI found your profile on NurseDex and would like to talk about possibly working together.\n\n`,
  );

  return (
    <div className="border-sage/20 space-y-3 rounded-xl border bg-white p-4">
      {prefLabel && (
        <p className="text-soft-black-light text-xs">
          {nurseFirstName} prefers <strong>{prefLabel}</strong>
        </p>
      )}
      <div className="space-y-2">
        {contact.email && (
          <a
            href={`mailto:${contact.email}?subject=${subject}&body=${body}`}
            className="hover:text-teal flex items-center gap-2 text-sm"
          >
            <Mail className="text-soft-black-light size-4" aria-hidden="true" />
            {contact.email}
          </a>
        )}
        {contact.phone && (
          <>
            <a
              href={`tel:${contact.phone}`}
              className="hover:text-teal flex items-center gap-2 text-sm"
            >
              <Phone
                className="text-soft-black-light size-4"
                aria-hidden="true"
              />
              Call {contact.phone}
            </a>
            <a
              href={`sms:${contact.phone}?body=Hi ${nurseFirstName}, I found you on NurseDex and would like to talk.`}
              className="hover:text-teal flex items-center gap-2 text-sm"
            >
              <MessageSquare
                className="text-soft-black-light size-4"
                aria-hidden="true"
              />
              Text {contact.phone}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
