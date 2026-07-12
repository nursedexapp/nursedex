"use client";

import { AlertTriangle } from "lucide-react";
import { PendingButton } from "@/components/ui/pending-button";
import { useBillingPortal, BILLING_PORTAL_STALLED } from "./use-billing-portal";

interface PastDueBannerProps {
  planType: "nurse_featured" | "family_access";
}

export function PastDueBanner({ planType }: PastDueBannerProps) {
  const { pending, open } = useBillingPortal();

  const message =
    planType === "family_access"
      ? "We couldn't charge your card for Family Access. Update your payment method to keep revealing nurse contact info."
      : "We couldn't charge your card for Featured. Update your payment method to keep your Featured badge and search boost.";

  return (
    <div className="border-warning/30 bg-warning/10 border-b px-6 py-3">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <AlertTriangle
          className="text-warning size-4 shrink-0"
          aria-hidden="true"
        />
        <p className="text-warning flex-1 text-sm">{message}</p>
        <PendingButton
          pending={pending}
          mode="wait"
          idleLabel="Update payment"
          workingLabel="Opening..."
          slowLabel="Still opening Stripe..."
          stalledMessage={BILLING_PORTAL_STALLED}
          onClick={open}
          className="border-warning/40 text-warning hover:bg-warning/20 h-8 border bg-white px-3 text-xs font-medium"
        />
      </div>
    </div>
  );
}
