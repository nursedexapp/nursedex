"use client";

import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getCustomerPortalUrl,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";

interface ManageBillingProps {
  // Human-readable plan name, e.g. "Family Access" or "Featured".
  planLabel: string;
  // Period end timestamp (ISO string from subscriptions.current_period_end).
  renewsOn: string;
  // True when the sub is set to cancel at period end; "renews" copy would
  // be misleading so we soften it to a clear end date.
  cancelAtPeriodEnd: boolean;
  // True when the latest webhook flagged the sub as past_due, so we steer
  // the user toward fixing their card.
  isPastDue: boolean;
}

export function ManageBilling({
  planLabel,
  renewsOn,
  cancelAtPeriodEnd,
  isPastDue,
}: ManageBillingProps) {
  const [loading, setLoading] = useState(false);

  const handleManage = async () => {
    setLoading(true);
    const result = await getCustomerPortalUrl("/dashboard/settings");
    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    await redirectToCheckout(result);
  };

  const renewsLabel = new Date(renewsOn).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Card className="border-sage/20">
      <CardHeader>
        <CardTitle className="text-base">Billing</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-soft-black-light text-sm">
          {isPastDue ? (
            <span className="text-warning inline-flex items-center gap-1.5">
              <AlertTriangle className="size-4" aria-hidden="true" />
              {`We couldn't charge your card. Update payment to keep ${planLabel}.`}
            </span>
          ) : cancelAtPeriodEnd ? (
            `${planLabel} cancellation scheduled. Access ends on ${renewsLabel}.`
          ) : (
            `${planLabel} renews on ${renewsLabel}.`
          )}
        </p>

        <Button
          onClick={handleManage}
          disabled={loading}
          variant="outline"
          className="mt-4 w-full sm:w-auto"
        >
          {loading ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Opening billing portal...
            </>
          ) : isPastDue ? (
            "Update payment"
          ) : (
            "Manage subscription"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
