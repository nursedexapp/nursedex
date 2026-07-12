"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";
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
import { adminResolveDispute } from "@/lib/admin/review-actions";

interface DisputeDecisionDialogProps {
  reviewId: string;
  decision: "keep" | "remove";
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "destructive";
}

export function DisputeDecisionDialog({
  reviewId,
  decision,
  triggerLabel,
  triggerVariant = "outline",
}: DisputeDecisionDialogProps) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button stops the button, not the form. Resolving a
    // dispute emails BOTH parties, so a second submit is two more real emails.
    if (pending) return;
    startTransition(async () => {
      const result = await adminResolveDispute({
        review_id: reviewId,
        decision,
        notes,
      });
      if (!result.success) {
        toast.error("Could not save the decision. Please try again.");
        return;
      }
      toast.success(
        decision === "keep"
          ? "Review kept. Both parties notified."
          : "Review removed. Both parties notified.",
      );
      setOpen(false);
      setNotes("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({ variant: triggerVariant, size: "sm" })}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-heading text-lg font-semibold">
          {decision === "keep" ? "Keep this review" : "Remove this review"}
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          We&apos;ll email both the nurse and the reviewer. Notes are optional
          and shown verbatim in both emails.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="dispute_notes" className="mb-1.5 block">
              Moderator notes (optional)
            </Label>
            <Textarea
              id="dispute_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={4}
              disabled={pending}
              placeholder="Why this decision? Visible to both parties."
            />
            <div className="text-muted-foreground mt-1 text-right text-xs">
              {notes.length}/500
            </div>
          </div>

          <div className="flex items-end justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            {/* wait, not retry (#443 phase 4): both parties get an email. */}
            <PendingButton
              pending={pending}
              mode="wait"
              type="submit"
              variant={decision === "remove" ? "destructive" : "default"}
              idleLabel={decision === "keep" ? "Keep review" : "Remove review"}
              workingLabel="Saving..."
              slowLabel="Still saving..."
              stalledMessage="This is still processing. Please do not close this page. Refresh to check whether the decision went through."
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
