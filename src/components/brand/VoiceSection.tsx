const voiceAttributes = [
  {
    attribute: "Warm but not saccharine",
    description:
      "We care deeply, but we don't lay it on thick. Empathy without excess.",
  },
  {
    attribute: "Clear but not clinical",
    description:
      "Plain language that anyone can understand. No medical jargon walls.",
  },
  {
    attribute: "Confident but not authoritative",
    description: "We know our stuff, but we're guides, not gatekeepers.",
  },
  {
    attribute: "Helpful but not patronizing",
    description: "We anticipate needs without assuming incompetence.",
  },
  {
    attribute: "Professional but not stiff",
    description: "Polished and reliable, but never robotic or cold.",
  },
];

const toneSpectrum = [
  {
    context: "Marketing / Homepage",
    mood: "Warm, inviting, aspirational",
    example:
      "Find the right nurse for your family. No agencies, no middlemen, just care.",
    color: "bg-teal",
  },
  {
    context: "Onboarding / Product UI",
    mood: "Clear, encouraging, guiding",
    example:
      "Let's set up your profile. The more you share, the better families can find you.",
    color: "bg-sage",
  },
  {
    context: "Transactional (Emails)",
    mood: "Friendly but concise",
    example:
      "Your subscription is active. You can now view nurse contact information.",
    color: "bg-teal-dark",
  },
  {
    context: "Error / Failure States",
    mood: "Empathetic, reassuring, solution-oriented",
    example:
      "We couldn't process your payment. Let's get that sorted. Update your payment method below.",
    color: "bg-warning",
  },
  {
    context: "Legal / Compliance",
    mood: "Straightforward, transparent",
    example:
      "NurseDex verifies licenses at signup but does not monitor ongoing licensure status.",
    color: "bg-soft-black",
  },
];

const writingDos = [
  "Use contractions (we're, you'll, it's)",
  "Address the reader directly (you, your)",
  "Lead with the benefit, not the feature",
  'Use "nurse" and "family", not "provider" and "consumer"',
  'Define medical terms on first use: "Registered Nurse (RN)"',
];

const writingDonts = [
  "Don't use medical jargon without explanation",
  "Don't use fear-based or urgency-driven language",
  'Don\'t say "patients." Say "loved ones" or "family members"',
  "Don't overpromise (never guarantee outcomes of care)",
  'Don\'t use "provider," "consumer," "client," or "caregiver" generically',
  "Don't use em dashes, en dashes, or double hyphens. Use periods, commas, or colons instead.",
];

const beforeAfter = [
  {
    label: "Homepage Hero",
    before: "Healthcare staffing solutions for your family",
    after: "Find a nurse your family can trust",
  },
  {
    label: "CTA Button",
    before: "Subscribe Now",
    after: "Start Finding Nurses",
  },
  {
    label: "Empty Search",
    before: "No results found",
    after:
      "No nurses match that search yet. Try adjusting your filters, or browse all nurses nearby.",
  },
  {
    label: "Error Message",
    before: "Error processing payment",
    after:
      "We couldn't process your payment. Let's fix that. You can update your card below.",
  },
  {
    label: "Email Subject",
    before: "Your NurseDex Account Update",
    after: "Welcome to NurseDex. Let's find your family the right care",
  },
];

const namingConventions = [
  {
    category: "Feature Names",
    rule: "Simple descriptive English, no branded feature names",
  },
  {
    category: "Credentials",
    rule: 'Always define on first use: "Registered Nurse (RN)"',
  },
  {
    category: "Care Types",
    rule: "Elder Care, Pediatric Care, Post-Surgical Care, Memory Care, Hospice Support, Private Duty Nursing",
  },
  {
    category: "User Terminology",
    rule: '"Nurse" (never "provider") / "Family" (never "client" or "consumer")',
  },
];

export default function VoiceSection() {
  return (
    <section id="voice">
      {/* -------------------------------------------------- */}
      {/* Section Header + Brand Voice — editorial dark block */}
      {/* -------------------------------------------------- */}
      <div className="bg-soft-black px-6 pt-32 pb-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <p className="font-heading text-warm-white mb-16 max-w-4xl text-3xl leading-snug italic sm:text-4xl lg:text-5xl">
            NurseDex speaks like a knowledgeable friend who happens to work in
            healthcare. Not a doctor giving a diagnosis. Not a corporate
            operator reading a script.
          </p>

          <p className="font-body text-sage/70 max-w-2xl text-lg">
            We&apos;re the person you&apos;d call at 10 PM when you need real
            advice about finding a home health aide for your mom.
          </p>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Voice Attributes */}
      {/* -------------------------------------------------- */}
      <div className="bg-warm-white mx-auto max-w-6xl px-6 py-24 sm:px-12 lg:px-24">
        {/* Voice Attributes — stacked list with sage rules */}
        <div className="divide-sage/30 divide-y">
          {voiceAttributes.map((item) => (
            <div key={item.attribute} className="py-6 first:pt-0 last:pb-0">
              <h4 className="font-heading text-teal-dark mb-1 text-xl">
                {item.attribute}
              </h4>
              <p className="font-body text-soft-black-light leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Tone Spectrum — full-bleed colored bands */}
      {/* -------------------------------------------------- */}
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12 lg:px-24">
        <h3 className="font-heading text-teal-dark mb-4 text-3xl sm:text-4xl lg:text-5xl">
          Tone Spectrum
        </h3>
        <p className="font-body text-soft-black-light mb-10 max-w-2xl">
          Our voice stays consistent, but our tone adapts to context.
          Here&apos;s how we shift across different touchpoints.
        </p>

        {/* Spectrum Bar — taller */}
        <div className="mb-10 flex h-4 overflow-hidden rounded-xl">
          {toneSpectrum.map((item) => (
            <div key={item.context} className={`flex-1 ${item.color}`} />
          ))}
        </div>
      </div>

      {/* Full-width tone bands */}
      {toneSpectrum.map((item) => (
        <div key={item.context} className={`${item.color} w-full`}>
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:gap-12 sm:px-12 lg:px-24">
            <div className="shrink-0 sm:w-64">
              <p className="font-heading text-warm-white text-base leading-tight">
                {item.context}
              </p>
              <p className="font-body text-warm-white/70 mt-1 text-xs">
                {item.mood}
              </p>
            </div>
            <p className="font-body text-warm-white leading-relaxed italic">
              &ldquo;{item.example}&rdquo;
            </p>
          </div>
        </div>
      ))}

      {/* -------------------------------------------------- */}
      {/* Writing Do's and Don'ts — full-bleed */}
      {/* -------------------------------------------------- */}
      <div className="px-6 py-16 sm:px-12 lg:px-24">
        <div className="mx-auto mb-10 max-w-6xl">
          <p className="font-body text-sage-dark text-xs tracking-[0.4em] uppercase">
            Writing Do&apos;s &amp; Don&apos;ts
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Do's */}
          <div className="bg-teal-dark rounded-2xl p-8 sm:p-10">
            <div className="mb-6 flex items-center gap-3">
              <span className="bg-success flex h-8 w-8 items-center justify-center rounded-full">
                <svg
                  className="text-warm-white h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </span>
              <p className="font-body text-sage text-xs tracking-[0.25em] uppercase">
                Do
              </p>
            </div>
            <ul className="space-y-4">
              {writingDos.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="bg-sage mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
                  <span className="font-body text-warm-white leading-relaxed">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Don'ts */}
          <div className="bg-cream-light border-cream-dark rounded-2xl border p-8 sm:p-10">
            <div className="mb-6 flex items-center gap-3">
              <span className="bg-error flex h-8 w-8 items-center justify-center rounded-full">
                <svg
                  className="text-warm-white h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </span>
              <p className="font-body text-sage-dark text-xs tracking-[0.25em] uppercase">
                Don&apos;t
              </p>
            </div>
            <ul className="space-y-4">
              {writingDonts.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="bg-cream-dark mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
                  <span className="font-body text-soft-black-light leading-relaxed">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Before / After Samples — white bg, no cream-dark borders */}
      {/* -------------------------------------------------- */}
      {beforeAfter.map((item, i) => (
        <div
          key={item.label}
          className={i % 2 === 0 ? "bg-white" : "bg-warm-white"}
        >
          <div className="mx-auto max-w-6xl px-6 py-20 sm:px-12 lg:px-24">
            <p className="font-body text-sage-dark mb-10 text-[10px] tracking-[0.4em] uppercase">
              {item.label}
            </p>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-16">
              {/* Before */}
              <div>
                <p className="font-body text-error/60 mb-3 text-[10px] tracking-widest uppercase md:hidden">
                  Before
                </p>
                <p className="font-heading text-soft-black-light/40 decoration-error/60 text-2xl leading-snug line-through decoration-2 sm:text-3xl">
                  {item.before}
                </p>
              </div>

              {/* Separator on mobile */}
              <div className="bg-sage/20 h-px md:hidden" />

              {/* After */}
              <div>
                <p className="font-body text-teal/60 mb-3 text-[10px] tracking-widest uppercase md:hidden">
                  After
                </p>
                <p className="font-heading text-teal-dark text-2xl leading-snug sm:text-3xl">
                  {item.after}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* -------------------------------------------------- */}
      {/* Naming Conventions — simple two-column text list */}
      {/* -------------------------------------------------- */}
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-6 pt-16 pb-24 sm:px-12 lg:px-24">
          <p className="font-body text-sage-dark mb-10 text-xs tracking-[0.4em] uppercase">
            Naming Conventions
          </p>

          <div className="divide-sage/20 divide-y">
            {namingConventions.map((item) => (
              <div
                key={item.category}
                className="grid gap-2 py-5 first:pt-0 last:pb-0 sm:grid-cols-[200px_1fr] sm:gap-8"
              >
                <p className="font-body text-sage-dark pt-0.5 text-xs font-semibold tracking-[0.25em] uppercase">
                  {item.category}
                </p>
                <p className="font-body text-soft-black leading-relaxed">
                  {item.rule}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
