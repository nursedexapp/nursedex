"use client";

import { useCallback, useRef, useState, useTransition } from "react";

import { useLatestAttempt } from "@/components/ui/use-latest-attempt";

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
 * `retry` is the ONE way past that gate (#669). A retry-mode button offers "Try
 * again" on a stalled action, and `run` would refuse it: the user would press it
 * and nothing at all would happen. It is a separate door on purpose, so opening
 * it for a retry does not also open it for the neighbouring button.
 *
 * Usage:
 *   const { inFlight, busy, run, retry } = useInFlight<"approve" | "reject">();
 *   <PendingButton pending={inFlight === "approve"} disabled={busy} ... />
 */

/**
 * The action, handed a way to ask whether it still owns the surface.
 *
 * A superseded attempt cannot be cancelled, so it has to check before it speaks.
 */
type InFlightAction = (isLatest: () => boolean) => Promise<unknown>;

export function useInFlight<T extends string>() {
  const [inFlight, setInFlight] = useState<T | null>(null);
  const [, startTransition] = useTransition();
  // The gate reads a ref, not the state: `inFlight` is captured by the closure
  // and would be stale for a second call in the same tick.
  const running = useRef(false);
  const { begin, isLatest } = useLatestAttempt();

  const start = useCallback(
    (key: T, action: InFlightAction, superseding: boolean) => {
      if (running.current && !superseding) return;
      running.current = true;
      const attempt = begin();
      // Set OUTSIDE the transition. State set inside one is deferred, which is
      // the trap the pending primitive documents (#444).
      setInFlight(key);

      startTransition(async () => {
        try {
          await action(() => isLatest(attempt));
        } finally {
          // Only the newest attempt owns the surface. The request a retry
          // superseded is still in flight and will land eventually; when it does
          // it must not hand the buttons back, because the retry is still
          // working and every control would come alive underneath it (#669).
          if (isLatest(attempt)) {
            running.current = false;
            setInFlight(null);
          }
        }
      });
    },
    [begin, isLatest],
  );

  const run = useCallback(
    (key: T, action: InFlightAction) => start(key, action, false),
    [start],
  );

  /**
   * Fire again, superseding whatever is still in flight.
   *
   * Only for an action that is safe to run twice. The stalled request is NOT
   * cancelled by this: it is still out there and may still land. It is merely
   * silenced, via the `isLatest` its own closure holds.
   */
  const retry = useCallback(
    (key: T, action: InFlightAction) => start(key, action, true),
    [start],
  );

  return { inFlight, busy: inFlight !== null, run, retry };
}
