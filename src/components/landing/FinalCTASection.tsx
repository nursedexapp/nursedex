"use client";

import { useState } from "react";
import { CheckCircle, Link as LinkIcon, Check } from "lucide-react";
import { WaitlistForm } from "./WaitlistForm";

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText("https://nursedex.com");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 font-body text-sm text-sage-light transition-colors hover:bg-white/10 hover:text-warm-white"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied!
        </>
      ) : (
        <>
          <LinkIcon className="h-3.5 w-3.5" />
          Copy link
        </>
      )}
    </button>
  );
}

type FinalCTASectionProps = {
  role: "nurse" | "family";
  referralSource?: string;
  onSignup?: () => void;
  hasSignedUp?: boolean;
};

export function FinalCTASection({ role, referralSource, onSignup, hasSignedUp }: FinalCTASectionProps) {
  return (
    <section id="waitlist-footer" className="scroll-mt-16 bg-teal px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        {hasSignedUp ? (
          <>
            <CheckCircle className="mx-auto mb-4 h-10 w-10 text-sage-light" />
            <h2 className="font-heading text-3xl text-warm-white sm:text-4xl">
              You&apos;re on the list.
            </h2>
            <p className="mx-auto mt-4 max-w-md font-body text-sage-light">
              We&apos;ll be in touch when NurseDex launches. Know someone who would love NurseDex?
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <CopyLinkButton />
              <a
                href={`sms:?body=${encodeURIComponent("Check out NurseDex, a new directory for finding trusted caregivers on Long Island: https://nursedex.com")}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 font-body text-sm text-sage-light transition-colors hover:bg-white/10 hover:text-warm-white"
              >
                Text a friend
              </a>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-heading text-3xl text-warm-white sm:text-4xl">
              Be the first to know when we launch.
            </h2>
            <p className="mx-auto mt-4 max-w-md font-body text-sage-light">
              {role === "family"
                ? "Join the waitlist and get early access to Long Island's trusted caregiver directory."
                : "Join the waitlist and be among the first caregivers on the platform."}
            </p>
            <div className="mt-10">
              <WaitlistForm role={role} referralSource={referralSource} variant="footer" onSignup={onSignup} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
