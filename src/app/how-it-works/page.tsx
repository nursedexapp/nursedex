import type { Metadata } from "next";
import Link from "next/link";
import {
  Search,
  Heart,
  MessageSquare,
  Star,
  ClipboardList,
  UserCheck,
  Sparkles,
  CalendarCheck,
} from "lucide-react";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

export const metadata: Metadata = {
  title: "How NurseDex works | NurseDex",
  description:
    "How families and nurses use NurseDex across New York. Step by step from finding a nurse to confirming a hire, plus how nurses build a profile and get verified.",
  openGraph: {
    title: "How NurseDex works",
    description: "Step by step for families and nurses across New York.",
    type: "website",
    url: "https://nursedex.com/how-it-works",
  },
};

export default function HowItWorksPage() {
  return (
    <div className="bg-warm-white flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="border-sage-light/40 border-b">
          <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
            <h1 className="font-heading text-soft-black text-center text-3xl font-semibold sm:text-4xl">
              How NurseDex works
            </h1>
            <p className="text-soft-black-light mx-auto mt-3 max-w-2xl text-center text-base">
              We&apos;re a hyper local directory of verified nurses on Long
              Island. Here&apos;s the journey for both sides.
            </p>
            <div className="mt-6 flex justify-center gap-3 text-sm">
              <a
                href="#for-families"
                className="text-teal-dark border-teal/30 bg-teal/5 hover:bg-teal/10 inline-flex items-center rounded-full border px-4 py-1.5 font-medium transition-colors"
              >
                For families
              </a>
              <a
                href="#for-nurses"
                className="text-soft-black border-sage/30 bg-sage/5 hover:bg-sage/15 inline-flex items-center rounded-full border px-4 py-1.5 font-medium transition-colors"
              >
                For nurses
              </a>
            </div>
          </div>
        </section>

        <Section
          id="for-families"
          eyebrow="For families"
          title="Find a nurse, hire with confidence"
          steps={FAMILY_STEPS}
          ctaLabel="Find a nurse"
          ctaHref="/nurses"
        />

        <div className="border-sage-light/40 border-t" />

        <Section
          id="for-nurses"
          eyebrow="For nurses"
          title="Build a profile that gets families to call"
          steps={NURSE_STEPS}
          ctaLabel="Join NurseDex"
          ctaHref="/signup"
        />
      </main>
      <Footer />
    </div>
  );
}

interface Step {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const FAMILY_STEPS: Step[] = [
  {
    icon: <Search className="size-5" />,
    title: "Search for the right nurse",
    body: "Filter by credential (HHA, CNA, LPN, RN, NP), care type, language, distance from your zip, availability, and rate. Browsing is free; you only pay if you want to reach out directly.",
  },
  {
    icon: <Heart className="size-5" />,
    title: "Save your shortlist",
    body: "Tap the heart on any nurse to add them to your saved list. Compare bios, reviews, and rates side by side, no rush.",
  },
  {
    icon: <MessageSquare className="size-5" />,
    title: "Reveal contact info",
    body: "Subscribe to Family Access to unlock email, phone, and preferred contact method for any verified nurse. Subscriptions are $9.99 per month (or $39.99 for your first year on the annual plan) and you can cancel anytime through Stripe.",
  },
  {
    icon: <CalendarCheck className="size-5" />,
    title: "Hire and review",
    body: "Mark the hire on the platform when you make it official, then leave a review (one to five stars, optional text) so the next family knows what to expect. Reviews go through a quick moderator approval before they appear on the nurse's profile.",
  },
];

const NURSE_STEPS: Step[] = [
  {
    icon: <ClipboardList className="size-5" />,
    title: "Build your profile",
    body: "Add your credentials, license number, primary care type, skills, languages, availability, rate range, and a bio. Free profiles get one photo and a 150 character bio; Featured gets up to three photos and 500 characters.",
  },
  {
    icon: <UserCheck className="size-5" />,
    title: "Get verified",
    body: "Our team checks your license against the New York State database. Free profiles have a 72 hour SLA, Featured nurses get priority at 24 hours. Once verified, your profile becomes visible to families and you get a verified badge.",
  },
  {
    icon: <Search className="size-5" />,
    title: "Get found by families",
    body: "You'll start showing up in search results for families nearby. Toggle availability when you have capacity (or hide your profile temporarily when you don't). Past clients can leave reviews via your unique share link with no NurseDex account required.",
  },
  {
    icon: <Sparkles className="size-5" />,
    title: "Go Featured (optional)",
    body: "Featured nurses appear at the top of search, get a longer bio and more photos, see weekly performance analytics, and get priority verification. $29 per month, cancel anytime.",
  },
  {
    icon: <Star className="size-5" />,
    title: "Build a track record",
    body: "Reviews and confirmed hires accumulate on your profile. Higher rated, more reviewed, and recently hired nurses rank higher in search.",
  },
];

function Section({
  id,
  eyebrow,
  title,
  steps,
  ctaLabel,
  ctaHref,
}: {
  id: string;
  eyebrow: string;
  title: string;
  steps: Step[];
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <section id={id} className="bg-warm-white scroll-mt-16">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-teal-dark text-xs font-semibold tracking-wider uppercase">
          {eyebrow}
        </p>
        <h2 className="font-heading text-soft-black mt-2 text-2xl font-semibold sm:text-3xl">
          {title}
        </h2>

        <ol className="mt-8 space-y-6">
          {steps.map((step, idx) => (
            <li key={step.title} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="bg-teal flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
                  {idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div className="bg-sage/30 mt-2 w-px flex-1" />
                )}
              </div>
              <div className="pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-teal">{step.icon}</span>
                  <h3 className="font-heading text-soft-black text-lg font-semibold">
                    {step.title}
                  </h3>
                </div>
                <p className="text-soft-black-light mt-1 text-sm">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <Link
          href={ctaHref}
          className="bg-teal hover:bg-teal-dark mt-6 inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
