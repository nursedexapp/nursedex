"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toggleAvailability } from "@/lib/profile/actions";
import { cn } from "@/lib/utils";
import { Copy, Link2, UserCheck, UserX } from "lucide-react";

interface QuickActionsProps {
  slug: string;
  isAvailable: boolean;
  tier: "free" | "featured";
}

export function QuickActions({
  slug,
  isAvailable: initialAvailable,
  tier,
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
    toast.success("Profile link copied to clipboard");
  };

  return (
    <Card className="border-sage/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quick Actions</CardTitle>
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
              <UserCheck className="size-4 text-emerald-500" />
              <span>Accepting new clients</span>
              <span className="ml-auto text-xs text-muted-foreground">
                Turn off
              </span>
            </>
          ) : (
            <>
              <UserX className="size-4 text-muted-foreground" />
              <span>Not accepting clients</span>
              <span className="ml-auto text-xs text-muted-foreground">
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
          <Copy className="ml-auto size-3.5 text-muted-foreground" />
        </Button>

        {/* Invite reviews (placeholder for Phase 5) */}
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          disabled
        >
          <span className="text-muted-foreground">Invite past clients to review</span>
          <span className="ml-auto rounded bg-sage/20 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Soon
          </span>
        </Button>
      </CardContent>
    </Card>
  );
}
