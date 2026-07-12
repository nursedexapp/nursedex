"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// The one pending primitive (#654, phase 0 of #443).
//
// Every async button in the app hand-rolled this: 27 with useTransition, 43 with
// a local flag, a handful with useFormStatus. A hung server action looked exactly
// like a working one, the same spinner forever, with nothing to click. Started,
// still-alive and failed have to be three visibly different things.

/** When a slow action stops being reassuring and starts needing acknowledgement. */
export const SLOW_MS = 1_500;

/**
 * When an action is treated as dead rather than merely slow.
 *
 * Deliberately conservative. Signup waits on Supabase plus an email hook plus
 * Resend, and login stays pending through the redirect and the dashboard render,
 * so a tighter threshold would show a false "this failed" to real users on a
 * cold start. A stall accusing a WORKING action is worse than the bug being
 * fixed, so this sits above how long these actions can legitimately take.
 */
export const STALL_MS = 22_000;

export type PendingPhase = "idle" | "working" | "slow" | "stalled";

/**
 * How the button behaves once an action has stalled.
 *
 * `retry`: hand the button back and let them fire it again. Only for actions
 * that are safe to run twice (a save, an upsert).
 *
 * `wait`: keep the button DISABLED and tell them what is happening. For actions
 * where a second fire duplicates a side effect: a second reveal burns one of the
 * family's capped daily reveals (#653), a second admin approve re-sends a nurse
 * her verification email (#652), a second hire writes a second hire row (#651).
 * Declining to auto-refire is not enough on its own; the button underneath has to
 * be unclickable, or the user simply does the double fire by hand.
 */
export type StallMode = "retry" | "wait";

interface UsePendingPhase {
  pending: boolean;
  slowAfterMs?: number;
  stallAfterMs?: number;
}

/**
 * Derive the phase from a pending signal the caller already has, whatever it
 * came from (useTransition's isPending, a local flag, a promise).
 *
 * The timers live in an effect, OUTSIDE the transition. That is the difference
 * from the bug in #444, where state set inside a form action was deferred by
 * React and never committed.
 *
 * The effect keys on the attempt as well as on `pending`. It has to: a hung
 * request never stops being pending, so keying on `pending` alone means a retry
 * never re-runs the effect, the stall message stays on screen, and the user fires
 * request after request into a screen that does not change. `restart()` is what
 * puts the clock back to zero.
 */
export function usePendingPhase({
  pending,
  slowAfterMs = SLOW_MS,
  stallAfterMs = STALL_MS,
}: UsePendingPhase) {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<PendingPhase>("idle");

  useEffect(() => {
    if (!pending) {
      setPhase("idle");
      return;
    }

    setPhase("working");
    const slow = setTimeout(() => setPhase("slow"), slowAfterMs);
    const stalled = setTimeout(() => setPhase("stalled"), stallAfterMs);

    // These buttons redirect on success, so the component unmounts while still
    // pending. Without this the timers outlive it.
    return () => {
      clearTimeout(slow);
      clearTimeout(stalled);
    };
  }, [pending, attempt, slowAfterMs, stallAfterMs]);

  const restart = useCallback(() => setAttempt((a) => a + 1), []);

  return { phase, restart };
}

// WHY THIS TAKES `pending` RATHER THAN READING useFormStatus ITSELF
//
// It cannot read it. useFormStatus reports pending only while the component is
// rendering inside the form's transition, and ANY local state update in that
// component knocks it out: a bare component with the hook goes pending on submit,
// but add one useState plus an effect keyed on pending and the hook reports idle
// again, mid-flight. Verified directly (#655). Since this component's whole job
// is to hold phase state, it can never be the one calling the hook.
//
// So callers own the pending signal (useTransition, or a local flag). The auth
// screens already pass a client function to `action`, so they never worked
// without JavaScript anyway, and converting them to an explicit handler costs
// nothing.
interface PendingButtonProps {
  pending: boolean;
  mode: StallMode;
  idleLabel: string;
  workingLabel: string;
  /** Shown once the action is slow. Defaults to the working label. */
  slowLabel?: string;
  /** What a stalled action tells the user. Sensible default per mode. */
  stalledMessage?: string;
  onClick?: () => void;
  /** Fired when the user retries a stalled action. `retry` mode only. */
  onRetry?: () => void;
  className?: string;
  type?: "button" | "submit";
  slowAfterMs?: number;
  stallAfterMs?: number;
}

export function PendingButton({
  pending,
  mode,
  idleLabel,
  workingLabel,
  slowLabel,
  stalledMessage,
  onClick,
  onRetry,
  className,
  type = "button",
  slowAfterMs,
  stallAfterMs,
}: PendingButtonProps) {
  const { phase, restart } = usePendingPhase({
    pending,
    slowAfterMs,
    stallAfterMs,
  });
  const alertRef = useRef<HTMLDivElement>(null);

  const stalled = phase === "stalled";
  const canRetry = stalled && mode === "retry";

  useEffect(() => {
    // Move focus to the alert when an action stalls. A keyboard or screen reader
    // user lost focus to <body> the moment the button was disabled; without this
    // the retry is announced to nobody and has to be hunted for by tabbing.
    if (stalled) requestAnimationFrame(() => alertRef.current?.focus());
  }, [stalled]);

  const message =
    stalledMessage ??
    (mode === "retry"
      ? "This is taking longer than usual. You can try again."
      : "This is still processing. Please do not close this page. Refresh to check whether it went through.");

  function handleClick() {
    if (canRetry) {
      restart();
      onRetry?.();
      return;
    }
    onClick?.();
  }

  return (
    <div>
      {phase === "slow" && (
        <div
          role="status"
          aria-live="polite"
          className="text-muted-foreground mb-2 text-sm"
        >
          {slowLabel ?? workingLabel}
        </div>
      )}

      {stalled && (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="bg-error/10 text-error mb-3 rounded-lg px-4 py-3 text-base outline-none"
        >
          {message}
        </div>
      )}

      <Button
        type={type}
        onClick={handleClick}
        // In `wait` mode the button stays disabled for as long as the action is
        // in flight, stalled or not. Re-enabling it would hand back a control
        // that fires the side effect a second time.
        disabled={pending && !canRetry}
        className={className}
      >
        {pending && !stalled && (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        )}
        {canRetry ? "Try again" : pending ? workingLabel : idleLabel}
      </Button>
    </div>
  );
}
