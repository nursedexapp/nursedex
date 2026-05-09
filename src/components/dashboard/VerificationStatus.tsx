"use client";

import { useEffect, useState } from "react";
import { VerificationBanner } from "./VerificationBanner";
import { VerifiedCelebration } from "./VerifiedCelebration";
import type { VerificationStatus as VerificationStatusType } from "@/types/enums";

const STORAGE_KEY = "nursedex.celebrated.verified";

interface VerificationStatusProps {
  status: VerificationStatusType;
  rejectedReason?: string | null;
  slug: string;
}

/**
 * Decides between the one-time verified celebration and the steady-state
 * verification banner. The first time a verified nurse loads the
 * dashboard, the celebration shows. After dismissal (tracked in
 * localStorage), the regular banner takes over for every visit after.
 *
 * Non-verified statuses (pending, rejected) always go straight to the
 * banner; there's nothing to celebrate yet.
 */
export function VerificationStatus({
  status,
  rejectedReason,
  slug,
}: VerificationStatusProps) {
  const [showCelebration, setShowCelebration] = useState<boolean | null>(null);

  useEffect(() => {
    if (status !== "verified") {
      setShowCelebration(false);
      return;
    }
    setShowCelebration(window.localStorage.getItem(STORAGE_KEY) !== "1");
  }, [status]);

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setShowCelebration(false);
  }

  // While we wait for localStorage to resolve on the client, render the
  // banner. This is the safe fallback (assumes celebration was already
  // dismissed) so a returning user never sees the celebration flash in
  // and out.
  if (status === "verified" && showCelebration === true) {
    return <VerifiedCelebration slug={slug} onDismiss={dismiss} />;
  }

  return <VerificationBanner status={status} rejectedReason={rejectedReason} />;
}
