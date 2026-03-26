const typeScale = [
  {
    label: "H1",
    spec: "36px / Fraunces SemiBold / 1.2",
    className: "font-heading text-[36px] font-semibold leading-[1.2] text-teal-dark",
    sample: "Find care that feels like family",
  },
  {
    label: "H2",
    spec: "28px / Fraunces Medium / 1.3",
    className: "font-heading text-[28px] font-medium leading-[1.3] text-teal-dark",
    sample: "Connecting families with nurses they can trust",
  },
  {
    label: "H3",
    spec: "22px / Fraunces Medium / 1.4",
    className: "font-heading text-[22px] font-medium leading-[1.4] text-teal-dark",
    sample: "Licensed professionals, verified credentials",
  },
  {
    label: "H4",
    spec: "18px / DM Sans SemiBold / 1.4",
    className: "font-body text-[18px] font-semibold leading-[1.4] text-soft-black",
    sample: "No agencies, no middlemen, just care",
  },
  {
    label: "Body Large",
    spec: "18px / DM Sans Regular / 1.6",
    className: "font-body text-[18px] font-normal leading-[1.6] text-soft-black",
    sample:
      "NurseDex connects Long Island families with qualified healthcare professionals who treat your loved ones like their own.",
  },
  {
    label: "Body",
    spec: "16px / DM Sans Regular / 1.6",
    className: "font-body text-[16px] font-normal leading-[1.6] text-soft-black",
    sample:
      "Browse verified nurse profiles, read reviews from real families, and connect directly. No staffing agency required.",
  },
  {
    label: "Body Small",
    spec: "14px / DM Sans Regular / 1.5",
    className: "font-body text-[14px] font-normal leading-[1.5] text-soft-black-light",
    sample:
      "NurseDex verifies licenses at signup but does not monitor ongoing licensure status.",
  },
  {
    label: "Caption",
    spec: "12px / DM Sans Medium / 1.5",
    className: "font-body text-[12px] font-medium leading-[1.5] text-soft-black-light",
    sample: "Last verified: March 2026 · Long Island, NY",
  },
  {
    label: "Overline",
    spec: "11px / DM Sans Medium / uppercase / tracking 0.1em",
    className:
      "font-body text-[11px] font-medium leading-[1.5] uppercase tracking-[0.1em] text-soft-black-light",
    sample: "Featured Nurse",
  },
];

const typeDos = [
  "Maintain consistent hierarchy across pages and components",
  "Use ample line spacing in body text (1.5 to 1.6)",
  "Use Fraunces for headlines and pull quotes",
];

const typeDonts = [
  "Don\u2019t use Fraunces for long body paragraphs",
  "Don\u2019t use more than 2 type sizes on a single card",
  "Don\u2019t center-align body text longer than 3 lines",
  "Don\u2019t use all-caps with Fraunces (it loses its warmth)",
];

export default function TypographySection() {
  return (
    <section id="typography" className="bg-warm-white">
      {/* Hero Specimen — section header IS the specimen */}
      <div className="bg-teal-dark px-6 sm:px-12 lg:px-24 pt-32 pb-32">
        <div className="max-w-7xl mx-auto">
          <p className="font-heading text-[clamp(3rem,10vw,8rem)] font-semibold leading-[0.95] text-warm-white tracking-tight">
            Find care
            <br />
            that feels
            <br />
            like family
          </p>
          <div className="mt-10 flex items-center gap-4">
            <div className="w-8 h-0.5 bg-sage/40" />
            <p className="font-body text-sm text-sage/60">
              Fraunces &middot; Display &middot; SemiBold
            </p>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Fraunces Specimen                                  */}
      {/* -------------------------------------------------- */}
      <div className="border-t border-sage/20">
        <div className="px-6 sm:px-12 lg:px-24 py-24 max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-16">
            <h3 className="font-heading text-[clamp(4rem,8vw,9rem)] text-teal-dark leading-[0.85] tracking-tight">
              Fraunces
            </h3>
            <p className="font-body text-lg text-soft-black-light max-w-md lg:pb-4">
              Soft, rounded serif with personality. Communicates warmth
              and trust without being clinical.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-heading text-[clamp(1.5rem,3.5vw,3rem)] text-soft-black/20 leading-relaxed tracking-wide break-all">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ
            </p>
            <p className="font-heading text-[clamp(1.5rem,3.5vw,3rem)] text-soft-black/20 leading-relaxed tracking-wide break-all">
              abcdefghijklmnopqrstuvwxyz
            </p>
            <p className="font-heading text-[clamp(1.5rem,3.5vw,3rem)] text-soft-black/20 leading-relaxed tracking-wide">
              0123456789 !@#$%&amp;*()
            </p>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* DM Sans Specimen                                   */}
      {/* -------------------------------------------------- */}
      <div className="border-t border-sage/20">
        <div className="px-6 sm:px-12 lg:px-24 py-24 max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-16">
            <h3 className="font-body text-[clamp(4rem,8vw,8rem)] font-semibold text-soft-black leading-[0.85] tracking-tight">
              DM Sans
            </h3>
            <p className="font-body text-lg text-soft-black-light max-w-md lg:pb-4">
              Clean geometric sans-serif. Highly legible at all sizes.
              Professional without being cold.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-body text-[clamp(1.5rem,3.5vw,3rem)] text-soft-black/20 leading-relaxed tracking-wide break-all">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ
            </p>
            <p className="font-body text-[clamp(1.5rem,3.5vw,3rem)] text-soft-black/20 leading-relaxed tracking-wide break-all">
              abcdefghijklmnopqrstuvwxyz
            </p>
            <p className="font-body text-[clamp(1.5rem,3.5vw,3rem)] text-soft-black/20 leading-relaxed tracking-wide">
              0123456789 !@#$%&amp;*()
            </p>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Type Scale — Each level gets room to breathe       */}
      {/* -------------------------------------------------- */}
      <div className="border-t border-sage/20">
        <div className="px-6 sm:px-12 lg:px-24 py-32 max-w-7xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-6">
            Type Scale
          </p>
          <p className="font-body text-soft-black-light mb-20 max-w-2xl">
            A modular scale ensures consistent rhythm across every screen.
            Each level has a defined role. Headings command attention,
            body text invites reading.
          </p>

          <div className="border-t border-sage/20">
            {typeScale.map((level) => (
              <div
                key={level.label}
                className="py-12 border-b border-sage/20 grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 lg:gap-12 items-baseline"
              >
                <div className="space-y-1">
                  <p className="font-body text-base font-semibold text-soft-black">
                    {level.label}
                  </p>
                  <p className="font-body text-xs text-soft-black-light leading-relaxed">
                    {level.spec}
                  </p>
                </div>
                <p className={level.className}>{level.sample}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Dark Background — Type on teal                     */}
      {/* -------------------------------------------------- */}
      <div className="bg-teal-dark">
        <div className="px-6 sm:px-12 lg:px-24 py-32 max-w-7xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.3em] text-sage/60 mb-16">
            On Dark Backgrounds
          </p>

          <div className="space-y-6 mb-20">
            <p className="font-heading text-[clamp(2.5rem,6vw,4rem)] font-semibold leading-[1.05] text-warm-white">
              Find care that
              <br />
              feels like family
            </p>
            <p className="font-body text-xs text-sage/50 uppercase tracking-widest">
              Display
            </p>
          </div>

          <div className="space-y-16">
            <div>
              <p className="font-heading text-[36px] font-semibold leading-[1.2] text-warm-white">
                Find care that feels like family
              </p>
              <p className="font-body text-xs text-sage/50 mt-3 uppercase tracking-widest">H1</p>
            </div>
            <div>
              <p className="font-heading text-[28px] font-medium leading-[1.3] text-warm-white/90">
                Connecting families with nurses they can trust
              </p>
              <p className="font-body text-xs text-sage/50 mt-3 uppercase tracking-widest">H2</p>
            </div>
            <div>
              <p className="font-heading text-[22px] font-medium leading-[1.4] text-warm-white/80">
                Licensed professionals, verified credentials
              </p>
              <p className="font-body text-xs text-sage/50 mt-3 uppercase tracking-widest">H3</p>
            </div>
            <div>
              <p className="font-body text-[18px] leading-[1.6] text-sage-light">
                NurseDex connects Long Island families with qualified healthcare
                professionals who treat your loved ones like their own. Browse
                verified profiles, read reviews, and connect directly.
              </p>
              <p className="font-body text-xs text-sage/50 mt-3 uppercase tracking-widest">Body Large</p>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Font Pairing — Asymmetric editorial layout         */}
      {/* -------------------------------------------------- */}
      <div className="px-6 sm:px-12 lg:px-24 py-32 max-w-7xl mx-auto">
        <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-20">
          Font Pairing Rules
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-16 lg:gap-24">
          <div>
            <h4 className="font-heading text-4xl sm:text-5xl lg:text-6xl text-teal-dark leading-[1.05] mb-8">
              Find care that
              <br />
              feels like family
            </h4>
            <p className="font-body text-xl text-soft-black leading-relaxed mb-4 max-w-lg">
              NurseDex connects Long Island families with qualified healthcare
              professionals who treat your loved ones like their own.
            </p>
            <p className="font-body text-base font-semibold text-teal">
              Start Finding Nurses &rarr;
            </p>
          </div>

          <div className="space-y-12 lg:pt-4">
            <div className="border-l-2 border-sage pl-6">
              <p className="font-body text-xs uppercase tracking-[0.25em] text-sage-dark mb-3">
                Context
              </p>
              <p className="font-body text-soft-black leading-relaxed">
                Use <span className="font-heading text-teal-dark">Fraunces</span>{" "}
                for emotional and marketing content.{" "}
                <span className="font-semibold">DM Sans</span> for functional
                and UI content.
              </p>
            </div>
            <div className="border-l-2 border-sage pl-6">
              <p className="font-body text-xs uppercase tracking-[0.25em] text-sage-dark mb-3">
                Minimum Size
              </p>
              <p className="font-body text-soft-black leading-relaxed">
                Never use Fraunces below{" "}
                <span className="font-semibold">18px</span>. At small sizes it
                loses legibility and personality.
              </p>
            </div>
            <div className="border-l-2 border-sage pl-6">
              <p className="font-body text-xs uppercase tracking-[0.25em] text-sage-dark mb-3">
                Weight Limit
              </p>
              <p className="font-body text-soft-black leading-relaxed">
                Maximum <span className="font-semibold">3 weights</span> per
                font in a single layout to maintain visual harmony.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Do's and Don'ts                                    */}
      {/* -------------------------------------------------- */}
      <div className="border-t border-sage/20">
        <div className="px-6 sm:px-12 lg:px-24 py-24 max-w-7xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-16">
            Do&apos;s &amp; Don&apos;ts
          </p>

          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-teal-dark mb-10">
                Do
              </p>
              <ul className="space-y-8">
                {typeDos.map((item) => (
                  <li key={item} className="flex items-start gap-4">
                    <span className="mt-0.5 text-teal text-lg leading-none">&#10003;</span>
                    <span className="font-body text-soft-black leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-soft-black-light mb-10">
                Don&apos;t
              </p>
              <ul className="space-y-8">
                {typeDonts.map((item) => (
                  <li key={item} className="flex items-start gap-4">
                    <span className="mt-0.5 text-red-500 text-lg leading-none">&#10005;</span>
                    <span className="font-body text-soft-black-light leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* System & Fallback Fonts                            */}
      {/* -------------------------------------------------- */}
      <div className="px-6 sm:px-12 lg:px-24 pt-24 pb-32 max-w-7xl mx-auto">
        <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-16">
          System &amp; Fallback Fonts
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-soft-black rounded-xl p-10 overflow-x-auto">
            <p className="font-body text-xs uppercase tracking-[0.25em] text-sage/60 mb-6">
              Headings
            </p>
            <code className="font-mono text-base text-sage-light leading-relaxed block">
              font-family:
              <br />
              &nbsp;&nbsp;&apos;Fraunces&apos;,
              <br />
              &nbsp;&nbsp;Georgia,
              <br />
              &nbsp;&nbsp;&apos;Times New Roman&apos;,
              <br />
              &nbsp;&nbsp;serif;
            </code>
          </div>

          <div className="bg-soft-black rounded-xl p-10 overflow-x-auto">
            <p className="font-body text-xs uppercase tracking-[0.25em] text-sage/60 mb-6">
              Body
            </p>
            <code className="font-mono text-base text-sage-light leading-relaxed block">
              font-family:
              <br />
              &nbsp;&nbsp;&apos;DM Sans&apos;,
              <br />
              &nbsp;&nbsp;&apos;Helvetica Neue&apos;,
              <br />
              &nbsp;&nbsp;Arial,
              <br />
              &nbsp;&nbsp;sans-serif;
            </code>
          </div>
        </div>
      </div>
    </section>
  );
}
