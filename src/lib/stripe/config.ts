// Centralized Stripe price IDs and plan metadata.
// Price IDs come from Stripe — see Stripe Dashboard → Products.

import { PRICING } from "@/lib/constants";

export const STRIPE_PRICE_IDS = {
  nurse_featured: process.env.STRIPE_NURSE_FEATURED_PRICE_ID ?? "",
  family_access: process.env.STRIPE_FAMILY_ACCESS_PRICE_ID ?? "",
} as const;

export type StripePlanType = "nurse_featured" | "family_access";

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
