const brandValues = [
  {
    number: "01",
    title: "Trust First",
    description:
      "Every interaction on NurseDex is built on transparency. License verification, honest profiles, clear pricing. No hidden middlemen, no surprises.",
  },
  {
    number: "02",
    title: "Human Connection",
    description:
      "Technology should get out of the way so real relationships can form. We build tools that feel personal, not transactional.",
  },
  {
    number: "03",
    title: "Dignity & Respect",
    description:
      "For both the caregivers who dedicate their lives to helping others and the families navigating vulnerable moments.",
  },
  {
    number: "04",
    title: "Accessible Care",
    description:
      "Removing barriers between families and the help they need. Simple search, clear information, direct contact.",
  },
  {
    number: "05",
    title: "Community Rooted",
    description:
      "Starting local on Long Island, staying personal. Every market we enter, we serve like neighbors.",
  },
];

const weAre = [
  "Warm",
  "Trustworthy",
  "Professional",
  "Approachable",
  "Reassuring",
  "Knowledgeable",
];

const weAreNot = [
  "Clinical",
  "Corporate",
  "Sterile",
  "Salesy",
  "Impersonal",
  "Jargon-heavy",
];

const audiences = [
  {
    label: "Families",
    demographic: "Adult children (30 to 60) seeking care for aging parents",
    painPoints:
      "Overwhelmed, time-constrained, emotionally vulnerable. Want a personal touch, not an agency runaround.",
  },
  {
    label: "Nurses & HHAs",
    demographic:
      "Independent healthcare professionals (25 to 55) seeking clients directly",
    painPoints:
      "Value autonomy, want visibility and credibility without agency overhead.",
  },
];

export default function FoundationSection() {
  return (
    <section id="foundation">
      {/* -------------------------------------------------- */}
      {/* Brand Story — Pull quote IS the section intro */}
      {/* -------------------------------------------------- */}
      <div className="bg-cream px-6 pt-32 pb-32 sm:px-12 lg:px-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-end gap-16 lg:grid-cols-[2fr_1fr] lg:gap-24">
          {/* Pull Quote */}
          <blockquote className="font-heading text-soft-black text-5xl leading-[1.08] italic sm:text-6xl lg:text-7xl">
            Find care that
            <br />
            feels like family.
          </blockquote>

          {/* Narrative alongside */}
          <div className="lg:pb-2">
            <p className="font-body text-soft-black-light text-base leading-relaxed">
              NurseDex exists because finding trustworthy home healthcare on
              Long Island shouldn&apos;t feel like navigating a maze of
              impersonal staffing agencies. Families deserve to find care that
              feels personal, like a recommendation from a friend. NurseDex is
              the bridge between families who need qualified, compassionate
              healthcare professionals and independent nurses who want to be
              found on their own terms.
            </p>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Mission & Vision — Full-bleed teal-dark */}
      {/* -------------------------------------------------- */}
      <div className="bg-teal-dark px-6 py-24 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <h3 className="font-heading text-sage mb-16 text-2xl sm:text-3xl">
            Mission &amp; Vision
          </h3>

          <div className="grid gap-0 md:grid-cols-2">
            {/* Mission */}
            <div className="pr-0 pb-12 md:pr-12 md:pb-0">
              <p className="font-body text-sage mb-6 text-xs tracking-[0.25em] uppercase">
                Our Mission
              </p>
              <p className="font-heading text-warm-white text-2xl leading-snug sm:text-3xl">
                To connect Long Island families directly with qualified,
                independent healthcare professionals, removing the middleman so
                real relationships can form.
              </p>
            </div>

            {/* Divider */}
            <div className="bg-sage/30 absolute left-1/2 hidden w-px self-stretch md:block" />

            {/* Vision */}
            <div className="border-sage/30 border-t pt-12 pl-0 md:border-t-0 md:border-l md:pt-0 md:pl-12">
              <p className="font-body text-sage mb-6 text-xs tracking-[0.25em] uppercase">
                Our Vision
              </p>
              <p className="font-heading text-warm-white text-2xl leading-snug sm:text-3xl">
                To become the trusted standard for finding independent
                healthcare professionals across the United States.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Brand Values — Alternating card backgrounds */}
      {/* -------------------------------------------------- */}
      <div className="bg-warm-white px-6 py-24 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <p className="font-body text-sage-dark mb-10 text-xs tracking-[0.4em] uppercase">
            Brand Values
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {brandValues.map((value, index) => {
              const isOdd = index % 2 === 0; // 0-indexed, so 0,2,4 are "odd" cards (1st,3rd,5th)
              return (
                <div
                  key={value.number}
                  className={
                    isOdd
                      ? "bg-warm-white border-teal flex flex-col gap-4 rounded-2xl border-l-4 p-8"
                      : "bg-teal-dark flex flex-col gap-4 rounded-2xl p-8"
                  }
                >
                  <span
                    className={
                      isOdd
                        ? "font-heading text-sage/30 text-5xl"
                        : "font-heading text-warm-white/20 text-5xl"
                    }
                  >
                    {value.number}
                  </span>
                  <h4
                    className={
                      isOdd
                        ? "font-heading text-teal-dark text-xl"
                        : "font-heading text-warm-white text-xl"
                    }
                  >
                    {value.title}
                  </h4>
                  <p
                    className={
                      isOdd
                        ? "font-body text-soft-black-light text-sm leading-relaxed"
                        : "font-body text-warm-white/80 text-sm leading-relaxed"
                    }
                  >
                    {value.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Brand Personality — Dramatic 50/50 Split */}
      {/* -------------------------------------------------- */}
      <div className="grid md:grid-cols-2">
        {/* Left half — We Are (dark) */}
        <div className="bg-teal-dark px-8 py-24 sm:px-12 lg:px-16">
          <p className="font-body text-sage mb-4 text-xs tracking-[0.25em] uppercase">
            Brand Personality
          </p>
          <h3 className="font-heading text-warm-white mb-12 text-3xl sm:text-4xl">
            We Are
          </h3>
          <ul className="space-y-5">
            {weAre.map((trait) => (
              <li key={trait} className="flex items-center gap-4">
                <span className="bg-sage h-2 w-2 shrink-0 rounded-full" />
                <span className="font-heading text-warm-white text-2xl sm:text-3xl">
                  {trait}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right half — We Are Not (light) */}
        <div className="bg-warm-white px-8 py-24 sm:px-12 lg:px-16">
          <p className="font-body text-sage-dark mb-4 text-xs tracking-[0.25em] uppercase">
            &nbsp;
          </p>
          <h3 className="font-heading text-soft-black-light mb-12 text-3xl sm:text-4xl">
            We Are Not
          </h3>
          <ul className="space-y-5">
            {weAreNot.map((trait) => (
              <li key={trait} className="flex items-center gap-4">
                <span className="bg-cream-dark h-2 w-2 shrink-0 rounded-full" />
                <span className="font-heading text-soft-black-light/50 text-2xl line-through decoration-1 sm:text-3xl">
                  {trait}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Target Audiences — Sage background */}
      {/* -------------------------------------------------- */}
      <div className="bg-sage/10 px-6 py-24 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <p className="font-body text-sage-dark mb-10 text-xs tracking-[0.4em] uppercase">
            Target Audiences
          </p>

          <div className="grid gap-8 md:grid-cols-2">
            {audiences.map((persona) => (
              <div
                key={persona.label}
                className="border-cream-dark flex flex-col overflow-hidden rounded-2xl border"
              >
                {/* Persona header */}
                <div className="bg-teal px-8 py-5">
                  <h4 className="font-heading text-warm-white text-xl">
                    {persona.label}
                  </h4>
                </div>

                {/* Persona body */}
                <div className="flex-1 space-y-4 bg-white px-8 py-8">
                  <div>
                    <p className="font-body text-sage-dark mb-1 text-xs tracking-[0.2em] uppercase">
                      Demographic
                    </p>
                    <p className="font-body text-soft-black leading-relaxed">
                      {persona.demographic}
                    </p>
                  </div>
                  <div className="bg-cream-dark h-px w-full" />
                  <div>
                    <p className="font-body text-sage-dark mb-1 text-xs tracking-[0.2em] uppercase">
                      Needs &amp; Pain Points
                    </p>
                    <p className="font-body text-soft-black-light leading-relaxed">
                      {persona.painPoints}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
