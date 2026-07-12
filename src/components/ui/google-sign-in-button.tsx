"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithGoogle } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

/**
 * How long to wait before treating a sign-in that has not come back as stalled.
 *
 * A successful start never returns: it redirects to Google. So "no answer" is
 * indistinguishable from "still working", and without a deadline a request that
 * dies on the way out leaves the button spinning forever with nothing to click
 * (#444). This is what turns that into an error the user can act on.
 */
export const STALL_MS = 15_000;

export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which attempt is current. A stalled request cannot be cancelled, so if it
  // ever does come back after the user has moved on, its answer must not
  // overwrite what a newer attempt is showing.
  const attempt = useRef(0);

  useEffect(() => {
    // Coming back to the tab (the user closed Google's window, or hit back)
    // means the sign-in never happened, so give them the button back.
    function resetLoading() {
      if (document.visibilityState === "visible") setLoading(false);
    }
    document.addEventListener("visibilitychange", resetLoading);
    return () => {
      document.removeEventListener("visibilitychange", resetLoading);
      if (stallTimer.current) clearTimeout(stallTimer.current);
    };
  }, []);

  function fail(message: string) {
    if (stallTimer.current) clearTimeout(stallTimer.current);
    setError(message);
    setLoading(false);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  // Deliberately a click handler rather than a <form action>. React runs a form
  // action inside a transition, which defers the "Connecting..." state and, worse,
  // leaves no way to hand the button back if the request never returns: the form
  // stays pending forever and the user is stuck, which is the very dead end #444
  // is about. Owning the state here is what lets a stall become a retry.
  async function startSignIn() {
    const mine = ++attempt.current;
    setError(null);
    setLoading(true);

    stallTimer.current = setTimeout(() => {
      if (attempt.current !== mine) return;
      fail(
        "Google is taking longer than usual. Check your connection and try again.",
      );
    }, STALL_MS);

    const result = await signInWithGoogle();
    if (attempt.current !== mine) return;

    // A sign-in that started redirects to Google and never returns a value, so
    // only an explicit error means failure. Reading "nothing came back" as a
    // failure would flash an error over a sign-in that is working; the stall
    // timeout above is what catches a genuine hang.
    if (result?.error) fail(result.error);
  }

  return (
    <div>
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="bg-error/10 text-error mb-3 rounded-lg px-4 py-3 text-base outline-none"
        >
          {error}
        </div>
      )}

      <div>
        <Button
          type="button"
          onClick={startSignIn}
          variant="outline"
          className="bg-warm-white border-sage-dark/50 hover:bg-sage-light/30 h-11 w-full text-base font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          {loading ? "Connecting..." : "Continue with Google"}
        </Button>
      </div>
    </div>
  );
}
