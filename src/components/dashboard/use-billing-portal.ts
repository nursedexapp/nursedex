"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  getCustomerPortalUrl,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";

/**
 * What a stalled billing portal tells the user.
 *
 * `wait` mode, not `retry` (#443 phase 3): the request cannot be aborted once in
 * flight, so re-enabling the button would let them open a second Stripe session.
 * Opening a portal never charges anyone, so a refresh is a safe way out and the
 * message says so rather than leaving them staring at a spinner.
 */
export { BILLING_PORTAL_STALLED } from "@/components/ui/stalled-copy";

/**
 * Opens the Stripe billing portal. Shared by PastDueBanner and
 * ManageSubscriptionCard, which had the same handler twice.
 *
 * On success this redirects, so the caller unmounts and `pending` never clears.
 * On failure the toast owns the message and the button comes back.
 */
export function useBillingPortal(returnTo?: string) {
  const [pending, setPending] = useState(false);

  const open = async () => {
    setPending(true);
    const result = returnTo
      ? await getCustomerPortalUrl(returnTo)
      : await getCustomerPortalUrl();
    if (result.error) {
      toast.error(result.error);
      setPending(false);
      return;
    }
    await redirectToCheckout(result);
  };

  return { pending, open };
}
