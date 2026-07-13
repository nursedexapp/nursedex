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
  const { phase } = usePendingPhase({ pending });
  const stalled = phase === "stalled";

  async function handleSignOut() {
    if (pending) return;
    setPending(true);
    onNavigate?.();
    resetPostHog();
    await signOut();
  }

  const label = pending ? "Signing out..." : "Sign out";
  const icon = pending ? (
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
          disabled={pending}
          className="w-full sm:w-auto"
        >
          <span className="mr-1.5">{icon}</span>
          {label}
        </Button>
      ) : (
        <button
          type="button"
          onClick={handleSignOut}
          disabled={pending}
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
