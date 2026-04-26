"use client";

import { useState } from "react";
import { X, Sparkles } from "lucide-react";

export function SurveyAppliedBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="border-teal/30 bg-teal/5 mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm">
      <Sparkles
        className="text-teal mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      />
      <p className="text-soft-black flex-1">
        We applied the preferences from your survey. Adjust any filter on the
        left to refine.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-soft-black-light hover:text-soft-black -m-1 cursor-pointer p-1"
        aria-label="Dismiss"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
