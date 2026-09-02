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
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { StarRatingInput } from "./StarRatingInput";
import { REVIEW_TEXT_MAX, REVIEW_TEXT_MIN } from "@/lib/schemas/review";
import { submitFamilyReview, updateFamilyReview } from "@/lib/reviews/actions";
import { captureClientEvent } from "@/lib/analytics/capture";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

type TriggerVariant = "default" | "outline" | "ghost" | "secondary" | "link";

interface ReviewFormDialogProps {
  nurseUserId: string;
  nurseFirstName: string;
  defaultFirstName: string;
  triggerLabel: string;
  triggerVariant?: TriggerVariant;
  triggerSize?: "default" | "sm" | "lg";
  triggerClassName?: string;
  /** Pass when editing an existing pending review; omit to create. */
  initial?: {
    reviewId: string;
    rating: number;
    text: string | null;
    reviewer_name: string;
    testimonial_opt_in: boolean;
  };
}

export function ReviewFormDialog({
  nurseUserId,
  nurseFirstName,
  defaultFirstName,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerClassName,
  initial,
}: ReviewFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [text, setText] = useState(initial?.text ?? "");
  const [name, setName] = useState(initial?.reviewer_name ?? defaultFirstName);
  const [optIn, setOptIn] = useState(initial?.testimonial_opt_in ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const isEdit = Boolean(initial);
  const showOptIn = rating >= 4;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button stops the button, not the form. Any other route to
    // a submit event would otherwise write a second review while the first is
    // still in flight, so the handler refuses too.
    if (pending) return;
    setErrors({});

    if (rating < 1) {
      setErrors({ rating: "Pick a star rating" });
      return;
    }

    const payload = {
      nurse_user_id: nurseUserId,
      rating,
      reviewer_name: name,
      text,
      testimonial_opt_in: optIn,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateFamilyReview(initial!.reviewId, payload)
        : await submitFamilyReview(payload);

      if (!result.success) {
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
          return;
        }
        if (result.error === "already_reviewed") {
          toast.error("You already left a review for this nurse");
        } else if (result.error === "not_revealed") {
          toast.error("Reveal this nurse first to leave a review");
        } else if (result.error === "not_editable") {
          toast.error("This review can no longer be edited");
        } else {
          toast.error("Could not save your review. Please try again.");
        }
        return;
      }

      captureClientEvent(ANALYTICS_EVENTS.REVIEW_SUBMITTED, {
        source: "in_app",
        is_edit: isEdit,
      });
      toast.success(
        isEdit
          ? "Review updated. Pending approval."
          : "Review submitted. Pending approval.",
      );
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={
          triggerClassName ??
          buttonVariants({ variant: triggerVariant, size: triggerSize })
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle className="font-heading text-xl font-semibold">
          {isEdit ? "Edit your review" : `Review ${nurseFirstName}`}
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          Reviews go through a quick moderator approval before appearing on the
          nurse&apos;s public profile. You can edit while pending.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          <div>
            <Label className="mb-1.5 block">How was your experience?</Label>
            <StarRatingInput
              value={rating}
              onChange={setRating}
              disabled={pending}
            />
            {errors.rating && (
              <p className="text-destructive mt-1 text-xs">{errors.rating}</p>
            )}
          </div>

          <div>
            <Label htmlFor="reviewer_name" className="mb-1.5 block">
              Your first name
            </Label>
            <Input
              id="reviewer_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              disabled={pending}
              required
            />
            {errors.reviewer_name && (
              <p className="text-destructive mt-1 text-xs">
                {errors.reviewer_name}
              </p>
            )}
            <p className="text-muted-foreground mt-1 text-xs">
              We display your first name on the published review.
            </p>
          </div>

          <div>
            <Label htmlFor="review_text" className="mb-1.5 block">
              Your review{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="review_text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={REVIEW_TEXT_MAX}
              rows={5}
              disabled={pending}
              placeholder={`What stood out about ${nurseFirstName}? (${REVIEW_TEXT_MIN}+ characters if you write something)`}
            />
            <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
              <span>
                {errors.text ??
                  `Min ${REVIEW_TEXT_MIN} characters if you write a review`}
              </span>
              <span>
                {text.length}/{REVIEW_TEXT_MAX}
              </span>
            </div>
            {errors.text && (
              <p className="text-destructive mt-1 text-xs">{errors.text}</p>
            )}
          </div>

          {showOptIn && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={optIn}
                onCheckedChange={(v) => setOptIn(Boolean(v))}
                disabled={pending}
              />
              <span>
                I&apos;d be open to NurseDex sharing my story (we&apos;d reach
                out before using anything publicly).
              </span>
            </label>
          )}

          <div className="flex items-end justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            {/* wait, not retry (#443 phase 3). A second fire writes a second
                review, so there is nothing safe to hand back on a stall. */}
            <PendingButton
              pending={pending}
              mode="wait"
              type="submit"
              idleLabel={isEdit ? "Save changes" : "Submit review"}
              workingLabel="Sending..."
              slowLabel="Still sending..."
              outcome="your review went through"
              stalledVerb="sending"
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
