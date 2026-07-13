"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePendingPhase } from "@/components/ui/pending-button";
import { stalledMessageFor } from "@/components/ui/stalled-copy";
import { signOut } from "@/lib/auth/actions";
import { resetPostHog } from "@/lib/posthog";
import { cn } from "@/lib/utils";

/**
 * The one sign-out button (#659).
 *
 * There were four (the nurse sidebar, the admin sidebar, the mobile nav and the
 * settings page) and none of them tracked pending state at all: each was a bare
 * `<form action={signOut}>`, so a hung sign-out looked exactly like a button
 * nobody had pressed. Nothing on screen moved. The lint rule added in #659 is
 * what surfaced the other three, after the first was fixed by hand.
 *
 * `wait`, not `retry`, in line with the rest of the milestone: a retry does not
 * cancel the first request, so a hung one can still land afterwards (#669).
 *
 * These keep their own markup rather than taking PendingButton's, because one is
 * a nav item and one is an outline button, so they borrow the shared clock
 * instead. The form action became an explicit handler because a component that
 * holds phase state cannot read useFormStatus (see the note on PendingButton),
 * and every one of these screens is behind auth and JavaScript anyway.
 */
export function SignOutButton({
  variant = "nav",
  onNavigate,
  className,
}: {
  /** "nav" for a sidebar row, "button" for a standalone outline button. */
  variant?: "nav" | "button";
  /** Close the mobile drawer, etc. */
  onNavigate?: () => void;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const { phase, restart } = usePendingPhase({ pending });
  const stalled = phase === "stalled";

  // retry, not wait (#669 phase 5). Signing out is idempotent: a second call ends
  // the same session the first was ending, so there was never anything here to
  // protect. Telling a stuck user to refresh, when we could just sign them out,
  // was the whole cost of being cautious.
  async function handleSignOut() {
    // The gate is the handler, not the disabled attribute. But a STALLED action
    // is exactly the case where firing again is the point.
    if (pending && !stalled) return;
    if (stalled) restart();
    setPending(true);
    onNavigate?.();
    resetPostHog();
    await signOut();
  }

  const label = stalled ? "Try again" : pending ? "Signing out..." : "Sign out";
  const icon =
    pending && !stalled ? (
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
    ) : (
      <LogOut className="size-4" aria-hidden="true" />
    );

  return (
    <div className={className}>
      {stalled && (
        <p role="alert" className="text-error mb-1 px-3 text-xs">
          {stalledMessageFor("retry", "you were signed out", "signing out")}
        </p>
      )}

      {variant === "button" ? (
        <Button
          type="button"
          variant="outline"
          onClick={handleSignOut}
          disabled={pending && !stalled}
          className="w-full sm:w-auto"
        >
          <span className="mr-1.5">{icon}</span>
          {label}
        </Button>
      ) : (
        <button
          type="button"
          onClick={handleSignOut}
          disabled={pending && !stalled}
          className={cn(
            "text-muted-foreground hover:bg-sage/10 hover:text-foreground flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50",
          )}
        >
          {icon}
          {label}
        </button>
      )}
    </div>
  );
}
