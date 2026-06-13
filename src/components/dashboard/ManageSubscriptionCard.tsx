"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getCustomerPortalUrl,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";

interface ManageSubscriptionCardProps {
  // Human-readable plan name, e.g. "Family Access" or "Featured".
  planLabel: string;
  // Period end timestamp (ISO string from subscriptions.current_period_end).
  renewsOn: string;
  // True when the sub is set to cancel at period end; "renews" copy would be
  // misleading so we soften it to a clear end date.
  cancelAtPeriodEnd: boolean;
  // True when the latest webhook flagged the sub as past_due, so we steer the
  // user toward fixing their card.
  isPastDue: boolean;
  // In-app path Stripe returns to after the billing portal closes.
  returnTo: string;
  // Show the Featured badge (the nurse dashboard surface).
  featured?: boolean;
  // Optional card title (the settings surface uses "Billing").
  title?: string;
}

export function ManageSubscriptionCard({
  planLabel,
  renewsOn,
  cancelAtPeriodEnd,
  isPastDue,
  returnTo,
  featured = false,
  title,
}: ManageSubscriptionCardProps) {
  const [loading, setLoading] = useState(false);

  const handleManage = async () => {
    setLoading(true);
    const result = await getCustomerPortalUrl(returnTo);
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

  const statusCopy = isPastDue
    ? `We couldn't charge your card. Update payment to keep ${planLabel}.`
    : cancelAtPeriodEnd
      ? `${planLabel} cancellation scheduled. Access ends on ${renewsLabel}.`
      : `${planLabel} renews on ${renewsLabel}.`;

  return (
    <Card className="border-sage/20">
      {title && (
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        {(featured || isPastDue) && (
          <div className="mb-3 flex items-center gap-2">
            {featured && (
              <Badge className="bg-teal hover:bg-teal gap-1 text-white">
                <Sparkles className="size-3" aria-hidden="true" />
                Featured
              </Badge>
            )}
            {isPastDue && (
              <Badge
                variant="outline"
                className="border-warning/40 bg-warning/10 text-warning gap-1"
              >
                <AlertTriangle className="size-3" aria-hidden="true" />
                Payment failed
              </Badge>
            )}
          </div>
        )}

        <p className="text-soft-black-light text-sm">{statusCopy}</p>

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
