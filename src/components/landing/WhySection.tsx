import { ShieldCheck, MapPin, Star, DollarSign, TrendingUp, MessageCircle, BadgeCheck } from "lucide-react";

type WhySectionProps = {
  role: "nurse" | "family";
};

const content = {
  family: {
    subtitle: "Browse verified profiles, unlock contact info, and hire directly.",
    props: [
      {
        icon: ShieldCheck,
        title: "Verified caregivers",
        description:
          "Every nurse and aide on NurseDex is credential-checked. You see real qualifications, not guesswork.",
        featured: true,
      },
      {
        icon: MapPin,
        title: "Long Island focused",
        description:
          "Built specifically for Nassau, Suffolk, and Queens. Local caregivers who know your community.",
        featured: false,
      },
      {
        icon: Star,
        title: "Honest reviews",
        description:
          "Read reviews from real families. Every review is moderated so you can trust what you see.",
        featured: false,
      },
    ],
  },
  nurse: {
    subtitle: "Create your profile, get discovered, and connect with families directly.",
    props: [
      {
        icon: DollarSign,
        title: "Free to join",
        description:
          "Create your profile at no cost. Want more visibility? Featured listings put you at the top of search results.",
        featured: true,
      },
      {
        icon: TrendingUp,
        title: "Grow your reputation",
        description:
          "Collect reviews, track profile views, and see how families find you with built-in analytics.",
        featured: false,
      },
      {
        icon: MessageCircle,
        title: "Direct relationships",
        description:
          "Families contact you directly. No agency fees, no middleman, no percentage of your pay.",
        featured: false,
      },
    ],
  },
};

export function WhySection({ role }: WhySectionProps) {
  const { subtitle, props: currentProps } = content[role];
  const featured = currentProps[0];
  const rest = currentProps.slice(1);

  return (
    <section className="bg-white px-6 pt-10 pb-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-heading text-3xl text-soft-black sm:text-4xl">
          Why NurseDex
        </h2>
        <p className="mt-3 max-w-lg font-body text-soft-black-light">
          {subtitle}
        </p>

        {/* Featured: left text, right illustration */}
        <div className="mt-6 grid items-center gap-10 sm:grid-cols-2">
          <div className="text-left">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-teal/10">
              <featured.icon className="h-7 w-7 text-teal" />
            </div>
            <h3 className="font-heading text-2xl text-soft-black sm:text-3xl">
              {featured.title}
            </h3>
            <p className="mt-3 max-w-md font-body text-lg leading-relaxed text-soft-black-light">
              {featured.description}
            </p>
          </div>

          {/* Mock profile card */}
          <div className="mt-8 sm:mt-0" aria-hidden="true">
            <div className="mx-auto w-56 rounded-2xl border border-sage-light/60 bg-white p-5 shadow-lg sm:w-64 sm:rotate-2">
              {/* Avatar + name row */}
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sage-light/50 font-heading text-lg text-teal">
                  MR
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading text-base text-soft-black">Maria R.</span>
                    <BadgeCheck className="h-4 w-4 text-teal" />
                  </div>
                  <span className="font-body text-xs text-soft-black-light">RN &middot; Nassau County</span>
                </div>
              </div>

              {/* Specialty tags */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-sage-light/30 px-2.5 py-0.5 font-body text-[11px] text-teal-dark">Elderly Care</span>
                <span className="rounded-full bg-sage-light/30 px-2.5 py-0.5 font-body text-[11px] text-teal-dark">Post-Surgical</span>
                <span className="rounded-full bg-cream-light px-2.5 py-0.5 font-body text-[11px] text-teal-dark">Memory Care</span>
              </div>

              {/* Stars */}
              <div className="mt-4 flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  i < 4 ? (
                    <Star key={i} className="h-3.5 w-3.5 fill-cream text-cream-dark" />
                  ) : (
                    <span key={i} className="relative h-3.5 w-3.5">
                      <Star className="absolute inset-0 h-3.5 w-3.5 fill-sage-light/40 text-sage-light" />
                      <Star className="absolute inset-0 h-3.5 w-3.5 fill-cream text-cream-dark" style={{ clipPath: "inset(0 50% 0 0)" }} />
                    </span>
                  )
                ))}
                <span className="ml-1.5 font-body text-xs text-soft-black-light">4.5 &middot; 12 reviews</span>
              </div>

              {/* Bio preview */}
              <div className="mt-3 space-y-1.5">
                <div className="h-2 w-full rounded-full bg-sage-light/25" />
                <div className="h-2 w-4/5 rounded-full bg-sage-light/25" />
                <div className="h-2 w-3/5 rounded-full bg-sage-light/25" />
              </div>
            </div>
          </div>
        </div>

        {/* Two smaller cards below */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {rest.map((prop) => (
            <div
              key={prop.title}
              className="rounded-xl border border-sage-light/50 bg-white p-6"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-cream-light">
                <prop.icon className="h-5 w-5 text-teal-dark" />
              </div>
              <h3 className="font-heading text-lg text-soft-black">
                {prop.title}
              </h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-soft-black-light">
                {prop.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
