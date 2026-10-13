"use client";

import { openConsentBanner } from "@/lib/consent/store";

/** Reopens the cookie bar from the footer, on any page. */
export function PrivacyChoicesButton() {
  return (
    <button
      type="button"
      onClick={openConsentBanner}
      className="hover:text-soft-black cursor-pointer underline underline-offset-2"
    >
      Privacy choices
    </button>
  );
}
