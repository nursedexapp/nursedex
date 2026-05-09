"use client";

import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface VerifiedCelebrationProps {
  slug: string;
  onDismiss: () => void;
}

/**
 * One-time celebration that replaces the steady-state Live banner on the
 * first dashboard visit after a nurse becomes verified. The parent
 * handles localStorage tracking and decides whether to render this
 * vs the regular VerificationBanner.
 */
export function VerifiedCelebration({
  slug,
  onDismiss,
}: VerifiedCelebrationProps) {
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
          <h2 className="font-heading text-soft-black text-lg font-semibold">
            Welcome to NurseDex. Your profile is live.
          </h2>
          <p className="text-soft-black-light mt-1 text-sm">
            Families on Long Island can now find you. Share your link with
            people who&apos;ve worked with you, and reviews can roll in.
          </p>
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
