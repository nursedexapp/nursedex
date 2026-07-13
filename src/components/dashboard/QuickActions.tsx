"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePendingPhase } from "@/components/ui/pending-button";
import { useLatestAttempt } from "@/components/ui/use-latest-attempt";
import { stalledMessageFor } from "@/components/ui/stalled-copy";
import { toggleAvailability } from "@/lib/profile/actions";
import { UserCheck, UserX, Loader2 } from "lucide-react";

interface QuickActionsProps {
  isAvailable: boolean;
}

/**
 * Day-to-day availability toggle. Used to also include "Share my
 * profile" and "Invite past clients to review" buttons, but the hero
 * already has a Copy my profile link CTA and ReviewLinkCard sits
 * directly below. Those duplicates have been removed.
 */
export function QuickActions({
  isAvailable: initialAvailable,
}: QuickActionsProps) {
  const [isAvailable, setIsAvailable] = useState(initialAvailable);
  const [toggling, setToggling] = useState(false);

  // This button carries an icon and a right-aligned hint, so it keeps its own
  // markup and borrows the shared clock rather than taking PendingButton's
  // layout (#443 phase 5).
  //
  // retry, not wait (#669 phase 5). Two things make it safe.
  //
  // The action takes an ABSOLUTE value, not "flip it", and `isAvailable` only
  // moves on success. So a retry after a hung attempt asks for the same target
  // again rather than flipping availability back off, which is what a real toggle
  // would have done.
  //
  // And the retry does not cancel the first request, which is still out there and
  // can land afterwards. The newest-attempt guard (#690) is what stops it toasting
  // over the retry's result.
  const { phase, restart } = usePendingPhase({ pending: toggling });
  const stalled = phase === "stalled";
  const { begin, isLatest } = useLatestAttempt();

  const handleToggleAvailability = async () => {
    // The handler is the gate. A STALLED action is the one case where firing
    // again is exactly the point.
    if (toggling && !stalled) return;
    if (stalled) restart();

    const attempt = begin();
    setToggling(true);
    const newValue = !isAvailable;
    const result = await toggleAvailability(newValue);

    // Superseded by a retry: this attempt no longer owns the button.
    if (!isLatest(attempt)) return;
    setToggling(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      setIsAvailable(newValue);
      toast.success(result.success);
    }
  };

  return (
    <Card className="border-sage/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Availability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {phase === "slow" && (
          <p
            role="status"
            aria-live="polite"
            className="text-muted-foreground text-sm"
          >
            Still saving...
          </p>
        )}
        {stalled && (
          <div
            role="alert"
            className="bg-error/10 text-error rounded-lg px-3 py-2 text-sm"
          >
            {stalledMessageFor("retry", "your availability changed", "saving")}
          </div>
        )}
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleToggleAvailability}
          disabled={toggling && !stalled}
        >
          {stalled ? (
            <span>Try again</span>
          ) : toggling ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : isAvailable ? (
            <>
              <UserCheck className="text-success size-4" />
              <span>Accepting new clients</span>
              <span className="text-muted-foreground ml-auto text-xs">
                Turn off
              </span>
            </>
          ) : (
            <>
              <UserX className="text-muted-foreground size-4" />
              <span>Not accepting clients</span>
              <span className="text-muted-foreground ml-auto text-xs">
                Turn on
              </span>
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
