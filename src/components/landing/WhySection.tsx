import {
  ShieldCheck,
  MapPin,
  Star,
  DollarSign,
  TrendingUp,
  BadgeCheck,
} from "lucide-react";

type WhySectionProps = {
  role: "nurse" | "family";
};

const content = {
  family: {
    subtitle:
      "Browse verified profiles, unlock contact info, and hire directly.",
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
        title: "New York focused",
        description:
          "Built for families across New York. Local caregivers who know your community.",
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
    subtitle:
      "Create your profile, get discovered, and connect with families directly.",
    props: [
      {
        icon: DollarSign,
        title: "Keep 100% of what you earn",
        description:
          "Families contact you directly. No agency fees, no middleman, no percentage of your pay.",
        featured: true,
      },
      {
        icon: BadgeCheck,
        title: "Free to join",
        description:
          "Create your profile at no cost. Want more visibility? Featured listings put you at the top of search results.",
        featured: false,
      },
      {
        icon: TrendingUp,
        title: "Grow your reputation",
        description:
          "Collect reviews, track profile views, and see how families find you with built-in analytics.",
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
        <h2 className="font-heading text-soft-black text-3xl sm:text-4xl">
          Why NurseDex
        </h2>
        <p className="font-body text-soft-black-light mt-3 max-w-lg">
          {subtitle}
        </p>

        {/* Featured: left text, right illustration */}
        <div className="mt-6 grid items-center gap-10 sm:grid-cols-2">
          <div className="text-left">
            <div className="bg-teal/10 mb-4 flex h-14 w-14 items-center justify-center rounded-xl">
              <featured.icon className="text-teal h-7 w-7" />
            </div>
            <h3 className="font-heading text-soft-black text-2xl sm:text-3xl">
              {featured.title}
            </h3>
            <p className="font-body text-soft-black-light mt-3 max-w-md text-lg leading-relaxed">
              {featured.description}
            </p>
          </div>

          {/* Mock profile card */}
          <div className="mt-8 sm:mt-0" aria-hidden="true">
            <div className="border-sage-light/60 mx-auto w-56 rounded-2xl border bg-white p-5 shadow-lg sm:w-64 sm:rotate-2">
              {/* Avatar + name row */}
              <div className="flex items-center gap-3">
                <div className="bg-sage-light font-heading text-teal-dark flex h-12 w-12 items-center justify-center rounded-full text-lg">
                  MR
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading text-soft-black text-base">
                      Maria R.
                    </span>
                    <BadgeCheck className="text-teal h-4 w-4" />
                  </div>
                  <span className="font-body text-soft-black-light text-xs">
                    RN &middot; Nassau County
                  </span>
                </div>
              </div>

              {/* Specialty tags */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="bg-sage-light/30 font-body text-teal-dark rounded-full px-2.5 py-0.5 text-[11px]">
                  Elderly Care
                </span>
                <span className="bg-sage-light/30 font-body text-teal-dark rounded-full px-2.5 py-0.5 text-[11px]">
                  Post-Surgical
                </span>
                <span className="bg-cream-light font-body text-teal-dark rounded-full px-2.5 py-0.5 text-[11px]">
                  Memory Care
                </span>
              </div>

              {/* Stars */}
              <div className="mt-4 flex items-center gap-1">
                {[...Array(5)].map((_, i) =>
                  i < 4 ? (
                    <Star
                      key={i}
                      className="fill-cream text-cream-dark h-3.5 w-3.5"
                    />
                  ) : (
                    <span key={i} className="relative h-3.5 w-3.5">
                      <Star className="fill-sage-light/40 text-sage-light absolute inset-0 h-3.5 w-3.5" />
                      <Star
                        className="fill-cream text-cream-dark absolute inset-0 h-3.5 w-3.5"
                        style={{ clipPath: "inset(0 50% 0 0)" }}
                      />
                    </span>
                  ),
                )}
                <span className="font-body text-soft-black-light ml-1.5 text-xs">
                  4.5 &middot; 12 reviews
                </span>
              </div>

              {/* Bio preview */}
              <div className="mt-3 space-y-1.5">
                <div className="bg-sage-light/25 h-2 w-full rounded-full" />
                <div className="bg-sage-light/25 h-2 w-4/5 rounded-full" />
                <div className="bg-sage-light/25 h-2 w-3/5 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Two smaller cards below */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {rest.map((prop) => (
            <div
              key={prop.title}
              className="border-sage-light/50 rounded-xl border bg-white p-6"
            >
              <div className="bg-cream-light mb-4 flex h-10 w-10 items-center justify-center rounded-lg">
                <prop.icon className="text-teal-dark h-5 w-5" />
              </div>
              <h3 className="font-heading text-soft-black text-lg">
                {prop.title}
              </h3>
              <p className="font-body text-soft-black-light mt-2 text-sm leading-relaxed">
                {prop.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
