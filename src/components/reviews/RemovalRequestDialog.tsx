"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { REMOVAL_REASON_MAX } from "@/lib/schemas/review";
import { requestReviewRemoval } from "@/lib/reviews/actions";

interface RemovalRequestDialogProps {
  reviewId: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary" | "link";
  triggerSize?: "default" | "sm" | "lg";
}

export function RemovalRequestDialog({
  reviewId,
  triggerLabel,
  triggerVariant = "ghost",
  triggerSize = "sm",
}: RemovalRequestDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await requestReviewRemoval({
        review_id: reviewId,
        reason,
      });
      if (!result.success) {
        if (result.fieldErrors?.reason) {
          setError(result.fieldErrors.reason);
          return;
        }
        toast.error(
          result.error === "not_editable"
            ? "This review can't be removed right now"
            : "Couldn't send your removal request. Please try again.",
        );
        return;
      }
      toast.success("Removal request sent. We'll be in touch.");
      setOpen(false);
      setReason("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({
          variant: triggerVariant,
          size: triggerSize,
        })}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-heading text-lg font-semibold">
          Request review removal
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          Tell us briefly why you&apos;d like this review removed. A
          moderator will review your request and follow up by email.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="removal_reason" className="mb-1.5 block">
              Reason
            </Label>
            <Textarea
              id="removal_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={REMOVAL_REASON_MAX}
              rows={4}
              disabled={pending}
              required
            />
            <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
              <span>{error ?? "Up to 200 characters."}</span>
              <span>
                {reason.length}/{REMOVAL_REASON_MAX}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending..." : "Send request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
