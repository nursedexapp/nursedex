"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 6; // ~15s total before showing the stalled state

/**
 * Shown instead of the paywall CTA when the family just completed checkout
 * but our webhook hasn't granted access yet (#426). Polls via
 * router.refresh() so the parent server component re-checks
 * hasActiveFamilyAccess; once it flips, the parent switches to "subscribed"
 * mode and this unmounts.
 */
export function ProvisioningNotice() {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (attempts >= MAX_POLLS) {
      setStalled(true);
      return;
    }
    const timer = setTimeout(() => {
      router.refresh();
      setAttempts((n) => n + 1);
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [attempts, router]);

  if (stalled) {
    return (
      <div className="border-sage/40 bg-warm-white flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm">
        <span className="text-soft-black-light">
          Setup is taking longer than expected. Your payment went through;
          refresh this page in a minute, or contact support if this persists.
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setAttempts(0);
            setStalled(false);
            router.refresh();
          }}
        >
          <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
          Refresh now
        </Button>
      </div>
    );
  }

  return (
    <div className="border-teal/20 bg-teal/5 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm">
      <Loader2 className="text-teal size-4 animate-spin" aria-hidden="true" />
      <span className="text-soft-black-light">
        Finishing your subscription setup...
      </span>
    </div>
  );
}
