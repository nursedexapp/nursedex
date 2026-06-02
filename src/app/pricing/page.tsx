import type { Metadata } from "next";
import Link from "next/link";
import { Check, Star, Heart } from "lucide-react";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckoutButton } from "@/components/pricing/CheckoutButton";
import { PRICING } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth/helpers";
import { getActiveSubscription } from "@/lib/subscriptions/queries";

export const metadata: Metadata = {
  title: "Pricing | NurseDex",
  description:
    "Family Access at $19.99/mo lets families reveal nurse contact info. Featured at $29/mo gives nurses priority placement and analytics. Free tier available for nurses.",
  openGraph: {
    title: "Pricing | NurseDex",
    description:
      "Family Access at $19.99/mo, Featured at $29/mo. Free tier for nurses.",
    type: "website",
    url: "https://nursedex.com/pricing",
  },
};

const FAMILY_PERKS = [
  "Reveal contact info for any verified nurse",
  "Save and shortlist as many nurses as you want",
  "Leave reviews after hiring",
  "60-day grace window if you cancel",
  "Long Island specific (Suffolk, Nassau, Queens)",
];

const FREE_NURSE_PERKS = [
  "Profile in search results",
  "Up to 1 photo and 150-character bio",
  "Up to 2 care types",
  "License verification (72-hour SLA)",
  "Collect reviews from past clients",
];

const FEATURED_NURSE_PERKS = [
  "Top placement in search results",
  "Featured badge on every profile view",
  "Up to 3 photos and 500-character bio",
  "Unlimited care types",
  "Priority license verification (24-hour SLA)",
  "Weekly performance email + analytics dashboard",
  "Cohort comparison: see how you stack up",
];

type Audience = "families" | "nurses";

interface PricingPageProps {
  searchParams: Promise<{ audience?: string }>;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  const knownAudience: Audience | null =
    user?.role === "nurse"
      ? "nurses"
      : user?.role === "family"
        ? "families"
        : null;

  const toggleAudience: Audience =
    params.audience === "nurses" ? "nurses" : "families";

  const audience: Audience = knownAudience ?? toggleAudience;
  const showToggle = knownAudience === null;

  const nurseFeaturedSub =
    audience === "nurses" && user?.role === "nurse"
      ? await getActiveSubscription(user.id, "nurse_featured")
      : null;
  const familyAccessSub =
    audience === "families" && user?.role === "family"
      ? await getActiveSubscription(user.id, "family_access")
      : null;

  return (
    <div className="bg-warm-white flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="border-sage-light/40 border-b">
          <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
            <h1 className="font-heading text-soft-black text-center text-3xl font-semibold sm:text-4xl">
              Simple pricing
            </h1>
            <p className="text-soft-black-light mx-auto mt-3 max-w-2xl text-center text-base">
              {audience === "nurses"
                ? "Build your profile free, or go Featured for priority placement."
                : "Browse for free. Pay only when you're ready to reveal contact info."}
            </p>
            {showToggle && <AudienceToggle current={audience} />}
          </div>
        </section>

        <section className="bg-warm-white">
          <div className="mx-auto max-w-6xl px-6 py-12">
            {audience === "families" ? (
              <FamilyView
                isLoggedInFamily={user?.role === "family"}
                hasActiveSub={!!familyAccessSub}
              />
            ) : (
              <NurseView
                isLoggedInNurse={user?.role === "nurse"}
                hasFeatured={!!nurseFeaturedSub}
              />
            )}

            <div className="mt-10 grid items-start gap-6 sm:grid-cols-2">
              <FineprintCard
                title="Refunds"
                body="NurseDex doesn't issue refunds. You can cancel anytime through the Stripe billing portal; access continues until the end of your current billing period."
              />
              <FineprintCard
                title="Cancellation"
                body={
                  audience === "nurses"
                    ? "Cancel anytime in the Stripe portal. Featured drops to Free at the end of your current billing period, and your profile stays visible on the free tier."
                    : "Family Access has a 60-day grace window after cancellation: you'll keep access to nurses you already revealed, but won't be able to reveal new ones."
                }
              />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function AudienceToggle({ current }: { current: Audience }) {
  const baseClass =
    "flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors sm:px-7";
  const activeClass = "bg-teal text-white shadow-sm";
  const idleClass = "text-soft-black-light hover:bg-sage/10";
  return (
    <div className="mt-8 flex flex-col items-center">
      <p className="text-soft-black-light mb-3 text-sm font-medium">
        I&apos;m here to...
      </p>
      <div
        role="tablist"
        aria-label="Choose your pricing"
        className="border-sage/30 inline-flex gap-1 rounded-xl border bg-white p-1 shadow-sm"
      >
        <Link
          href="/pricing?audience=families"
          role="tab"
          aria-selected={current === "families"}
          className={`${baseClass} ${current === "families" ? activeClass : idleClass}`}
        >
          <Heart className="size-4" aria-hidden="true" />
          Hire a nurse
        </Link>
        <Link
          href="/pricing?audience=nurses"
          role="tab"
          aria-selected={current === "nurses"}
          className={`${baseClass} ${current === "nurses" ? activeClass : idleClass}`}
        >
          <Star className="size-4" aria-hidden="true" />
          Join as a nurse
        </Link>
      </div>
    </div>
  );
}

interface FamilyViewProps {
  isLoggedInFamily: boolean;
  hasActiveSub: boolean;
}

function FamilyView({ isLoggedInFamily, hasActiveSub }: FamilyViewProps) {
  const cta = !isLoggedInFamily
    ? { kind: "link" as const, href: "/signup", label: "Get Family Access" }
    : hasActiveSub
      ? {
          kind: "action" as const,
          action: "customer_portal" as const,
          label: "Manage subscription",
        }
      : {
          kind: "action" as const,
          action: "family_access_checkout" as const,
          label: "Get Family Access",
        };

  return (
    <div className="mx-auto max-w-md">
      <PricingCard
        icon={<Heart className="size-5" />}
        eyebrow="For families"
        title="Family Access"
        price={`$${PRICING.FAMILY_ACCESS_MONTHLY}`}
        period="per month"
        desc="Unlock contact info for any verified nurse on Long Island."
        perks={FAMILY_PERKS}
        cta={cta}
        accent="teal"
      />
    </div>
  );
}

interface NurseViewProps {
  isLoggedInNurse: boolean;
  hasFeatured: boolean;
}

function NurseView({ isLoggedInNurse, hasFeatured }: NurseViewProps) {
  const freeCta = !isLoggedInNurse
    ? { kind: "link" as const, href: "/signup", label: "Join free" }
    : hasFeatured
      ? { kind: "currentPlan" as const, label: "Included in Featured" }
      : { kind: "currentPlan" as const, label: "Your current plan" };

  const featuredCta = !isLoggedInNurse
    ? { kind: "link" as const, href: "/signup", label: "Start as Featured" }
    : hasFeatured
      ? {
          kind: "action" as const,
          action: "customer_portal" as const,
          label: "Manage subscription",
        }
      : {
          kind: "action" as const,
          action: "nurse_featured_checkout" as const,
          label: "Upgrade to Featured",
        };

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <PricingCard
        icon={<Star className="size-5" />}
        eyebrow="For nurses"
        title="Free"
        price="$0"
        period="forever"
        desc="Build a profile, get verified, and start getting found."
        perks={FREE_NURSE_PERKS}
        cta={freeCta}
        accent="sage"
      />
      <PricingCard
        icon={<Star className="size-5" />}
        eyebrow="For nurses"
        title="Featured"
        price={`$${PRICING.NURSE_FEATURED_MONTHLY}`}
        period="per month"
        desc="Stand out and get priority verification on top of everything in Free."
        perks={FEATURED_NURSE_PERKS}
        cta={featuredCta}
        accent="featured"
        highlight
      />
    </div>
  );
}

type CtaSpec =
  | { kind: "link"; href: string; label: string }
  | {
      kind: "action";
      action:
        | "nurse_featured_checkout"
        | "family_access_checkout"
        | "customer_portal";
      label: string;
    }
  | { kind: "currentPlan"; label: string };

interface PricingCardProps {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  price: string;
  period: string;
  desc: string;
  perks: string[];
  cta: CtaSpec;
  accent: "teal" | "sage" | "featured";
  highlight?: boolean;
}

function PricingCard({
  icon,
  eyebrow,
  title,
  price,
  period,
  desc,
  perks,
  cta,
  accent,
  highlight,
}: PricingCardProps) {
  const border =
    accent === "teal"
      ? "border-teal/30"
      : accent === "featured"
        ? "border-teal"
        : "border-sage/30";
  const ctaClass =
    accent === "featured" || accent === "teal"
      ? "bg-teal hover:bg-teal-dark text-white"
      : "bg-soft-black hover:bg-soft-black/90 text-white";

  const ctaBaseClass = `inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${ctaClass}`;

  return (
    <Card
      className={`${border} relative h-full ${highlight ? "shadow-lg" : ""}`}
    >
      {highlight && (
        <Badge className="bg-teal absolute top-4 right-4 text-white">
          Most popular
        </Badge>
      )}
      <CardContent className="flex flex-1 flex-col gap-4 pt-6">
        <div className="flex items-center gap-2">
          <div className="text-teal">{icon}</div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {eyebrow}
          </p>
        </div>
        <h2 className="font-heading text-soft-black text-2xl font-semibold">
          {title}
        </h2>
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-soft-black text-4xl font-semibold">
            {price}
          </span>
          <span className="text-muted-foreground text-sm">{period}</span>
        </div>
        <p className="text-soft-black-light text-sm">{desc}</p>
        <ul className="flex-1 space-y-2 text-sm">
          {perks.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <Check className="text-teal mt-0.5 size-4 shrink-0" />
              <span className="text-soft-black">{p}</span>
            </li>
          ))}
        </ul>
        {cta.kind === "link" ? (
          <Link href={cta.href} className={ctaBaseClass}>
            {cta.label}
          </Link>
        ) : cta.kind === "action" ? (
          <CheckoutButton
            action={cta.action}
            label={cta.label}
            className={ctaBaseClass}
          />
        ) : (
          <div className="bg-sage/10 text-soft-black-light inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium">
            {cta.label}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FineprintCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="border-sage/20 h-full">
      <CardContent className="flex flex-1 flex-col gap-1 pt-5">
        <h3 className="font-heading text-soft-black text-base font-semibold">
          {title}
        </h3>
        <p className="text-soft-black-light text-sm">{body}</p>
      </CardContent>
    </Card>
  );
}
