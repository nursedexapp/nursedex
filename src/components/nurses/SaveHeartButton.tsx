"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type MouseEvent } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toggleSavedNurse } from "@/lib/nurses/saves-actions";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

interface SaveHeartButtonProps {
  nurseUserId: string;
  initialIsSaved: boolean;
  // When provided, treats the viewer as anonymous, clicking redirects to
  // signup instead of calling the action.
  anonRedirectTo?: string;
  className?: string;
}

export function SaveHeartButton({
  nurseUserId,
  initialIsSaved,
  anonRedirectTo,
  className,
}: SaveHeartButtonProps) {
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(initialIsSaved);
  const [isPending, startTransition] = useTransition();

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (anonRedirectTo) {
      router.push(anonRedirectTo);
      return;
    }

    const previous = isSaved;
    const next = !previous;
    setIsSaved(next); // optimistic

    startTransition(async () => {
      const result = await toggleSavedNurse(nurseUserId);
      if (!result.success) {
        setIsSaved(previous);
        toast.error(
          result.error === "not_authenticated"
            ? "Log in to save nurses"
            : "Couldn't update your saved list",
        );
        return;
      }
      setIsSaved(result.isSaved);
      toast.success(
        result.isSaved ? "Saved to your list" : "Removed from your list",
      );
      if (posthog.__loaded) {
        posthog.capture(
          result.isSaved
            ? ANALYTICS_EVENTS.NURSE_SAVED
            : ANALYTICS_EVENTS.NURSE_UNSAVED,
          { nurse_user_id: nurseUserId },
        );
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={isSaved}
      aria-label={isSaved ? "Unsave this nurse" : "Save this nurse"}
      className={cn(
        "border-sage/20 text-soft-black-light hover:text-teal focus-visible:ring-teal flex size-9 cursor-pointer items-center justify-center rounded-full border bg-white/95 shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-wait",
        className,
      )}
    >
      <Heart
        className={cn(
          "size-4 transition-all",
          isSaved ? "fill-red-500 text-red-500" : "",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
