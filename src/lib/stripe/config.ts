// Centralized Stripe price IDs and plan metadata.
// Price IDs come from Stripe, see Stripe Dashboard → Products.

import { PRICING } from "@/lib/constants";

export const STRIPE_PRICE_IDS = {
  nurse_featured: process.env.STRIPE_NURSE_FEATURED_PRICE_ID ?? "",
  family_access: process.env.STRIPE_FAMILY_ACCESS_PRICE_ID ?? "",
  family_access_annual: process.env.STRIPE_FAMILY_ACCESS_ANNUAL_PRICE_ID ?? "",
} as const;

// First-year promo coupon for the annual Family Access plan. Applied at
// checkout so the first invoice (the first year) drops from
// FAMILY_ACCESS_ANNUAL to FAMILY_ACCESS_ANNUAL_FIRST_YEAR, then renews at the
// standard annual price. Configure as a Stripe coupon with duration "once".
export const STRIPE_FAMILY_ACCESS_ANNUAL_COUPON_ID =
  process.env.STRIPE_FAMILY_ACCESS_ANNUAL_COUPON_ID ?? "";

export type StripePlanType = "nurse_featured" | "family_access";
export type BillingInterval = "month" | "year";

/**
 * Resolve the Stripe price ID for Family Access by billing interval. Both
 * intervals are still the same plan_type ("family_access") everywhere else
 * (access, grace, reveals) so only the price and checkout differ.
 */
export function familyAccessPriceId(interval: BillingInterval): string {
  return interval === "year"
    ? STRIPE_PRICE_IDS.family_access_annual
    : STRIPE_PRICE_IDS.family_access;
}

export interface StripePlanInfo {
  type: StripePlanType;
  priceId: string;
  monthlyPrice: number;
  description: string;
}

export const STRIPE_PLANS: Record<StripePlanType, StripePlanInfo> = {
  nurse_featured: {
    type: "nurse_featured",
    priceId: STRIPE_PRICE_IDS.nurse_featured,
    monthlyPrice: PRICING.NURSE_FEATURED_MONTHLY,
    description: "Featured nurse profile (priority placement, more visibility)",
  },
  family_access: {
    type: "family_access",
    priceId: STRIPE_PRICE_IDS.family_access,
    monthlyPrice: PRICING.FAMILY_ACCESS_MONTHLY,
    description: "Family access (reveal contact info for any verified nurse)",
  },
};
