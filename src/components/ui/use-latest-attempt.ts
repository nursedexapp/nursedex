"use client";

import { useCallback, useRef } from "react";

/**
 * Tell the newest attempt at an action apart from the ones it superseded.
 *
 * The thing that makes a retry button hard (#669): pressing "Try again" does NOT
 * cancel the request that stalled. An in-flight server action cannot be recalled.
 * The hung one is still out there and can land at any moment, AFTER the retry has
 * already come back, and if it is allowed to speak it contradicts the retry:
 *
 *   - a superseded upload adds the photo a second time,
 *   - a superseded delete toasts a failure over work the retry actually did,
 *   - a superseded toggle overwrites the retry's result with a stale one.
 *
 * So every attempt takes a number, and only the newest one may report or touch
 * the surface. A superseded attempt still runs to completion (nothing can stop
 * it), it simply keeps quiet.
 *
 * PhotoUpload worked this out first and kept it to itself; every retry-mode
 * surface needs it, so it lives here now.
 *
 * Usage:
 *   const { begin, isLatest } = useLatestAttempt();
 *   const attempt = begin();
 *   const res = await save();
 *   if (!isLatest(attempt)) return;   // a retry has taken over. Say nothing.
 */
export function useLatestAttempt() {
  // A ref, not state: the guard is read inside an async closure that would
  // otherwise capture a stale value, and bumping it must never trigger a render.
  const latest = useRef(0);

  const begin = useCallback(() => ++latest.current, []);

  const isLatest = useCallback(
    (attempt: number) => attempt === latest.current,
    [],
  );

  return { begin, isLatest };
}
