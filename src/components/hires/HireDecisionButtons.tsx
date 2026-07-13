"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";
import { PendingButton } from "@/components/ui/pending-button";
import { useInFlight } from "@/components/ui/use-in-flight";
import { confirmHireFromToken, rejectHireFromToken } from "@/lib/hires/actions";

interface HireDecisionButtonsProps {
  token: string;
}

type Decision = "confirmed" | "rejected";

// wait, not retry (#443 phase 3). Confirming writes a hire row and sends email
// (#651), so a second fire is a second hire, not a harmless repeat.

export function HireDecisionButtons({ token }: HireDecisionButtonsProps) {
  const [decided, setDecided] = useState<null | Decision>(null);
  // WHICH decision is in flight, not merely that one is: a single flag would put
  // "Recording..." on the button the family did not press. Same need turned up on
  // three admin surfaces, so it is a shared hook now (#658).
  const { inFlight, busy, run } = useInFlight<Decision>();

  const decide = (
    fn: typeof confirmHireFromToken | typeof rejectHireFromToken,
    label: string,
    outcome: Decision,
  ) =>
    run(outcome, async () => {
      const result = await fn({ token });
      if (!result.success) {
        toast.error(`Could not ${label.toLowerCase()}. Please try again.`);
        return;
      }
      // Show the result in place. Don't refresh: confirming/rejecting clears
      // the single-use token, so a re-query would 404 as "Link not valid".
      setDecided(outcome);
    });

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
    <div className="flex items-end gap-2">
      <PendingButton
        pending={inFlight === "confirmed"}
        mode="wait"
        idleLabel="Yes, I hired them"
        workingLabel="Recording..."
        slowLabel="Still recording..."
        outcome="your answer went through"
        disabled={busy}
        onClick={() => decide(confirmHireFromToken, "Confirm", "confirmed")}
      />
      <PendingButton
        pending={inFlight === "rejected"}
        mode="wait"
        variant="outline"
        idleLabel="No, I didn't"
        workingLabel="Recording..."
        slowLabel="Still recording..."
        outcome="your answer went through"
        disabled={busy}
        onClick={() => decide(rejectHireFromToken, "Reject", "rejected")}
      />
    </div>
  );
}
