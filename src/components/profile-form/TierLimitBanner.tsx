"use client";

import { Info } from "lucide-react";

interface TierLimitBannerProps {
  message: string;
}

export function TierLimitBanner({ message }: TierLimitBannerProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
