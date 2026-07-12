"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  createFamilyAccessCheckout,
  createNurseFeaturedCheckout,
  getCustomerPortalUrl,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";
import { PendingButton } from "@/components/ui/pending-button";
import { posthog } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";

type Action =
  | "nurse_featured_checkout"
  | "family_access_checkout"
  | "family_access_annual_checkout"
  | "customer_portal";

interface CheckoutButtonProps {
  action: Action;
  label: string;
  className: string;
}

export function CheckoutButton({
  action,
  label,
  className,
}: CheckoutButtonProps) {
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const result =
        action === "nurse_featured_checkout"
          ? await createNurseFeaturedCheckout()
          : action === "family_access_checkout"
            ? await createFamilyAccessCheckout({})
            : action === "family_access_annual_checkout"
              ? await createFamilyAccessCheckout({ interval: "year" })
              : await getCustomerPortalUrl();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      // Counted here, not on click (#657). Firing on click counted a
      // subscription start for a checkout that never reached Stripe, and counted
      // a second one on the next attempt. One session, one start.
      if (action !== "customer_portal" && posthog.__loaded) {
        posthog.capture(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, {
          plan:
            action === "nurse_featured_checkout"
              ? "nurse_featured"
              : "family_access",
          interval:
            action === "family_access_annual_checkout" ? "year" : "month",
          source: "pricing_page",
        });
      }

      await redirectToCheckout(result);
    });
  };

  // wait, not retry (#443 phase 3). An in-flight checkout cannot be aborted, so
  // re-enabling on a stall would let the user open a second Stripe session.
  // Creating a session never charges anyone, so the honest way out is a refresh,
  // which is what the stall message says.
  return (
    <PendingButton
      pending={isPending}
      mode="wait"
      idleLabel={label}
      workingLabel="Loading..."
      slowLabel="Still opening Stripe..."
      stalledMessage="This is still opening Stripe. You have not been charged. Refresh the page to try again."
      onClick={onClick}
      className={className}
    />
  );
}
