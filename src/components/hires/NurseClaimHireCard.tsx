"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimHireByEmail } from "@/lib/hires/actions";

export function NurseClaimHireCard() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await claimHireByEmail({ family_email: email });
      if (!result.success) {
        if (result.fieldErrors?.family_email) {
          setError(result.fieldErrors.family_email);
          return;
        }
        if (result.error === "email_not_found") {
          setError("No NurseDex account with that email.");
        } else if (result.error === "no_reveal_record") {
          setError(
            "That family is on NurseDex but hasn't revealed your contact info yet, so we can't link this hire. Ask them to subscribe and unlock your profile first.",
          );
        } else if (result.error === "already_recorded") {
          setError("There's already a hire on file for that family.");
        } else {
          toast.error("Could not submit. Please try again.");
        }
        return;
      }
      toast.success("Sent. We'll email the family to confirm.");
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
            <Button type="submit" size="sm" disabled={pending || !email}>
              {pending ? "Sending..." : "Submit"}
            </Button>
          </div>
          {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
