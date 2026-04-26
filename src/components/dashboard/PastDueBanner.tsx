"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getCustomerPortalUrl,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";

interface PastDueBannerProps {
  // Which plan is past_due. Affects copy.
  planType: "nurse_featured" | "family_access";
}

export function PastDueBanner({ planType }: PastDueBannerProps) {
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    const result = await getCustomerPortalUrl();
    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    await redirectToCheckout(result);
  };

  const message =
    planType === "family_access"
      ? "We couldn't charge your card for Family Access. Update your payment method to keep revealing nurse contact info."
      : "We couldn't charge your card for Featured. Update your payment method to keep your Featured badge and search boost.";

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-3">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <AlertTriangle
          className="size-4 shrink-0 text-amber-700"
          aria-hidden="true"
        />
        <p className="flex-1 text-sm text-amber-900">{message}</p>
        <button
          type="button"
          onClick={handleUpdate}
          disabled={loading}
          className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-wait"
        >
          {loading ? (
            <>
              <Loader2 className="mr-1 size-3 animate-spin" />
              Opening...
            </>
          ) : (
            "Update payment"
          )}
        </button>
      </div>
    </div>
  );
}
