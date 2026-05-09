"use client";

import Link from "next/link";
import { Info } from "lucide-react";

interface TierLimitBannerProps {
  message: string;
}

/**
 * Inline notice that shows when a free-tier nurse hits a profile limit
 * (max care types, max skills, etc.). Always pairs the explanation with
 * an actionable Upgrade CTA pointing at /pricing — earlier the banner
 * said "Upgrade to Featured for unlimited" but gave the user no way to
 * actually do so.
 */
export function TierLimitBanner({ message }: TierLimitBannerProps) {
  return (
    <div className="border-warning/30 bg-warning/10 flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm">
      <div className="text-warning flex min-w-0 flex-1 items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </div>
      <Link
        href="/pricing"
        className="text-warning font-medium underline underline-offset-2 hover:no-underline"
      >
        Upgrade to Featured →
      </Link>
    </div>
  );
}
