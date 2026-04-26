"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Search,
  BarChart3,
  Zap,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import {
  createNurseFeaturedCheckout,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";
import { PRICING } from "@/lib/constants";

const BENEFITS = [
  { icon: Search, text: "Top placement in search results" },
  { icon: Sparkles, text: "Featured badge on your profile" },
  { icon: BarChart3, text: "Analytics dashboard (views, saves, reveals)" },
  { icon: Zap, text: "Priority 24-hour verification" },
];

interface FeaturedUpsellProps {
  // Whether the nurse has been verified yet. Affects the warning copy
  // shown above the Upgrade button.
  isVerified: boolean;
}

export function FeaturedUpsell({ isVerified }: FeaturedUpsellProps) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    if (posthog.__loaded) {
      posthog.capture(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, {
        plan: "nurse_featured",
      });
    }
    const result = await createNurseFeaturedCheckout();
    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    await redirectToCheckout(result);
  };

  return (
    <Card className="border-teal/20 from-teal/5 to-sage/10 bg-gradient-to-br">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <Badge className="bg-teal text-white">Featured</Badge>
          <span className="text-sm font-medium">
            ${PRICING.NURSE_FEATURED_MONTHLY}/month
          </span>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          Stand out to families and grow your client base.
        </p>
        <ul className="mt-3 space-y-2">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2 text-sm">
              <Icon className="text-teal size-4" />
              {text}
            </li>
          ))}
        </ul>

        {!isVerified && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertCircle
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <p>
              You can subscribe now, but the Featured badge and search boost
              won&apos;t show until your profile is verified. Verification
              usually takes under 24 hours.
            </p>
          </div>
        )}

        <Button
          onClick={handleUpgrade}
          disabled={loading}
          className="bg-teal hover:bg-teal-dark mt-4 w-full text-white"
        >
          {loading ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Redirecting to checkout...
            </>
          ) : (
            "Upgrade to Featured"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
