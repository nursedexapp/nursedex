"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
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

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={decision === "remove" ? "destructive" : "default"}
              disabled={pending}
            >
              {pending
                ? "Saving..."
                : decision === "keep"
                  ? "Keep review"
                  : "Remove review"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
