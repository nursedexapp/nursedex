"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useHeightVariable } from "@/components/ui/use-height-variable";
import { recordConsentEvent } from "@/lib/consent/actions";
import { applyConsentChoice } from "@/lib/consent/apply";
import {
  CONSENT_OPEN_EVENT,
  markShownCounted,
  readConsent,
  shownCounted,
  type ConsentChoice,
} from "@/lib/consent/store";
import { useConsentState } from "@/lib/consent/use-consent-state";

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

/**
 * Asks before analytics, session recording or replay run in this browser.
 * Never blocking: ignoring it is a "no", because nothing loads until Accept.
 * Decline and Accept share one variant and size: California treats a
 * lopsided choice as a dark pattern that voids the consent.
 *
 * z-40 keeps it under dialogs and sheets (z-50). It sits above the dashboard's
 * mobile nav through --bottom-nav-height, which the nav publishes, and pads the
 * page by its own measured height through --consent-bar-height (globals.css),
 * so it never hides the end of a page or the footer's Privacy choices control.
 * The home indicator's safe area is cleared only at the screen edge: above the
 * nav, the inset minus the nav's height is below 1rem.
 *
 * Reopened from Privacy choices, it takes focus so keyboard and screen reader
 * users land on it, and gives focus back to the opener when it closes. On its
 * first showing it takes nothing: it never blocks.
 */
export function ConsentBanner() {
  const state = useConsentState();
  // Each press of Privacy choices, so a second press while the bar is open
  // still moves focus to it.
  const [opens, setOpens] = useState(0);
  const reopened = opens > 0;
  // The showing's count while it is on its way: resolves true once counted.
  const pendingShown = useRef<Promise<boolean> | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const open = () => {
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setOpens((n) => n + 1);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  // For the browser tests: the answer is known only after hydration.
  useEffect(() => {
    if (state !== "unknown")
      document.documentElement.dataset.consentState = state;
  }, [state]);

  useEffect(() => {
    if (state !== "none" || shownCounted() || pendingShown.current) return;
    const counting = recordConsentEvent("shown")
      .then((result) => {
        if (result.ok) markShownCounted();
        return result.ok;
      })
      .catch(() => false)
      .finally(() => {
        pendingShown.current = null;
      });
    pendingShown.current = counting;
  }, [state]);

  const visible =
    state === "none" ||
    (reopened &&
      (state === "accepted" || state === "declined" || state === "signal"));

  useHeightVariable(barRef, "--consent-bar-height", visible);

  useEffect(() => {
    if (opens > 0) barRef.current?.focus();
  }, [opens]);

  if (!visible) return null;

  function close() {
    setOpens(0);
    if (opener.current?.isConnected) opener.current.focus();
    opener.current = null;
  }

  // An answer counts only when it is the first and its showing was counted.
  // A fast first answer, given before the showing's count came back, waits
  // for it, or the fastest answers would never be counted and the accept rate
  // would read low. A reload only follows a change of mind, never a first
  // answer, so it cannot cut the wait short.
  function choose(choice: ConsentChoice) {
    const { firstAnswer, countAnswer, reload } = applyConsentChoice(choice);
    const shownOnItsWay = pendingShown.current;
    close();
    if (countAnswer) recordConsentEvent(choice).catch(() => {});
    else if (firstAnswer && shownOnItsWay)
      shownOnItsWay
        .then((counted) => {
          if (counted) return recordConsentEvent(choice);
        })
        .catch(() => {});
    if (reload) window.location.reload();
  }

  const current =
    state === "accepted" || state === "declined" ? readConsent() : null;
  const policy = (
    <Link href="/privacy" className="text-teal underline underline-offset-2">
      Privacy policy
    </Link>
  );

  return (
    <section
      ref={barRef}
      role="region"
      aria-label="Privacy choices"
      tabIndex={-1}
      className="border-sage-light/50 bg-warm-white focus-visible:ring-ring/50 fixed inset-x-0 bottom-[var(--bottom-nav-height,0px)] z-40 border-t px-4 pt-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)_-_var(--bottom-nav-height,0px)))] shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-inset sm:px-6"
    >
      <div className="max-w-site font-body text-soft-black mx-auto flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        {state === "signal" ? (
          <p>
            Your browser asks sites not to track you, so NurseDex runs no
            analytics or session recording in it. {policy}
          </p>
        ) : (
          <p>
            {current
              ? `You ${current.choice} on ${DATE.format(current.at)}. `
              : null}
            We&apos;d like to run analytics and session recording in your
            browser to see where NurseDex is confusing and fix it. None of it
            runs unless you accept. {policy}
          </p>
        )}
        <div className="flex shrink-0 gap-2">
          {state === "signal" ? (
            <Button variant="default" size="lg" onClick={close}>
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="default"
                size="lg"
                onClick={() => choose("declined")}
              >
                Decline
              </Button>
              <Button
                variant="default"
                size="lg"
                onClick={() => choose("accepted")}
              >
                Accept
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
