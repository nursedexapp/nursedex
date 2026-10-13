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

const DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

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
 */
export function ConsentBanner() {
  const state = useConsentState();
  const [reopened, setReopened] = useState(false);
  const counting = useRef(false);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  // For the browser tests: the answer is known only after hydration.
  useEffect(() => {
    if (state !== "unknown") document.documentElement.dataset.consentState = state;
  }, [state]);

  useEffect(() => {
    if (state !== "none" || shownCounted() || counting.current) return;
    counting.current = true;
    recordConsentEvent("shown")
      .then((result) => {
        if (result.ok) markShownCounted();
      })
      .catch(() => {})
      .finally(() => {
        counting.current = false;
      });
  }, [state]);

  const visible =
    state === "none" ||
    (reopened && (state === "accepted" || state === "declined" || state === "signal"));

  useHeightVariable(barRef, "--consent-bar-height", visible);

  if (!visible) return null;

  function choose(choice: ConsentChoice) {
    const { countAnswer, reload } = applyConsentChoice(choice);
    setReopened(false);
    if (countAnswer) recordConsentEvent(choice).catch(() => {});
    if (reload) window.location.reload();
  }

  const current = state === "accepted" || state === "declined" ? readConsent() : null;
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
      className="border-sage-light/50 bg-warm-white fixed inset-x-0 bottom-[var(--bottom-nav-height,0px)] z-40 border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:px-6"
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
            <Button variant="default" size="lg" onClick={() => setReopened(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="default" size="lg" onClick={() => choose("declined")}>
                Decline
              </Button>
              <Button variant="default" size="lg" onClick={() => choose("accepted")}>
                Accept
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
