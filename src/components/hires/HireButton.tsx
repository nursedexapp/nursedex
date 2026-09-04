"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Briefcase, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";
import { useInFlight } from "@/components/ui/use-in-flight";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { recordFamilyHire } from "@/lib/hires/actions";
import type { Hire } from "@/types/database";
import { captureClientEvent } from "@/lib/analytics/capture";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

interface HireButtonProps {
  nurseUserId: string;
  nurseFirstName: string;
  hire: Hire | null;
}

export function HireButton({
  nurseUserId,
  nurseFirstName,
  hire,
}: HireButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Through the shared primitive, not a hand-rolled flag inside a bare
  // `void (async () => ...)` (#987). That shape had no catch, so a rejection
  // never reached the reset and the button span forever, which is the #846
  // defect this file was still carrying live. The primitive tracks its own
  // flag rather than useTransition's isPending, which is what #669 needed: a
  // retry does not cancel what it supersedes, and useTransition stays pending
  // until EVERY transition settles, so a hung one would pin the button.
  const { inFlight, run, retry } = useInFlight<"confirm">();

  if (hire && hire.status === "confirmed") {
    return (
      <div className="text-muted-foreground border-teal/30 bg-teal/5 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs">
        <Check className="size-3.5" aria-hidden="true" />
        Hired{" "}
        {hire.confirmed_at
          ? new Date(hire.confirmed_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : ""}
      </div>
    );
  }

  if (hire && hire.status === "claimed") {
    return (
      <div className="text-muted-foreground inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs">
        Hire pending your confirmation
      </div>
    );
  }

  const confirmHire = async (isLatest: () => boolean) => {
    {
      const result = await recordFamilyHire({ nurse_user_id: nurseUserId });

      // Superseded by a retry. This attempt no longer owns the button: reporting
      // here would toast over the retry's result and hand back a control the
      // retry is still using.
      if (!isLatest()) return;

      if (!result.success) {
        if (result.error === "not_revealed") {
          toast.error("You can only record a hire after revealing this nurse.");
        } else if (result.error === "already_recorded") {
          // NOT a failure (#669). The unique constraint from migration 058 means
          // the hire EXISTS, which is exactly what the family asked for. Whether
          // it was written moments ago by an attempt of theirs that hung, or last
          // week, the truth is the same. Reporting it as an error was how a retry
          // over a hung-but-successful hire told them it had failed when it
          // worked.
          toast.success(`${nurseFirstName} is already recorded as hired`);
          setOpen(false);
          router.refresh();
        } else {
          toast.error("Could not record the hire. Please try again.");
        }
        return;
      }
      captureClientEvent(ANALYTICS_EVENTS.HIRE_CLAIMED, { claimed_by: "family" });
      toast.success(`Recorded hire of ${nurseFirstName}`);
      setOpen(false);
      router.refresh();
    }
  };

  // `run` is the gate and refuses while something is in flight; `retry` is the
  // one door past it, which is what a stalled retry-mode button needs (#669).
  const handleConfirm = () => run("confirm", confirmHire);
  const handleRetry = () => retry("confirm", confirmHire);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Briefcase className="mr-1.5 size-3.5" aria-hidden="true" />I hired{" "}
        {nurseFirstName}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-heading text-lg font-semibold">
          Record your hire of {nurseFirstName}
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          We&apos;ll mark this on {nurseFirstName}&apos;s profile so other
          families can see they&apos;ve been hired before. If you haven&apos;t
          already, consider leaving a review at the same time.
        </DialogDescription>
        <div className="mt-4 flex items-end justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={inFlight !== null}
          >
            Cancel
          </Button>
          {/* retry, not wait (#669). This used to stay dead on a stall, because a
              second fire wrote a second hire row and sent a second pair of emails
              (#651). Migration 058's UNIQUE (family_user_id, nurse_user_id) closed
              that: a repeat cannot write a second row, and it is now reported as
              the already-done that it is rather than as a failure. So a stalled
              hire can simply be tried again. */}
          <PendingButton
            pending={inFlight === "confirm"}
            mode="retry"
            idleLabel={`Yes, I hired ${nurseFirstName}`}
            workingLabel="Recording..."
            slowLabel="Still recording..."
            stalledVerb="recording"
            onClick={handleConfirm}
            onRetry={handleRetry}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
