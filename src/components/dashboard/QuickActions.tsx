"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toggleAvailability } from "@/lib/profile/actions";
import { UserCheck, UserX } from "lucide-react";

interface QuickActionsProps {
  isAvailable: boolean;
}

/**
 * Day-to-day availability toggle. Used to also include "Share my
 * profile" and "Invite past clients to review" buttons, but the hero
 * already has a Copy my profile link CTA and ReviewLinkCard sits
 * directly below — those duplicates have been removed.
 */
export function QuickActions({
  isAvailable: initialAvailable,
}: QuickActionsProps) {
  const [isAvailable, setIsAvailable] = useState(initialAvailable);
  const [toggling, setToggling] = useState(false);

  const handleToggleAvailability = async () => {
    setToggling(true);
    const newValue = !isAvailable;
    const result = await toggleAvailability(newValue);

    if (result.error) {
      toast.error(result.error);
    } else {
      setIsAvailable(newValue);
      toast.success(result.success);
    }
    setToggling(false);
  };

  return (
    <Card className="border-sage/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Availability</CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleToggleAvailability}
          disabled={toggling}
        >
          {isAvailable ? (
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
