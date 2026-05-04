const typeScale = [
  {
    label: "H1",
    spec: "36px / Fraunces SemiBold / 1.2",
    className:
      "font-heading text-[36px] font-semibold leading-[1.2] text-teal-dark",
    sample: "Find care that feels like family",
  },
  {
    label: "H2",
    spec: "28px / Fraunces Medium / 1.3",
    className:
      "font-heading text-[28px] font-medium leading-[1.3] text-teal-dark",
    sample: "Connecting families with nurses they can trust",
  },
  {
    label: "H3",
    spec: "22px / Fraunces Medium / 1.4",
    className:
      "font-heading text-[22px] font-medium leading-[1.4] text-teal-dark",
    sample: "Licensed professionals, verified credentials",
  },
  {
    label: "H4",
    spec: "18px / DM Sans SemiBold / 1.4",
    className:
      "font-body text-[18px] font-semibold leading-[1.4] text-soft-black",
    sample: "No agencies, no middlemen, just care",
  },
  {
    label: "Body Large",
    spec: "18px / DM Sans Regular / 1.6",
    className:
      "font-body text-[18px] font-normal leading-[1.6] text-soft-black",
    sample:
      "NurseDex connects Long Island families with qualified healthcare professionals who treat your loved ones like their own.",
  },
  {
    label: "Body",
    spec: "16px / DM Sans Regular / 1.6",
    className:
      "font-body text-[16px] font-normal leading-[1.6] text-soft-black",
    sample:
      "Browse verified nurse profiles, read reviews from real families, and connect directly. No staffing agency required.",
  },
  {
    label: "Body Small",
    spec: "14px / DM Sans Regular / 1.5",
    className:
      "font-body text-[14px] font-normal leading-[1.5] text-soft-black-light",
    sample:
      "NurseDex verifies licenses at signup but does not monitor ongoing licensure status.",
  },
  {
    label: "Caption",
    spec: "12px / DM Sans Medium / 1.5",
    className:
      "font-body text-[12px] font-medium leading-[1.5] text-soft-black-light",
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
      {/* Hero Specimen, section header IS the specimen */}
      <div className="bg-teal-dark px-6 pt-32 pb-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-7xl">
          <p className="font-heading text-warm-white text-[clamp(3rem,10vw,8rem)] leading-[0.95] font-semibold tracking-tight">
            Find care
            <br />
            that feels
            <br />
            like family
          </p>
          <div className="mt-10 flex items-center gap-4">
            <div className="bg-sage/40 h-0.5 w-8" />
            <p className="font-body text-sage/60 text-sm">
              Fraunces &middot; Display &middot; SemiBold
            </p>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Fraunces Specimen                                  */}
      {/* -------------------------------------------------- */}
      <div className="border-sage/20 border-t">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-12 lg:px-24">
          <div className="mb-16 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <h3 className="font-heading text-teal-dark text-[clamp(4rem,8vw,9rem)] leading-[0.85] tracking-tight">
              Fraunces
            </h3>
            <p className="font-body text-soft-black-light max-w-md text-lg lg:pb-4">
              Soft, rounded serif with personality. Communicates warmth and
              trust without being clinical.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-heading text-soft-black/20 text-[clamp(1.5rem,3.5vw,3rem)] leading-relaxed tracking-wide break-all">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ
            </p>
            <p className="font-heading text-soft-black/20 text-[clamp(1.5rem,3.5vw,3rem)] leading-relaxed tracking-wide break-all">
              abcdefghijklmnopqrstuvwxyz
            </p>
            <p className="font-heading text-soft-black/20 text-[clamp(1.5rem,3.5vw,3rem)] leading-relaxed tracking-wide">
              0123456789 !@#$%&amp;*()
            </p>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* DM Sans Specimen                                   */}
      {/* -------------------------------------------------- */}
      <div className="border-sage/20 border-t">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-12 lg:px-24">
          <div className="mb-16 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <h3 className="font-body text-soft-black text-[clamp(4rem,8vw,8rem)] leading-[0.85] font-semibold tracking-tight">
              DM Sans
            </h3>
            <p className="font-body text-soft-black-light max-w-md text-lg lg:pb-4">
              Clean geometric sans-serif. Highly legible at all sizes.
              Professional without being cold.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-body text-soft-black/20 text-[clamp(1.5rem,3.5vw,3rem)] leading-relaxed tracking-wide break-all">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ
            </p>
            <p className="font-body text-soft-black/20 text-[clamp(1.5rem,3.5vw,3rem)] leading-relaxed tracking-wide break-all">
              abcdefghijklmnopqrstuvwxyz
            </p>
            <p className="font-body text-soft-black/20 text-[clamp(1.5rem,3.5vw,3rem)] leading-relaxed tracking-wide">
              0123456789 !@#$%&amp;*()
            </p>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Type Scale, Each level gets room to breathe       */}
      {/* -------------------------------------------------- */}
      <div className="border-sage/20 border-t">
        <div className="mx-auto max-w-7xl px-6 py-32 sm:px-12 lg:px-24">
          <p className="font-body text-sage-dark mb-6 text-xs tracking-[0.4em] uppercase">
            Type Scale
          </p>
          <p className="font-body text-soft-black-light mb-20 max-w-2xl">
            A modular scale ensures consistent rhythm across every screen. Each
            level has a defined role. Headings command attention, body text
            invites reading.
          </p>

          <div className="border-sage/20 border-t">
            {typeScale.map((level) => (
              <div
                key={level.label}
                className="border-sage/20 grid grid-cols-1 items-baseline gap-6 border-b py-12 lg:grid-cols-[180px_1fr] lg:gap-12"
              >
                <div className="space-y-1">
                  <p className="font-body text-soft-black text-base font-semibold">
                    {level.label}
                  </p>
                  <p className="font-body text-soft-black-light text-xs leading-relaxed">
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
      {/* Dark Background, Type on teal                     */}
      {/* -------------------------------------------------- */}
      <div className="bg-teal-dark">
        <div className="mx-auto max-w-7xl px-6 py-32 sm:px-12 lg:px-24">
          <p className="font-body text-sage/60 mb-16 text-xs tracking-[0.3em] uppercase">
            On Dark Backgrounds
          </p>

          <div className="mb-20 space-y-6">
            <p className="font-heading text-warm-white text-[clamp(2.5rem,6vw,4rem)] leading-[1.05] font-semibold">
              Find care that
              <br />
              feels like family
            </p>
            <p className="font-body text-sage/50 text-xs tracking-widest uppercase">
              Display
            </p>
          </div>

          <div className="space-y-16">
            <div>
              <p className="font-heading text-warm-white text-[36px] leading-[1.2] font-semibold">
                Find care that feels like family
              </p>
              <p className="font-body text-sage/50 mt-3 text-xs tracking-widest uppercase">
                H1
              </p>
            </div>
            <div>
              <p className="font-heading text-warm-white/90 text-[28px] leading-[1.3] font-medium">
                Connecting families with nurses they can trust
              </p>
              <p className="font-body text-sage/50 mt-3 text-xs tracking-widest uppercase">
                H2
              </p>
            </div>
            <div>
              <p className="font-heading text-warm-white/80 text-[22px] leading-[1.4] font-medium">
                Licensed professionals, verified credentials
              </p>
              <p className="font-body text-sage/50 mt-3 text-xs tracking-widest uppercase">
                H3
              </p>
            </div>
            <div>
              <p className="font-body text-sage-light text-[18px] leading-[1.6]">
                NurseDex connects Long Island families with qualified healthcare
                professionals who treat your loved ones like their own. Browse
                verified profiles, read reviews, and connect directly.
              </p>
              <p className="font-body text-sage/50 mt-3 text-xs tracking-widest uppercase">
                Body Large
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Font Pairing, Asymmetric editorial layout         */}
      {/* -------------------------------------------------- */}
      <div className="mx-auto max-w-7xl px-6 py-32 sm:px-12 lg:px-24">
        <p className="font-body text-sage-dark mb-20 text-xs tracking-[0.4em] uppercase">
          Font Pairing Rules
        </p>

        <div className="grid grid-cols-1 gap-16 lg:grid-cols-[3fr_2fr] lg:gap-24">
          <div>
            <h4 className="font-heading text-teal-dark mb-8 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              Find care that
              <br />
              feels like family
            </h4>
            <p className="font-body text-soft-black mb-4 max-w-lg text-xl leading-relaxed">
              NurseDex connects Long Island families with qualified healthcare
              professionals who treat your loved ones like their own.
            </p>
            <p className="font-body text-teal text-base font-semibold">
              Start Finding Nurses &rarr;
            </p>
          </div>

          <div className="space-y-12 lg:pt-4">
            <div className="border-sage border-l-2 pl-6">
              <p className="font-body text-sage-dark mb-3 text-xs tracking-[0.25em] uppercase">
                Context
              </p>
              <p className="font-body text-soft-black leading-relaxed">
                Use{" "}
                <span className="font-heading text-teal-dark">Fraunces</span>{" "}
                for emotional and marketing content.{" "}
                <span className="font-semibold">DM Sans</span> for functional
                and UI content.
              </p>
            </div>
            <div className="border-sage border-l-2 pl-6">
              <p className="font-body text-sage-dark mb-3 text-xs tracking-[0.25em] uppercase">
                Minimum Size
              </p>
              <p className="font-body text-soft-black leading-relaxed">
                Never use Fraunces below{" "}
                <span className="font-semibold">18px</span>. At small sizes it
                loses legibility and personality.
              </p>
            </div>
            <div className="border-sage border-l-2 pl-6">
              <p className="font-body text-sage-dark mb-3 text-xs tracking-[0.25em] uppercase">
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
      <div className="border-sage/20 border-t">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-12 lg:px-24">
          <p className="font-body text-sage-dark mb-16 text-xs tracking-[0.4em] uppercase">
            Do&apos;s &amp; Don&apos;ts
          </p>

          <div className="grid gap-16 md:grid-cols-2">
            <div>
              <p className="font-body text-teal-dark mb-10 text-sm font-semibold tracking-[0.2em] uppercase">
                Do
              </p>
              <ul className="space-y-8">
                {typeDos.map((item) => (
                  <li key={item} className="flex items-start gap-4">
                    <span className="text-teal mt-0.5 text-lg leading-none">
                      &#10003;
                    </span>
                    <span className="font-body text-soft-black leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-body text-soft-black-light mb-10 text-sm font-semibold tracking-[0.2em] uppercase">
                Don&apos;t
              </p>
              <ul className="space-y-8">
                {typeDonts.map((item) => (
                  <li key={item} className="flex items-start gap-4">
                    <span className="mt-0.5 text-lg leading-none text-red-500">
                      &#10005;
                    </span>
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
      <div className="mx-auto max-w-7xl px-6 pt-24 pb-32 sm:px-12 lg:px-24">
        <p className="font-body text-sage-dark mb-16 text-xs tracking-[0.4em] uppercase">
          System &amp; Fallback Fonts
        </p>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="bg-soft-black overflow-x-auto rounded-xl p-10">
            <p className="font-body text-sage/60 mb-6 text-xs tracking-[0.25em] uppercase">
              Headings
            </p>
            <code className="text-sage-light block font-mono text-base leading-relaxed">
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

          <div className="bg-soft-black overflow-x-auto rounded-xl p-10">
            <p className="font-body text-sage/60 mb-6 text-xs tracking-[0.25em] uppercase">
              Body
            </p>
            <code className="text-sage-light block font-mono text-base leading-relaxed">
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
