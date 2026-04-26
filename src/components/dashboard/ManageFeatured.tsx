"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getCustomerPortalUrl,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";

interface ManageFeaturedProps {
  // Period end timestamp (ISO string from subscriptions.current_period_end).
  renewsOn: string;
  // True when the sub is set to cancel at period end — we soften the copy
  // since "renews" is misleading.
  cancelAtPeriodEnd: boolean;
  // True when the latest webhook flagged the sub as past_due. Surface this
  // so the nurse fixes their card before the access window closes.
  isPastDue: boolean;
}

export function ManageFeatured({
  renewsOn,
  cancelAtPeriodEnd,
  isPastDue,
}: ManageFeaturedProps) {
  const [loading, setLoading] = useState(false);

  const handleManage = async () => {
    setLoading(true);
    const result = await getCustomerPortalUrl();
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
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <Badge className="bg-teal hover:bg-teal gap-1 text-white">
            <Sparkles className="size-3" aria-hidden="true" />
            Featured
          </Badge>
          {isPastDue && (
            <Badge
              variant="outline"
              className="gap-1 border-amber-300 bg-amber-50 text-amber-900"
            >
              <AlertTriangle className="size-3" aria-hidden="true" />
              Payment failed
            </Badge>
          )}
        </div>

        <p className="text-soft-black-light mt-3 text-sm">
          {isPastDue
            ? `We couldn't charge your card. Update payment to keep your Featured badge.`
            : cancelAtPeriodEnd
              ? `Cancellation scheduled. Featured ends on ${renewsLabel}.`
              : `Renews on ${renewsLabel}.`}
        </p>

        <Button
          onClick={handleManage}
          disabled={loading}
          variant="outline"
          className="mt-4 w-full"
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
