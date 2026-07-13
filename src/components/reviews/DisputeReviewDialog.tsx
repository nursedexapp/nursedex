"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DISPUTE_REASONS,
  DISPUTE_TEXT_MAX,
  type DisputeReason,
} from "@/lib/schemas/review";
import { disputeReview } from "@/lib/reviews/nurse-actions";
import { PendingButton } from "@/components/ui/pending-button";

interface DisputeReviewDialogProps {
  reviewId: string;
}

export function DisputeReviewDialog({ reviewId }: DisputeReviewDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason | "">("");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button stops the button, not the form.
    if (pending) return;
    setErrors({});

    if (!reason) {
      setErrors({ reason: "Pick a reason" });
      return;
    }

    startTransition(async () => {
      const result = await disputeReview({
        review_id: reviewId,
        reason,
        text,
      });

      if (!result.success) {
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
          return;
        }
        toast.error(
          result.error === "not_eligible"
            ? "This review can't be disputed right now"
            : "Couldn't submit your dispute. Please try again.",
        );
        return;
      }

      toast.success("Dispute submitted. We'll be in touch.");
      setOpen(false);
      setReason("");
      setText("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Dispute
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-heading text-lg font-semibold">
          Dispute this review
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          A moderator will look at the review and your explanation, then decide
          whether to keep it or take it down. The review stays visible on your
          profile during the investigation.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="dispute_reason" className="mb-1.5 block">
              Reason
            </Label>
            <select
              id="dispute_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as DisputeReason)}
              disabled={pending}
              required
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-lg border px-3 text-sm transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select a reason...</option>
              {DISPUTE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {errors.reason && (
              <p className="text-destructive mt-1 text-xs">{errors.reason}</p>
            )}
          </div>

          <div>
            <Label htmlFor="dispute_text" className="mb-1.5 block">
              Tell us more
              {reason !== "Other" && (
                <span className="text-muted-foreground"> (optional)</span>
              )}
            </Label>
            <Textarea
              id="dispute_text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={DISPUTE_TEXT_MAX}
              rows={4}
              disabled={pending}
              required={reason === "Other"}
              placeholder="Anything that would help our moderator decide."
            />
            <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
              <span>{errors.text ?? "Helpful for the admin reviewer."}</span>
              <span>
                {text.length}/{DISPUTE_TEXT_MAX}
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
            {/* wait, not retry (#443 phase 5): a second fire raises a second
                dispute and notifies again. */}
            <PendingButton
              pending={pending}
              mode="wait"
              type="submit"
              idleLabel="Submit dispute"
              workingLabel="Submitting..."
              slowLabel="Still submitting..."
              outcome="your dispute went through before submitting it again"
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
