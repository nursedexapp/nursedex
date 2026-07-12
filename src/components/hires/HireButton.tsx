"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Briefcase, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";
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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await recordFamilyHire({ nurse_user_id: nurseUserId });
      if (!result.success) {
        if (result.error === "not_revealed") {
          toast.error("You can only record a hire after revealing this nurse.");
        } else if (result.error === "already_recorded") {
          toast.error("You've already recorded a hire with this nurse.");
        } else {
          toast.error("Could not record the hire. Please try again.");
        }
        return;
      }
      toast.success(`Recorded hire of ${nurseFirstName}`);
      setOpen(false);
    });
  };

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
            disabled={pending}
          >
            Cancel
          </Button>
          {/* wait, not retry (#443 phase 3). A second fire writes a second hire
              row and sends a second pair of emails, which is #651. There is
              nothing safe to hand back, so the button stays dead and the message
              tells them how to check. */}
          <PendingButton
            pending={pending}
            mode="wait"
            idleLabel={`Yes, I hired ${nurseFirstName}`}
            workingLabel="Recording..."
            slowLabel="Still recording..."
            stalledMessage="This is still recording. Please do not close this page. Refresh to check whether the hire was recorded."
            onClick={handleConfirm}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
