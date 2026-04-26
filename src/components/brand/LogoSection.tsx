export default function LogoSection() {
  return (
    <section id="logo">
      {/* ────────────────────────────────────────────────── */}
      {/* HERO MONOGRAM — near full-screen, the mark alone  */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-teal flex min-h-[70vh] flex-col items-center justify-center px-6 py-24 md:px-16 lg:px-24">
        <div className="bg-teal-dark flex h-56 w-56 items-center justify-center rounded-[2rem] sm:h-72 sm:w-72 sm:rounded-[2.5rem] lg:h-96 lg:w-96 lg:rounded-[3rem]">
          <span className="font-heading text-warm-white text-[7rem] leading-none font-semibold tracking-[-0.06em] select-none sm:text-[9rem] lg:text-[12rem]">
            ND
          </span>
        </div>
      </div>

      {/* Wordmark lockup + description on white */}
      <div className="bg-warm-white px-6 py-24 md:px-16 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 flex items-center gap-5">
            <div className="bg-teal flex h-14 w-14 items-center justify-center rounded-xl">
              <span className="font-heading text-xl leading-none font-semibold tracking-[-0.06em] text-white select-none">
                ND
              </span>
            </div>
            <span className="font-heading text-teal text-4xl font-semibold tracking-[-0.02em] select-none">
              NurseDex
            </span>
          </div>
          <p className="font-body text-soft-black-light mb-6 max-w-2xl text-lg">
            The NurseDex identity centers on an{" "}
            <strong className="text-soft-black">ND monogram</strong> set in
            Fraunces semibold with tight kerning, paired with the{" "}
            <strong className="text-soft-black">NurseDex wordmark</strong>. The
            serif ligature represents the connection between Nurses and the
            families who need them.
          </p>
          <div className="bg-cream/60 max-w-md rounded-xl px-6 py-4">
            <p className="font-body text-soft-black-light text-sm">
              The ND monogram is the approved mark for NurseDex. It uses
              Fraunces semibold with tight kerning on a teal background. This
              mark is used across favicon, app icon, and all brand applications.
            </p>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* VARIATIONS — quiet label, clean grid               */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 pb-24 md:px-16 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-body text-sage-dark mb-12 text-xs tracking-[0.4em] uppercase">
            Variations
          </p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Primary */}
            <div className="border-sage/20 flex flex-col items-center gap-6 rounded-2xl border bg-white p-12">
              <div className="flex items-center gap-3">
                <div className="bg-teal flex h-12 w-12 items-center justify-center rounded-lg">
                  <span className="font-heading text-lg leading-none font-semibold tracking-[-0.06em] text-white select-none">
                    ND
                  </span>
                </div>
                <span className="font-heading text-teal text-2xl font-semibold tracking-[-0.02em] select-none">
                  NurseDex
                </span>
              </div>
              <span className="font-body text-soft-black-light text-[10px] tracking-widest uppercase">
                Primary
              </span>
            </div>

            {/* Stacked */}
            <div className="border-sage/20 flex flex-col items-center gap-6 rounded-2xl border bg-white p-12">
              <div className="flex flex-col items-center gap-2">
                <div className="bg-teal flex h-12 w-12 items-center justify-center rounded-lg">
                  <span className="font-heading text-lg leading-none font-semibold tracking-[-0.06em] text-white select-none">
                    ND
                  </span>
                </div>
                <span className="font-heading text-teal text-xl font-semibold tracking-[-0.02em] select-none">
                  NurseDex
                </span>
              </div>
              <span className="font-body text-soft-black-light text-[10px] tracking-widest uppercase">
                Stacked
              </span>
            </div>

            {/* Monogram Only */}
            <div className="border-sage/20 flex flex-col items-center gap-6 rounded-2xl border bg-white p-12">
              <div className="bg-teal flex h-14 w-14 items-center justify-center rounded-xl">
                <span className="font-heading text-xl leading-none font-semibold tracking-[-0.06em] text-white select-none">
                  ND
                </span>
              </div>
              <span className="font-body text-soft-black-light text-[10px] tracking-widest uppercase">
                Monogram Only
              </span>
            </div>

            {/* Wordmark Only */}
            <div className="border-sage/20 flex flex-col items-center gap-6 rounded-2xl border bg-white p-12">
              <span className="font-heading text-teal text-3xl font-semibold tracking-[-0.02em] select-none">
                NurseDex
              </span>
              <span className="font-body text-soft-black-light text-[10px] tracking-widest uppercase">
                Wordmark Only
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* COLOR VERSIONS — full-bleed dark gallery           */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-soft-black px-6 py-32 md:px-16 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-body text-sage/40 mb-16 text-xs tracking-[0.4em] uppercase">
            Color versions
          </p>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {/* White on dark */}
            <div className="flex flex-col items-center gap-6">
              <div className="flex h-40 w-full items-center justify-center gap-3">
                <div className="border-warm-white/30 flex h-11 w-11 items-center justify-center rounded-lg border-2">
                  <span className="font-heading text-warm-white text-sm leading-none font-semibold tracking-[-0.06em] select-none">
                    ND
                  </span>
                </div>
                <span className="font-heading text-warm-white text-xl font-semibold tracking-[-0.02em] select-none">
                  NurseDex
                </span>
              </div>
              <p className="font-body text-sage/50 text-[10px] tracking-widest uppercase">
                White on dark
              </p>
            </div>

            {/* Teal on white */}
            <div className="flex flex-col items-center gap-6">
              <div className="bg-warm-white flex h-40 w-full items-center justify-center gap-3 rounded-xl">
                <div className="bg-teal flex h-11 w-11 items-center justify-center rounded-lg">
                  <span className="font-heading text-sm leading-none font-semibold tracking-[-0.06em] text-white select-none">
                    ND
                  </span>
                </div>
                <span className="font-heading text-teal text-xl font-semibold tracking-[-0.02em] select-none">
                  NurseDex
                </span>
              </div>
              <p className="font-body text-sage/50 text-[10px] tracking-widest uppercase">
                Teal on light
              </p>
            </div>

            {/* Black on white */}
            <div className="flex flex-col items-center gap-6">
              <div className="bg-warm-white flex h-40 w-full items-center justify-center gap-3 rounded-xl">
                <div className="bg-soft-black flex h-11 w-11 items-center justify-center rounded-lg">
                  <span className="font-heading text-sm leading-none font-semibold tracking-[-0.06em] text-white select-none">
                    ND
                  </span>
                </div>
                <span className="font-heading text-soft-black text-xl font-semibold tracking-[-0.02em] select-none">
                  NurseDex
                </span>
              </div>
              <p className="font-body text-sage/50 text-[10px] tracking-widest uppercase">
                Black on light
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* CLEAR SPACE — clean technical diagram              */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-white px-6 py-32 md:px-16 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-body text-sage-dark mb-16 text-xs tracking-[0.4em] uppercase">
            Clear space &amp; minimum size
          </p>

          <div className="grid grid-cols-1 gap-20 lg:grid-cols-2">
            {/* Clear space diagram */}
            <div className="flex items-center justify-center">
              <div className="relative">
                <div className="border-teal/30 rounded-xl border-2 border-dashed p-16">
                  <div className="border-teal/40 absolute top-0 left-1/2 h-16 w-px -translate-x-1/2 border-l border-dashed" />
                  <div className="border-teal/40 absolute bottom-0 left-1/2 h-16 w-px -translate-x-1/2 border-l border-dashed" />
                  <div className="border-teal/40 absolute top-1/2 left-0 h-px w-16 -translate-y-1/2 border-t border-dashed" />
                  <div className="border-teal/40 absolute top-1/2 right-0 h-px w-16 -translate-y-1/2 border-t border-dashed" />

                  <div className="bg-teal flex h-28 w-28 items-center justify-center rounded-xl">
                    <span className="font-heading text-4xl leading-none font-semibold tracking-[-0.06em] text-white select-none">
                      ND
                    </span>
                  </div>
                </div>

                <span className="font-body text-teal absolute -top-3 left-1/2 -translate-x-1/2 text-sm font-medium">
                  x
                </span>
                <span className="font-body text-teal absolute -bottom-3 left-1/2 -translate-x-1/2 text-sm font-medium">
                  x
                </span>
                <span className="font-body text-teal absolute top-1/2 -left-5 -translate-y-1/2 text-sm font-medium">
                  x
                </span>
                <span className="font-body text-teal absolute top-1/2 -right-5 -translate-y-1/2 text-sm font-medium">
                  x
                </span>
              </div>
            </div>

            {/* Size specs */}
            <div className="flex flex-col justify-center gap-12">
              <div>
                <p className="font-body text-sage-dark mb-6 text-xs tracking-[0.3em] uppercase">
                  Minimum sizes
                </p>
                <div className="flex items-end gap-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-teal flex h-6 w-6 items-center justify-center rounded">
                      <span className="font-heading text-[8px] font-semibold text-white select-none">
                        ND
                      </span>
                    </div>
                    <span className="font-body text-soft-black-light text-xs">
                      24px / 10mm
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="bg-teal flex h-5 w-5 items-center justify-center rounded">
                        <span className="font-heading text-[6px] font-semibold text-white select-none">
                          ND
                        </span>
                      </div>
                      <span className="font-heading text-teal text-xs font-semibold select-none">
                        NurseDex
                      </span>
                    </div>
                    <span className="font-body text-soft-black-light text-xs">
                      80px wide
                    </span>
                  </div>
                </div>
              </div>

              <p className="font-body text-soft-black-light text-sm leading-relaxed">
                <strong className="text-soft-black">Clear space</strong> equals
                the width of the N in the monogram on all sides. Never place
                other elements, text, or edges within this zone.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* DON'TS — more breathing room between examples      */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 py-32 md:px-16 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-body text-sage-dark mb-16 text-xs tracking-[0.4em] uppercase">
            Logo don&apos;ts
          </p>

          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {[
              {
                label: "Don\u2019t stretch or distort",
                style: { transform: "scaleX(1.5)" },
                bg: "bg-teal",
              },
              {
                label: "Don\u2019t rotate",
                style: { transform: "rotate(15deg)" },
                bg: "bg-teal",
              },
              {
                label: "Don\u2019t change brand colors",
                style: {},
                bg: "bg-purple-500",
              },
              {
                label: "Don\u2019t add drop shadows",
                style: { boxShadow: "4px 4px 12px rgba(0,0,0,0.4)" },
                bg: "bg-teal",
              },
              {
                label: "Don\u2019t use on low contrast",
                style: { color: "#A8C5B5" },
                bg: "bg-sage",
                textOverride: true,
              },
              {
                label: "Don\u2019t rearrange elements",
                style: {},
                bg: "bg-teal",
                text: "DN",
              },
              {
                label: "Don\u2019t outline the logo",
                style: {},
                bg: "bg-transparent border-2 border-teal",
                tealText: true,
              },
              {
                label: "Don\u2019t crop the logo",
                style: {},
                bg: "bg-teal",
                crop: true,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="border-sage/20 relative flex flex-col items-center gap-6 overflow-hidden rounded-2xl border bg-white p-8"
              >
                {/* Red strike */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-1 w-[140%] rotate-45 rounded-full bg-red-500/80" />
                </div>

                <div className="flex h-20 items-center justify-center">
                  {item.crop ? (
                    <div className="bg-teal flex h-12 w-14 items-end justify-end overflow-hidden rounded-lg">
                      <span className="font-heading translate-x-2 translate-y-1 text-2xl font-semibold tracking-[-0.06em] text-white select-none">
                        ND
                      </span>
                    </div>
                  ) : item.textOverride ? (
                    <div
                      className={`h-14 w-14 rounded-lg ${item.bg} flex items-center justify-center`}
                    >
                      <span
                        className="font-heading text-lg select-none"
                        style={item.style}
                      >
                        ND
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`h-14 w-14 rounded-lg ${item.bg} flex items-center justify-center`}
                      style={item.style}
                    >
                      <span
                        className={`font-heading text-lg leading-none font-semibold tracking-[-0.06em] select-none ${item.tealText ? "text-teal" : "text-white"}`}
                      >
                        {item.text || "ND"}
                      </span>
                    </div>
                  )}
                </div>

                <p className="font-body text-center text-xs leading-snug text-red-600/80">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* TAGLINE — dark editorial moment                    */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-teal-dark px-6 py-32 md:px-16 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-heading text-warm-white mb-16 max-w-3xl text-[clamp(2rem,5vw,4rem)] leading-[1.1] italic">
            &ldquo;Find care that feels like family.&rdquo;
          </p>

          <div className="grid max-w-3xl grid-cols-1 gap-10 md:grid-cols-3">
            <div>
              <p className="font-body text-sage/50 mb-3 text-[10px] tracking-widest uppercase">
                Placement
              </p>
              <p className="font-body text-sage-light text-sm leading-relaxed">
                Always separated from the logo. Never locked up with the
                monogram or wordmark.
              </p>
            </div>
            <div>
              <p className="font-body text-sage/50 mb-3 text-[10px] tracking-widest uppercase">
                Typography
              </p>
              <p className="font-body text-sage-light text-sm leading-relaxed">
                DM Sans italic, always smaller than the wordmark. Never bold,
                never uppercase.
              </p>
            </div>
            <div>
              <p className="font-body text-sage/50 mb-3 text-[10px] tracking-widest uppercase">
                Usage
              </p>
              <p className="font-body text-sage-light text-sm leading-relaxed">
                Below the logo with generous whitespace, or independently in
                marketing copy.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* FAVICON & APP ICON — simple row                    */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-white px-6 py-24 md:px-16 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-body text-sage-dark mb-16 text-xs tracking-[0.4em] uppercase">
            Favicon &amp; app icon
          </p>

          <div className="mb-12 flex flex-wrap items-end gap-10">
            {[
              { size: 16, text: "text-[5px]", radius: "rounded-sm" },
              { size: 32, text: "text-[8px]", radius: "rounded" },
              {
                size: 48,
                text: "text-sm font-semibold tracking-[-0.06em]",
                radius: "rounded-md",
              },
              {
                size: 80,
                text: "text-2xl font-semibold tracking-[-0.06em]",
                radius: "rounded-2xl",
                label: "App Icon",
              },
              {
                size: 112,
                text: "text-4xl font-semibold tracking-[-0.06em]",
                radius: "rounded-3xl",
                label: "App Store",
              },
            ].map((item) => (
              <div key={item.size} className="flex flex-col items-center gap-3">
                <div
                  className={`bg-teal ${item.radius} flex items-center justify-center`}
                  style={{ width: item.size, height: item.size }}
                >
                  <span
                    className={`font-heading ${item.text} leading-none text-white select-none`}
                  >
                    ND
                  </span>
                </div>
                <span className="font-body text-soft-black-light text-[10px]">
                  {item.label || `${item.size}px`}
                </span>
              </div>
            ))}
          </div>

          <p className="font-body text-soft-black-light max-w-md text-xs leading-relaxed">
            <strong className="text-soft-black">Favicon:</strong> 16, 32, 48px.
            Simplified at small sizes.
            <br />
            <strong className="text-soft-black">App Icon:</strong> 180px (iOS) /
            512px (Android). OS applies rounded-rect mask.
          </p>
        </div>
      </div>
    </section>
  );
}
