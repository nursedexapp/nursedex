import type { Metadata } from "next";
import Link from "next/link";
import { Check, Star, Heart } from "lucide-react";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRICING } from "@/lib/constants";

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

export default function PricingPage() {
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
              Browsing is free for everyone. Families pay to reveal contact
              info, nurses pay only if they want priority placement.
            </p>
          </div>
        </section>

        <section className="bg-warm-white">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <div className="grid gap-6 lg:grid-cols-3">
              <PricingCard
                icon={<Heart className="size-5" />}
                eyebrow="For families"
                title="Family Access"
                price={`$${PRICING.FAMILY_ACCESS_MONTHLY}`}
                period="per month"
                desc="Unlock contact info for any verified nurse on Long Island."
                perks={FAMILY_PERKS}
                cta={{ href: "/signup", label: "Get Family Access" }}
                accent="teal"
              />
              <PricingCard
                icon={<Star className="size-5" />}
                eyebrow="For nurses"
                title="Free"
                price="$0"
                period="forever"
                desc="Build a profile, get verified, and start getting found."
                perks={FREE_NURSE_PERKS}
                cta={{ href: "/signup", label: "Join free" }}
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
                cta={{ href: "/signup", label: "Start as Featured" }}
                accent="featured"
                highlight
              />
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              <FineprintCard
                title="Refunds"
                body="NurseDex doesn't issue refunds. You can cancel anytime through the Stripe billing portal; access continues until the end of your current billing period."
              />
              <FineprintCard
                title="Cancellation"
                body="Family Access has a 60-day grace window after cancellation: you'll keep access to nurses you already revealed, but won't be able to reveal new ones. Featured drops to Free immediately at the end of the billing period."
              />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

interface PricingCardProps {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  price: string;
  period: string;
  desc: string;
  perks: string[];
  cta: { href: string; label: string };
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

  return (
    <Card className={`${border} relative ${highlight ? "shadow-lg" : ""}`}>
      {highlight && (
        <Badge className="bg-teal absolute top-4 right-4 text-white">
          Most popular
        </Badge>
      )}
      <CardContent className="space-y-4 pt-6">
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
        <ul className="space-y-2 text-sm">
          {perks.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <Check className="text-teal mt-0.5 size-4 shrink-0" />
              <span className="text-soft-black">{p}</span>
            </li>
          ))}
        </ul>
        <Link
          href={cta.href}
          className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${ctaClass}`}
        >
          {cta.label}
        </Link>
      </CardContent>
    </Card>
  );
}

function FineprintCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="border-sage/20">
      <CardContent className="space-y-1 pt-5">
        <h3 className="font-heading text-soft-black text-base font-semibold">
          {title}
        </h3>
        <p className="text-soft-black-light text-sm">{body}</p>
      </CardContent>
    </Card>
  );
}
