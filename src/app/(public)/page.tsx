import type { Metadata } from "next";
import NextImage from "next/image";
import Link from "next/link";
import {
  Search,
  ShieldCheck,
  Heart,
  MessageSquare,
  Star,
  ClipboardList,
  UserCheck,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "NurseDex | New York's trusted nurse directory",
  description:
    "Find trusted nurses across New York, or build a profile that gets families to call. NurseDex connects verified nurses with the families that need them.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "NurseDex | New York's trusted nurse directory",
    description:
      "Find trusted nurses across New York, or build a profile that gets families to call.",
    type: "website",
    url: "https://nursedex.com/",
  },
};

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="flex-1">
        <Hero />
        <TrustSignals />
        <DualHowItWorks />
        <FinalCTAs />
      </main>
    </div>
  );
}

function Hero() {
  return (
    <section className="border-sage-light/40 bg-warm-white border-b">
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <h1 className="font-heading text-soft-black mx-auto max-w-3xl text-center text-3xl font-semibold sm:text-5xl">
          New York&apos;s trusted nurse directory
        </h1>
        <p className="text-soft-black-light mx-auto mt-4 max-w-2xl text-center text-base sm:text-lg">
          Verified nurses, real reviews, direct contact. Built for families
          across New York looking for care, and for nurses who deserve to be
          found.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card className="border-teal/20 from-teal/5 to-warm-white bg-gradient-to-b">
            <CardContent className="flex flex-1 flex-col gap-3 pt-6">
              <h2 className="font-heading text-soft-black text-2xl font-bold sm:text-3xl">
                Are you looking for a nurse?
              </h2>
              <p className="text-soft-black-light text-sm">
                Find a verified nurse near you. Search by credential, care type,
                language, and availability, and see real reviews from other New
                York families.
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link
                  href="/nurses"
                  className="bg-teal hover:bg-teal-dark inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                >
                  Browse nurses
                </Link>
                <Link
                  href="/survey"
                  className="border-teal/30 text-teal-dark hover:bg-teal/10 inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
                >
                  Take the 60 second survey
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="border-sage/30 from-sage/10 to-warm-white bg-gradient-to-b">
            <CardContent className="flex flex-1 flex-col gap-3 pt-6">
              <h2 className="font-heading text-soft-black text-2xl font-bold sm:text-3xl">
                Are you a nurse?
              </h2>
              <p className="text-soft-black-light text-sm">
                Build a profile that families call. Post your credentials, your
                bio, and your availability. Get verified and start getting found
                by families looking for exactly what you offer.
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link
                  href="/signup"
                  className="bg-soft-black hover:bg-soft-black/90 inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                >
                  Join NurseDex free
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
          {[
            {
              src: "/images/home/nurse-listening-to-childs-heart.jpg",
              alt: "A nurse listening to a young girl's heartbeat with a stethoscope",
            },
            {
              src: "/images/home/nurse-with-elderly-patient.jpg",
              alt: "A nurse caring for a smiling elderly woman at home",
            },
            {
              src: "/images/home/nurse-smiling-with-young-patient.jpg",
              alt: "A smiling nurse checking a child's heartbeat",
            },
          ].map((photo) => (
            <div
              key={photo.src}
              className="relative aspect-[4/5] overflow-hidden rounded-2xl"
            >
              <NextImage
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(max-width: 640px) 33vw, 368px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSignals() {
  const items = [
    {
      icon: <ShieldCheck className="size-5" />,
      title: "License-verified",
      desc: "Every nurse on NurseDex has had their license checked against the NY State database.",
    },
    {
      icon: <Heart className="size-5" />,
      title: "New York focused",
      desc: "Local nurses across New York, not a faceless national directory.",
    },
    {
      icon: <Star className="size-5" />,
      title: "Real reviews",
      desc: "From the families who actually hired the nurse. Email-verified, moderator-approved.",
    },
  ];
  return (
    <section className="border-sage-light/40 border-b bg-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-6 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <div className="text-teal mt-0.5">{item.icon}</div>
              <div>
                <h3 className="font-heading text-soft-black text-base font-semibold">
                  {item.title}
                </h3>
                <p className="text-soft-black-light mt-1 text-sm">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DualHowItWorks() {
  return (
    <section className="bg-warm-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-heading text-soft-black text-center text-2xl font-semibold sm:text-3xl">
          How NurseDex works
        </h2>
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-teal-dark text-xs font-semibold tracking-wider uppercase">
              For families
            </p>
            <ul className="mt-3 space-y-4">
              <Step
                icon={<Search className="size-4" />}
                title="Search and shortlist"
                desc="Filter nurses by credential, specialty, languages, distance, and availability."
              />
              <Step
                icon={<Heart className="size-4" />}
                title="Save the ones you like"
                desc="Build a shortlist as you browse. Compare bios, reviews, and rates."
              />
              <Step
                icon={<MessageSquare className="size-4" />}
                title="Reveal contact info"
                desc="Subscribe to Family Access to unlock nurse contact details and reach out directly."
              />
              <Step
                icon={<Star className="size-4" />}
                title="Hire and review"
                desc="Mark a hire on the platform, then leave a review to help the next family."
              />
            </ul>
            <Link
              href="/how-it-works#for-families"
              className="text-teal mt-4 inline-block text-sm font-medium hover:underline"
            >
              See the families flow in detail →
            </Link>
          </div>

          <div>
            <p className="text-teal-dark text-xs font-semibold tracking-wider uppercase">
              For nurses
            </p>
            <ul className="mt-3 space-y-4">
              <Step
                icon={<ClipboardList className="size-4" />}
                title="Build your profile"
                desc="Add your credentials, bio, photo, skills, languages, and availability."
              />
              <Step
                icon={<UserCheck className="size-4" />}
                title="Get verified"
                desc="Our team checks your license against the NY State database. 24-72 hours."
              />
              <Step
                icon={<Search className="size-4" />}
                title="Get found by families"
                desc="Show up in search the moment you're verified. Set your availability when you have capacity."
              />
              <Step
                icon={<Sparkles className="size-4" />}
                title="Go Featured (optional)"
                desc="Top placement, longer bio, more photos, analytics, and a verified badge."
              />
            </ul>
            <Link
              href="/how-it-works#for-nurses"
              className="text-teal mt-4 inline-block text-sm font-medium hover:underline"
            >
              See the nurses flow in detail →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Step({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex gap-3">
      <div className="bg-teal/10 text-teal flex size-7 shrink-0 items-center justify-center rounded-full">
        {icon}
      </div>
      <div>
        <p className="font-heading text-soft-black text-sm font-semibold">
          {title}
        </p>
        <p className="text-soft-black-light mt-0.5 text-sm">{desc}</p>
      </div>
    </li>
  );
}

function FinalCTAs() {
  return (
    <section className="border-sage-light/40 border-t bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-teal/20">
            <CardContent className="space-y-3 pt-6">
              <h3 className="font-heading text-soft-black text-lg font-semibold">
                Ready to find a nurse?
              </h3>
              <p className="text-soft-black-light text-sm">
                Browsing is free. You only pay if you decide to reach out
                directly to a nurse you&apos;ve found.
              </p>
              <Link
                href="/nurses"
                className="bg-teal hover:bg-teal-dark inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                Browse nurses
              </Link>
            </CardContent>
          </Card>
          <Card className="border-sage/30">
            <CardContent className="space-y-3 pt-6">
              <h3 className="font-heading text-soft-black text-lg font-semibold">
                Ready to be found?
              </h3>
              <p className="text-soft-black-light text-sm">
                Free to join. Build a profile, get verified, and let families
                come to you.
              </p>
              <Link
                href="/signup"
                className="bg-soft-black hover:bg-soft-black/90 inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                Join NurseDex
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
