import Link from "next/link";

interface FeaturedUpsellProps {
  // Whether the nurse has been verified yet. Unverified nurses see no
  // upsell at all; the dashboard stays a calm space until their profile
  // is actually live.
  isVerified: boolean;
}

/**
 * Discreet upgrade prompt that lives at the bottom of the dashboard.
 * Replaces the previous gradient-card + bullet-list upsell, which felt
 * like a marketing card on a daily-use surface. The full Featured value
 * proposition lives on /pricing; the dashboard just leaves a quiet door
 * open for nurses who want to explore.
 */
export function FeaturedUpsell({ isVerified }: FeaturedUpsellProps) {
  if (!isVerified) return null;

  return (
    <div className="border-sage/20 border-t pt-5 text-center">
      <p className="text-soft-black-light text-sm">
        Want top placement and analytics?{" "}
        <Link
          href="/pricing"
          className="text-teal hover:text-teal-dark font-medium underline-offset-4 hover:underline"
        >
          See Featured pricing
        </Link>
      </p>
    </div>
  );
}
