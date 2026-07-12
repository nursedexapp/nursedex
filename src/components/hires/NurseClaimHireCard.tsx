"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimHireByEmail } from "@/lib/hires/actions";
import { PendingButton } from "@/components/ui/pending-button";

interface NurseClaimHireCardProps {
  slug: string;
}

export function NurseClaimHireCard({ slug }: NurseClaimHireCardProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showShareLink, setShowShareLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const reviewUrl =
    typeof window === "undefined"
      ? `https://nursedex.com/reviews/${slug}`
      : `${window.location.origin}/reviews/${slug}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy automatically. Select and copy the link.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled submit button stops the button, not the form.
    if (pending) return;
    setError(null);
    setShowShareLink(false);
    startTransition(async () => {
      const result = await claimHireByEmail({ family_email: email });
      if (!result.success) {
        if (result.fieldErrors?.family_email) {
          setError(result.fieldErrors.family_email);
          return;
        }
        if (result.error === "email_not_found") {
          setError("We couldn't find a NurseDex account with that email.");
          setShowShareLink(true);
        } else if (result.error === "no_reveal_record") {
          setError(
            "That family is on NurseDex but hasn't unlocked your profile, so we can't auto-link this hire.",
          );
          setShowShareLink(true);
        } else if (result.error === "already_recorded") {
          setError("There's already a hire on file for that family.");
        } else if (result.error === "too_soon") {
          setError(
            "We already emailed that family recently. You can re-send again in a little while.",
          );
        } else {
          toast.error("Could not submit. Please try again.");
        }
        return;
      }
      toast.success(
        result.resent
          ? "Confirmation email re-sent to that family."
          : "Sent. We'll email the family to confirm.",
      );
      setEmail("");
    });
  };

  return (
    <Card className="border-sage/20">
      <CardContent className="space-y-3 pt-5">
        <div>
          <h3 className="font-heading text-soft-black text-base font-semibold">
            Claim a hire
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Hired off-platform but want it counted? Enter the family&apos;s
            NurseDex email and we&apos;ll ask them to confirm.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <Label htmlFor="claim_email" className="sr-only">
            Family&apos;s NurseDex email
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="claim_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="family@example.com"
              required
              disabled={pending}
            />
            {/* wait, not retry (#443 phase 5): a second fire emails the
                family a second confirmation request. */}
            <PendingButton
              pending={pending}
              mode="wait"
              type="submit"
              idleLabel="Submit"
              workingLabel="Sending..."
              slowLabel="Still sending..."
              stalledMessage="This is still sending. Refresh to check whether the family was emailed before trying again."
              disabled={!email}
            />
          </div>
          {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
        </form>

        {showShareLink && (
          <div className="border-sage/20 bg-sage/5 space-y-2 rounded-lg border p-3">
            <p className="text-soft-black text-xs">
              If you worked with them off NurseDex, share your review link
              instead, they can leave a review with no NurseDex account needed.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={reviewUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="text-xs"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={copyLink}
                aria-label="Copy review link"
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
