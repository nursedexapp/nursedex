"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import { Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePendingPhase } from "@/components/ui/pending-button";
import { toggleSavedNurse } from "@/lib/nurses/saves-actions";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

interface SaveHeartButtonProps {
  nurseUserId: string;
  initialIsSaved: boolean;
  anonRedirectTo?: string;
  className?: string;
  /**
   * True when this card sits in a grid that only shows saved nurses. Unsaving
   * there has to refresh the route: the card belongs to a list it is no longer
   * a member of, and local state alone would leave it sitting in a grid that
   * claims to show only saves (#776).
   */
  inSavedOnlyView?: boolean;
}

export function SaveHeartButton({
  nurseUserId,
  initialIsSaved,
  anonRedirectTo,
  className,
  inSavedOnlyView,
}: SaveHeartButtonProps) {
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(initialIsSaved);
  const [isPending, startTransition] = useTransition();
  // What the heart showed before the optimistic flip, so a stall can put it back.
  // A ref, not state: it must not cause a render of its own.
  const beforeOptimistic = useRef(initialIsSaved);

  // The heart is an icon in the corner of a card and cannot carry PendingButton's
  // stall panel, so it borrows the same clock and renders its own (#443 phase 3).
  const { phase } = usePendingPhase({ pending: isPending });
  const stalled = phase === "stalled";

  useEffect(() => {
    if (!stalled) return;
    // We do not know whether the save landed, and a filled heart is a claim we
    // cannot back. Roll it back and say we could not confirm it.
    //
    // The button stays DEAD either way. toggleSavedNurse reads the current row
    // and flips it, so a second fire on top of a first that eventually lands is
    // an UNSAVE: it would quietly undo the very thing the family asked for. A
    // refresh is the only safe way back in.
    setIsSaved(beforeOptimistic.current);
    toast.error("We couldn't confirm that. Refresh to check your saved list.");
  }, [stalled]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (anonRedirectTo) {
      router.push(anonRedirectTo);
      return;
    }

    const previous = isSaved;
    const next = !previous;
    beforeOptimistic.current = previous;
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
      // The grid's membership changed, not just this heart.
      if (inSavedOnlyView) router.refresh();
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

  const label = stalled
    ? "Still saving. Refresh to check your saved list."
    : isSaved
      ? "Unsave this nurse"
      : "Save this nurse";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-busy={isPending || undefined}
      aria-pressed={isSaved}
      aria-label={label}
      title={stalled ? label : undefined}
      className={cn(
        "border-sage/20 text-soft-black-light hover:text-teal focus-visible:ring-teal flex size-9 cursor-pointer items-center justify-center rounded-full border bg-white/95 shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-wait",
        className,
      )}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Heart
          className={cn(
            "size-4 transition-all",
            isSaved ? "fill-red-500 text-red-500" : "",
          )}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
