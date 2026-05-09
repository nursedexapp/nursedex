"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createFamilyAccessCheckout,
  createNurseFeaturedCheckout,
  getCustomerPortalUrl,
  redirectToCheckout,
} from "@/lib/subscriptions/actions";

type Action =
  | "nurse_featured_checkout"
  | "family_access_checkout"
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
  const [, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result =
        action === "nurse_featured_checkout"
          ? await createNurseFeaturedCheckout()
          : action === "family_access_checkout"
            ? await createFamilyAccessCheckout({})
            : await getCustomerPortalUrl();

      if (result.error) {
        toast.error(result.error);
        setError(result.error);
        return;
      }
      await redirectToCheckout(result);
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className={className}
    >
      {isPending ? "Loading..." : label}
    </button>
  );
}
