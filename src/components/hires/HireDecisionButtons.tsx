"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmHireFromToken, rejectHireFromToken } from "@/lib/hires/actions";

interface HireDecisionButtonsProps {
  token: string;
}

export function HireDecisionButtons({ token }: HireDecisionButtonsProps) {
  const [pending, startTransition] = useTransition();
  const [decided, setDecided] = useState<null | "confirmed" | "rejected">(null);

  const decide = (
    fn: typeof confirmHireFromToken | typeof rejectHireFromToken,
    label: string,
    outcome: "confirmed" | "rejected",
  ) => {
    startTransition(async () => {
      const result = await fn({ token });
      if (!result.success) {
        toast.error(`Could not ${label.toLowerCase()}. Please try again.`);
        return;
      }
      // Show the result in place. Don't refresh: confirming/rejecting clears
      // the single-use token, so a re-query would 404 as "Link not valid".
      setDecided(outcome);
    });
  };

  if (decided) {
    return (
      <div className="border-sage/20 bg-sage/5 flex items-start gap-2 rounded-lg border p-3">
        <CircleCheck className="text-teal mt-0.5 size-5 shrink-0" />
        <p className="text-soft-black text-sm">
          {decided === "confirmed"
            ? "Thanks, we've recorded this hire. It now counts toward their NurseDex stats, and we may follow up for a review."
            : "Thanks, we won't record this hire. No further action needed."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => decide(confirmHireFromToken, "Confirm", "confirmed")}
        disabled={pending}
      >
        Yes, I hired them
      </Button>
      <Button
        variant="outline"
        onClick={() => decide(rejectHireFromToken, "Reject", "rejected")}
        disabled={pending}
      >
        No, I didn&apos;t
      </Button>
    </div>
  );
}
