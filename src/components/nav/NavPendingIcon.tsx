"use client";

import { useLinkStatus } from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders a nav item's icon, but swaps to a spinner the instant its parent
 * <Link> starts navigating. Gives immediate on-click feedback so a click
 * doesn't feel dead while the next server component loads. Must be rendered
 * as a descendant of a next/link <Link>.
 */
export function NavPendingIcon({
  icon: Icon,
  className = "size-4",
}: {
  icon: LucideIcon;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 className={cn(className, "animate-spin")} aria-hidden="true" />
  ) : (
    <Icon className={className} aria-hidden="true" />
  );
}
