"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toggleAvailability } from "@/lib/profile/actions";
import { Copy, Link2, UserCheck, UserX } from "lucide-react";

interface QuickActionsProps {
  slug: string;
  isAvailable: boolean;
}

export function QuickActions({
  slug,
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

  const handleCopyProfileLink = () => {
    const url = `https://nursedex.com/nurses/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <Card className="border-sage/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">What you can do</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Availability toggle */}
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

        {/* Share profile */}
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleCopyProfileLink}
        >
          <Link2 className="size-4" />
          Share my profile
          <Copy className="text-muted-foreground ml-auto size-3.5" />
        </Button>

        {/* Invite reviews (placeholder for Phase 5) */}
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          disabled
        >
          <span className="text-muted-foreground">
            Invite past clients to review
          </span>
          <span className="bg-sage/20 text-muted-foreground ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium">
            Soon
          </span>
        </Button>
      </CardContent>
    </Card>
  );
}
