"use client";

import { useCallback, useRef, useState, useTransition } from "react";

/**
 * Tracks WHICH keyed action is in flight on a surface that has several.
 *
 * A single `pending` flag is not enough once a surface has more than one async
 * control. It puts the working label on the button nobody pressed, and it leaves
 * the neighbours live, so an admin can reject a review while the approve is
 * still in flight and fire two conflicting writes at one row. Hand-rolled three
 * times (hire confirm/reject, review approve/reject, comment moderation) before
 * being pulled out here.
 *
 * `run` is also the gate, not just the label. A `disabled` attribute is an
 * affordance; anything that reaches the handler another way would otherwise fire
 * a second write while the first is still out there, and an in-flight server
 * action cannot be recalled (#443).
 *
 * Usage:
 *   const { inFlight, busy, run } = useInFlight<"approve" | "reject">();
 *   <PendingButton pending={inFlight === "approve"} disabled={busy} ... />
 */
export function useInFlight<T extends string>() {
  const [inFlight, setInFlight] = useState<T | null>(null);
  const [, startTransition] = useTransition();
  // The gate reads a ref, not the state: `inFlight` is captured by the closure
  // and would be stale for a second call in the same tick.
  const running = useRef(false);

  const run = useCallback((key: T, action: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    // Set OUTSIDE the transition. State set inside one is deferred, which is the
    // trap the pending primitive documents (#444).
    setInFlight(key);

    startTransition(async () => {
      try {
        await action();
      } finally {
        running.current = false;
        setInFlight(null);
      }
    });
  }, []);

  return { inFlight, busy: inFlight !== null, run };
}
