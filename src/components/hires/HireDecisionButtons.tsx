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
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  // WHICH decision is in flight, not merely that one is: a single flag would put
  // "Recording..." on the button the family did not press. Same need turned up on
  // three admin surfaces, so it is a shared hook now (#658).
  const { inFlight, busy, run, retry } = useInFlight<Decision>();

  const decide = (
    fn: typeof confirmHireFromToken | typeof rejectHireFromToken,
    label: string,
    outcome: Decision,
    viaRetry = false,
  ) => {
    // `run` refuses re-entry, which is what stops the family answering both ways
    // at once. A retry needs the other door (#669).
    const start = viaRetry ? retry : run;

    start(outcome, async (isLatest) => {
      const result = await fn({ token });

      // Superseded by a retry: this attempt no longer owns the surface.
      if (!isLatest()) return;

      if (!result.success) {
        // NOT a failure (#669). wrong_state means the row is no longer `claimed`,
        // so this hire has already been answered: most likely by an attempt of
        // theirs that hung and landed after all, which is precisely what a retry
        // provokes. Telling them it failed would be a lie.
        //
        // It deliberately does NOT claim their outcome. wrong_state cannot tell
        // "already confirmed" from "already rejected", so asserting the button
        // they just pressed could announce the opposite of what was recorded.
        if (result.error === "wrong_state") {
          setAlreadyAnswered(true);
          return;
        }
        toast.error(`Could not ${label.toLowerCase()}. Please try again.`);
        return;
      }
      // Show the result in place. Don't refresh: confirming/rejecting clears
      // the single-use token, so a re-query would 404 as "Link not valid".
      setDecided(outcome);
    });
  };

  if (alreadyAnswered) {
    return (
      <div className="border-sage/20 bg-sage/5 flex items-start gap-2 rounded-lg border p-3">
        <CircleCheck className="text-teal mt-0.5 size-5 shrink-0" />
        <p className="text-soft-black text-sm">
          This hire has already been answered, so your first attempt did go
          through. No further action needed.
        </p>
      </div>
    );
  }

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
      {/* retry, not wait (#669). A repeat cannot double-answer: the guarded
          status update only applies to a row still `claimed`, and a repeat now
          reports the already-answered that it is rather than a failure. */}
      <PendingButton
        pending={inFlight === "confirmed"}
        mode="retry"
        idleLabel="Yes, I hired them"
        workingLabel="Recording..."
        slowLabel="Still recording..."
        disabled={busy && inFlight !== "confirmed"}
        onClick={() => decide(confirmHireFromToken, "Confirm", "confirmed")}
        onRetry={() =>
          decide(confirmHireFromToken, "Confirm", "confirmed", true)
        }
      />
      <PendingButton
        pending={inFlight === "rejected"}
        mode="retry"
        variant="outline"
        idleLabel="No, I didn't"
        workingLabel="Recording..."
        slowLabel="Still recording..."
        disabled={busy && inFlight !== "rejected"}
        onClick={() => decide(rejectHireFromToken, "Reject", "rejected")}
        onRetry={() => decide(rejectHireFromToken, "Reject", "rejected", true)}
      />
    </div>
  );
}
