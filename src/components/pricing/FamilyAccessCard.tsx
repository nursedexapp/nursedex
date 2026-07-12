"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckoutButton } from "@/components/pricing/CheckoutButton";
import { PRICING } from "@/lib/constants";

const FAMILY_PERKS = [
  "Reveal contact info for any verified nurse",
  "Save and shortlist as many nurses as you want",
  "Leave reviews after hiring",
  "60-day grace window if you cancel",
  "New York nurses",
];

interface FamilyAccessCardProps {
  isLoggedInFamily: boolean;
  hasActiveSub: boolean;
}

/**
 * Family Access pricing card with an instant client-side monthly/annual
 * toggle. Kept as a client component so switching billing interval re-renders
 * locally instead of triggering a full server navigation (which would re-run
 * the page's auth + subscription queries).
 */
export function FamilyAccessCard({
  isLoggedInFamily,
  hasActiveSub,
}: FamilyAccessCardProps) {
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const isAnnual = interval === "annual";

  const ctaClass =
    "inline-flex w-full items-center justify-center rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-dark";

  const toggleBase =
    "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors";
  const toggleActive = "bg-teal text-white shadow-sm";
  const toggleIdle = "text-soft-black-light hover:bg-sage/10";

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex justify-center">
        <div className="border-sage/30 inline-flex gap-1 rounded-xl border bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            aria-pressed={!isAnnual}
            className={`${toggleBase} ${!isAnnual ? toggleActive : toggleIdle}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("annual")}
            aria-pressed={isAnnual}
            className={`${toggleBase} ${isAnnual ? toggleActive : toggleIdle}`}
          >
            Annual
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                isAnnual
                  ? "bg-white/20 text-white"
                  : "bg-teal/10 text-teal-dark"
              }`}
            >
              Save 67%
            </span>
          </button>
        </div>
      </div>

      <Card className="border-teal/30 relative h-full">
        <CardContent className="flex flex-1 flex-col gap-4 pt-6">
          <div className="flex items-center gap-2">
            <div className="text-teal">
              <Heart className="size-5" />
            </div>
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              For families
            </p>
          </div>
          <h2 className="font-heading text-soft-black text-2xl font-semibold">
            Family Access
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-soft-black text-4xl font-semibold">
              {isAnnual
                ? `$${PRICING.FAMILY_ACCESS_ANNUAL_FIRST_YEAR}`
                : `$${PRICING.FAMILY_ACCESS_MONTHLY}`}
            </span>
            <span className="text-muted-foreground text-sm">
              {isAnnual
                ? `first year, then $${PRICING.FAMILY_ACCESS_ANNUAL}/yr`
                : "per month"}
            </span>
          </div>
          <p className="text-soft-black-light text-sm">
            {isAnnual
              ? "Unlock contact info for any verified nurse across New York. Save 67% versus paying monthly your first year."
              : "Unlock contact info for any verified nurse across New York."}
          </p>
          <ul className="flex-1 space-y-2 text-sm">
            {FAMILY_PERKS.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Check className="text-teal mt-0.5 size-4 shrink-0" />
                <span className="text-soft-black">{p}</span>
              </li>
            ))}
          </ul>
          {!isLoggedInFamily ? (
            <Link href="/signup" className={ctaClass}>
              Get Family Access
            </Link>
          ) : hasActiveSub ? (
            <CheckoutButton
              action="customer_portal"
              label="Manage subscription"
              className={ctaClass}
            />
          ) : (
            <CheckoutButton
              action={
                isAnnual
                  ? "family_access_annual_checkout"
                  : "family_access_checkout"
              }
              label="Get Family Access"
              className={ctaClass}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
