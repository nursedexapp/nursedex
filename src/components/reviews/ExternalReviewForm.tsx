"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PendingButton } from "@/components/ui/pending-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { StarRatingInput } from "./StarRatingInput";
import { REVIEW_TEXT_MAX, REVIEW_TEXT_MIN } from "@/lib/schemas/review";
import { submitExternalReview } from "@/lib/reviews/external-actions";

interface ExternalReviewFormProps {
  linkToken: string;
  nurseFirstName: string;
}

export function ExternalReviewForm({
  linkToken,
  nurseFirstName,
}: ExternalReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [text, setText] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [pending, startTransition] = useTransition();

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
      link_token: linkToken,
      rating,
      reviewer_name: name,
      reviewer_email: email,
      text,
      testimonial_opt_in: optIn,
    };

    startTransition(async () => {
      const result = await submitExternalReview(payload);
      if (!result.success) {
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
          return;
        }
        if (result.error === "link_invalid") {
          toast.error(
            "This review link is no longer accepting submissions. Please contact the nurse for a new link.",
          );
        } else {
          toast.error("Could not submit your review. Please try again.");
        }
        return;
      }
      setSubmittedEmail(email);
      setSubmitted(true);
    });
  };

  if (submitted) {
    return (
      <div className="space-y-3 py-2 text-sm">
        <h2 className="font-heading text-lg font-semibold">Check your inbox</h2>
        <p className="text-soft-black-light">
          We sent a confirmation email to{" "}
          <span className="font-medium">{submittedEmail}</span>. Click the link
          inside to confirm your review. The link expires in 7 days.
        </p>
        <p className="text-soft-black-light">
          After you confirm, a moderator will take a quick look before it shows
          up on {nurseFirstName}&apos;s profile.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
        <Label htmlFor="ext_name" className="mb-1.5 block">
          Your first name
        </Label>
        <Input
          id="ext_name"
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
        <Label htmlFor="ext_email" className="mb-1.5 block">
          Your email
        </Label>
        <Input
          id="ext_email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          required
        />
        {errors.reviewer_email && (
          <p className="text-destructive mt-1 text-xs">
            {errors.reviewer_email}
          </p>
        )}
        <p className="text-muted-foreground mt-1 text-xs">
          We use this only to confirm your review. We never publish it.
        </p>
      </div>

      <div>
        <Label htmlFor="ext_text" className="mb-1.5 block">
          Your review <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="ext_text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={REVIEW_TEXT_MAX}
          rows={5}
          disabled={pending}
          placeholder={`What stood out about working with ${nurseFirstName}? (${REVIEW_TEXT_MIN}+ characters if you write something)`}
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
      </div>

      {showOptIn && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={optIn}
            onCheckedChange={(v) => setOptIn(Boolean(v))}
            disabled={pending}
          />
          <span>
            I&apos;d be open to NurseDex sharing my story (we&apos;d reach out
            before using anything publicly).
          </span>
        </label>
      )}

      {/* wait, not retry (#443 phase 3). A second fire writes a second review
          and sends a second confirmation email, so a stall never hands the
          button back. */}
      <PendingButton
        pending={pending}
        mode="wait"
        type="submit"
        idleLabel="Submit review"
        workingLabel="Sending..."
        slowLabel="Still sending..."
        outcome="your review went through"
        stalledVerb="sending"
        className="w-full"
      />
    </form>
  );
}
