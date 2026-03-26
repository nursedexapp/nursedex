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
      <div className="bg-cream px-6 sm:px-12 lg:px-24 pt-32 pb-32">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-16 lg:gap-24 items-end">
          {/* Pull Quote */}
          <blockquote className="font-heading text-5xl sm:text-6xl lg:text-7xl italic text-soft-black leading-[1.08]">
            Find care that
            <br />
            feels like family.
          </blockquote>

          {/* Narrative alongside */}
          <div className="lg:pb-2">
            <p className="font-body text-base leading-relaxed text-soft-black-light">
              NurseDex exists because finding trustworthy home healthcare on Long
              Island shouldn&apos;t feel like navigating a maze of impersonal
              staffing agencies. Families deserve to find care that feels personal,
              like a recommendation from a friend. NurseDex is the bridge
              between families who need qualified, compassionate healthcare
              professionals and independent nurses who want to be found on their
              own terms.
            </p>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Mission & Vision — Full-bleed teal-dark */}
      {/* -------------------------------------------------- */}
      <div className="bg-teal-dark px-6 sm:px-12 lg:px-24 py-24">
        <div className="max-w-6xl mx-auto">
          <h3 className="font-heading text-2xl sm:text-3xl text-sage mb-16">
            Mission &amp; Vision
          </h3>

          <div className="grid md:grid-cols-2 gap-0">
            {/* Mission */}
            <div className="pr-0 md:pr-12 pb-12 md:pb-0">
              <p className="font-body text-xs uppercase tracking-[0.25em] text-sage mb-6">
                Our Mission
              </p>
              <p className="font-heading text-2xl sm:text-3xl text-warm-white leading-snug">
                To connect Long Island families directly with qualified,
                independent healthcare professionals, removing the
                middleman so real relationships can form.
              </p>
            </div>

            {/* Divider */}
            <div className="hidden md:block absolute left-1/2 w-px bg-sage/30 self-stretch" />

            {/* Vision */}
            <div className="pl-0 md:pl-12 pt-12 md:pt-0 border-t md:border-t-0 md:border-l border-sage/30">
              <p className="font-body text-xs uppercase tracking-[0.25em] text-sage mb-6">
                Our Vision
              </p>
              <p className="font-heading text-2xl sm:text-3xl text-warm-white leading-snug">
                To become the trusted standard for finding independent healthcare
                professionals across the United States.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Brand Values — Alternating card backgrounds */}
      {/* -------------------------------------------------- */}
      <div className="bg-warm-white px-6 sm:px-12 lg:px-24 py-24">
        <div className="max-w-6xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-10">
            Brand Values
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {brandValues.map((value, index) => {
              const isOdd = index % 2 === 0; // 0-indexed, so 0,2,4 are "odd" cards (1st,3rd,5th)
              return (
                <div
                  key={value.number}
                  className={
                    isOdd
                      ? "rounded-2xl p-8 flex flex-col gap-4 bg-warm-white border-l-4 border-teal"
                      : "rounded-2xl p-8 flex flex-col gap-4 bg-teal-dark"
                  }
                >
                  <span
                    className={
                      isOdd
                        ? "font-heading text-5xl text-sage/30"
                        : "font-heading text-5xl text-warm-white/20"
                    }
                  >
                    {value.number}
                  </span>
                  <h4
                    className={
                      isOdd
                        ? "font-heading text-xl text-teal-dark"
                        : "font-heading text-xl text-warm-white"
                    }
                  >
                    {value.title}
                  </h4>
                  <p
                    className={
                      isOdd
                        ? "font-body text-soft-black-light leading-relaxed text-sm"
                        : "font-body text-warm-white/80 leading-relaxed text-sm"
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
        <div className="bg-teal-dark px-8 sm:px-12 lg:px-16 py-24">
          <p className="font-body text-xs uppercase tracking-[0.25em] text-sage mb-4">
            Brand Personality
          </p>
          <h3 className="font-heading text-3xl sm:text-4xl text-warm-white mb-12">
            We Are
          </h3>
          <ul className="space-y-5">
            {weAre.map((trait) => (
              <li key={trait} className="flex items-center gap-4">
                <span className="w-2 h-2 rounded-full bg-sage shrink-0" />
                <span className="font-heading text-2xl sm:text-3xl text-warm-white">
                  {trait}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right half — We Are Not (light) */}
        <div className="bg-warm-white px-8 sm:px-12 lg:px-16 py-24">
          <p className="font-body text-xs uppercase tracking-[0.25em] text-sage-dark mb-4">
            &nbsp;
          </p>
          <h3 className="font-heading text-3xl sm:text-4xl text-soft-black-light mb-12">
            We Are Not
          </h3>
          <ul className="space-y-5">
            {weAreNot.map((trait) => (
              <li key={trait} className="flex items-center gap-4">
                <span className="w-2 h-2 rounded-full bg-cream-dark shrink-0" />
                <span className="font-heading text-2xl sm:text-3xl text-soft-black-light/50 line-through decoration-1">
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
      <div className="bg-sage/10 px-6 sm:px-12 lg:px-24 py-24">
        <div className="max-w-6xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-10">
            Target Audiences
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {audiences.map((persona) => (
              <div
                key={persona.label}
                className="rounded-2xl overflow-hidden border border-cream-dark flex flex-col"
              >
                {/* Persona header */}
                <div className="bg-teal px-8 py-5">
                  <h4 className="font-heading text-xl text-warm-white">
                    {persona.label}
                  </h4>
                </div>

                {/* Persona body */}
                <div className="bg-white px-8 py-8 space-y-4 flex-1">
                  <div>
                    <p className="font-body text-xs uppercase tracking-[0.2em] text-sage-dark mb-1">
                      Demographic
                    </p>
                    <p className="font-body text-soft-black leading-relaxed">
                      {persona.demographic}
                    </p>
                  </div>
                  <div className="w-full h-px bg-cream-dark" />
                  <div>
                    <p className="font-body text-xs uppercase tracking-[0.2em] text-sage-dark mb-1">
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
