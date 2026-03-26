export default function LogoExploration() {
  return (
    <main className="min-h-screen bg-warm-white px-6 py-20">
      <div className="max-w-6xl mx-auto">
        <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-4">
          Logo Exploration v2
        </p>
        <h1 className="font-heading text-3xl text-teal-dark mb-4">
          NurseDex Monogram
        </h1>
        <p className="font-body text-soft-black-light mb-24 max-w-lg">
          Typographic approaches rooted in Fraunces. Refined, professional,
          and warm without being childish.
        </p>

        {/* ─── OPTION A: Fraunces Serif Monogram ─── */}
        <section className="mb-40">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-3">
            Option A
          </p>
          <h2 className="font-heading text-2xl text-teal-dark mb-3">
            Typeset Monogram
          </h2>
          <p className="font-body text-soft-black-light mb-16 max-w-md">
            The letters N and D set in Fraunces at optical weight,
            tightly kerned inside a soft square. No illustration.
            The typography IS the logo. Confident and direct.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            {/* Teal bg, white type */}
            <div className="aspect-square bg-teal rounded-2xl flex items-center justify-center">
              <span className="font-heading text-[5.5rem] font-semibold text-warm-white tracking-[-0.06em] leading-none select-none">
                Nd
              </span>
            </div>

            {/* Dark bg */}
            <div className="aspect-square bg-soft-black rounded-2xl flex items-center justify-center">
              <span className="font-heading text-[5.5rem] font-semibold text-warm-white tracking-[-0.06em] leading-none select-none">
                Nd
              </span>
            </div>

            {/* White bg, teal type */}
            <div className="aspect-square bg-white rounded-2xl border border-sage/20 flex items-center justify-center">
              <span className="font-heading text-[5.5rem] font-semibold text-teal tracking-[-0.06em] leading-none select-none">
                Nd
              </span>
            </div>

            {/* With wordmark */}
            <div className="aspect-square bg-white rounded-2xl border border-sage/20 flex items-center justify-center px-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-teal rounded-xl flex items-center justify-center shrink-0">
                  <span className="font-heading text-2xl font-semibold text-warm-white tracking-[-0.04em] leading-none select-none">
                    Nd
                  </span>
                </div>
                <span className="font-heading text-2xl text-soft-black tracking-[-0.02em]">
                  NurseDex
                </span>
              </div>
            </div>
          </div>

          {/* Size scaling */}
          <div className="flex items-end gap-6">
            {[80, 56, 40, 32, 24, 16].map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <div
                  className="bg-teal rounded-lg flex items-center justify-center"
                  style={{ width: size, height: size, borderRadius: size * 0.16 }}
                >
                  <span
                    className="font-heading font-semibold text-warm-white leading-none select-none"
                    style={{ fontSize: size * 0.42, letterSpacing: "-0.04em" }}
                  >
                    Nd
                  </span>
                </div>
                <span className="font-body text-[10px] text-soft-black-light">{size}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── OPTION B: Stacked Initials ─── */}
        <section className="mb-40">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-3">
            Option B
          </p>
          <h2 className="font-heading text-2xl text-teal-dark mb-3">
            Stacked Initials
          </h2>
          <p className="font-body text-soft-black-light mb-16 max-w-md">
            N over D, stacked vertically in a tall container. The vertical
            arrangement implies hierarchy and structure. Feels like a
            monogram on a letterhead or building facade.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            {/* Teal bg */}
            <div className="aspect-square bg-teal rounded-2xl flex items-center justify-center">
              <div className="flex flex-col items-center leading-none select-none">
                <span className="font-heading text-[4rem] font-medium text-warm-white tracking-[-0.02em]">
                  N
                </span>
                <span className="font-heading text-[4rem] font-medium text-warm-white/50 tracking-[-0.02em] -mt-3">
                  D
                </span>
              </div>
            </div>

            {/* Dark bg */}
            <div className="aspect-square bg-soft-black rounded-2xl flex items-center justify-center">
              <div className="flex flex-col items-center leading-none select-none">
                <span className="font-heading text-[4rem] font-medium text-warm-white tracking-[-0.02em]">
                  N
                </span>
                <span className="font-heading text-[4rem] font-medium text-sage tracking-[-0.02em] -mt-3">
                  D
                </span>
              </div>
            </div>

            {/* White bg */}
            <div className="aspect-square bg-white rounded-2xl border border-sage/20 flex items-center justify-center">
              <div className="flex flex-col items-center leading-none select-none">
                <span className="font-heading text-[4rem] font-medium text-teal tracking-[-0.02em]">
                  N
                </span>
                <span className="font-heading text-[4rem] font-medium text-sage-dark tracking-[-0.02em] -mt-3">
                  D
                </span>
              </div>
            </div>

            {/* With wordmark */}
            <div className="aspect-square bg-white rounded-2xl border border-sage/20 flex items-center justify-center px-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-teal rounded-xl flex items-center justify-center shrink-0">
                  <div className="flex flex-col items-center leading-none select-none">
                    <span className="font-heading text-lg font-medium text-warm-white">N</span>
                    <span className="font-heading text-lg font-medium text-warm-white/50 -mt-1">D</span>
                  </div>
                </div>
                <span className="font-heading text-2xl text-soft-black tracking-[-0.02em]">
                  NurseDex
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-end gap-6">
            {[80, 56, 40, 32, 24, 16].map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <div
                  className="bg-teal flex flex-col items-center justify-center"
                  style={{ width: size, height: size, borderRadius: size * 0.16 }}
                >
                  <span
                    className="font-heading font-medium text-warm-white leading-none select-none"
                    style={{ fontSize: size * 0.32 }}
                  >
                    N
                  </span>
                  <span
                    className="font-heading font-medium text-warm-white/50 leading-none select-none"
                    style={{ fontSize: size * 0.32, marginTop: size * -0.04 }}
                  >
                    D
                  </span>
                </div>
                <span className="font-body text-[10px] text-soft-black-light">{size}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── OPTION C: Ligature ─── */}
        <section className="mb-40">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-3">
            Option C
          </p>
          <h2 className="font-heading text-2xl text-teal-dark mb-3">
            Serif Ligature
          </h2>
          <p className="font-body text-soft-black-light mb-16 max-w-md">
            Full uppercase ND, tightly set as a ligature pair. The serifs
            of the N nearly touch the D, creating a natural connection
            without forcing it. Feels established, like a law firm or
            heritage brand, but softened by the Fraunces curves.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            {/* Teal bg */}
            <div className="aspect-square bg-teal rounded-2xl flex items-center justify-center">
              <span className="font-heading text-[5rem] font-semibold text-warm-white tracking-[-0.08em] leading-none select-none">
                ND
              </span>
            </div>

            {/* Dark bg */}
            <div className="aspect-square bg-soft-black rounded-2xl flex items-center justify-center">
              <span className="font-heading text-[5rem] font-semibold text-warm-white tracking-[-0.08em] leading-none select-none">
                ND
              </span>
            </div>

            {/* White bg */}
            <div className="aspect-square bg-white rounded-2xl border border-sage/20 flex items-center justify-center">
              <span className="font-heading text-[5rem] font-semibold text-teal tracking-[-0.08em] leading-none select-none">
                ND
              </span>
            </div>

            {/* With wordmark */}
            <div className="aspect-square bg-white rounded-2xl border border-sage/20 flex items-center justify-center px-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-teal rounded-xl flex items-center justify-center shrink-0">
                  <span className="font-heading text-xl font-semibold text-warm-white tracking-[-0.06em] leading-none select-none">
                    ND
                  </span>
                </div>
                <span className="font-heading text-2xl text-soft-black tracking-[-0.02em]">
                  NurseDex
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-end gap-6">
            {[80, 56, 40, 32, 24, 16].map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <div
                  className="bg-teal flex items-center justify-center"
                  style={{ width: size, height: size, borderRadius: size * 0.16 }}
                >
                  <span
                    className="font-heading font-semibold text-warm-white leading-none select-none"
                    style={{ fontSize: size * 0.38, letterSpacing: "-0.06em" }}
                  >
                    ND
                  </span>
                </div>
                <span className="font-body text-[10px] text-soft-black-light">{size}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── OPTION D: Wordmark Only ─── */}
        <section className="mb-40">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-3">
            Option D
          </p>
          <h2 className="font-heading text-2xl text-teal-dark mb-3">
            Wordmark Only
          </h2>
          <p className="font-body text-soft-black-light mb-16 max-w-md">
            No monogram at all. Just "NurseDex" in Fraunces, carefully
            kerned. The strongest brands often use their name as the logo.
            Google, Stripe, Airbnb. The word itself is distinctive enough.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            {/* Teal bg */}
            <div className="bg-teal rounded-2xl flex items-center justify-center py-20 px-12">
              <span className="font-heading text-5xl sm:text-6xl font-semibold text-warm-white tracking-[-0.03em] leading-none select-none">
                NurseDex
              </span>
            </div>

            {/* White bg */}
            <div className="bg-white rounded-2xl border border-sage/20 flex items-center justify-center py-20 px-12">
              <span className="font-heading text-5xl sm:text-6xl font-semibold text-teal tracking-[-0.03em] leading-none select-none">
                NurseDex
              </span>
            </div>

            {/* Dark bg */}
            <div className="bg-soft-black rounded-2xl flex items-center justify-center py-20 px-12">
              <span className="font-heading text-5xl sm:text-6xl font-semibold text-warm-white tracking-[-0.03em] leading-none select-none">
                NurseDex
              </span>
            </div>

            {/* Compact */}
            <div className="bg-warm-white rounded-2xl border border-sage/20 flex items-center justify-center py-20 px-12">
              <div className="flex items-center gap-4">
                <div className="w-2 h-10 bg-teal rounded-full" />
                <span className="font-heading text-3xl font-semibold text-soft-black tracking-[-0.02em] leading-none select-none">
                  NurseDex
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Side by side comparison ─── */}
        <section className="border-t border-sage/20 pt-20">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-16">
            Comparison at 48px
          </p>
          <div className="flex items-center justify-center gap-10 flex-wrap">
            <div className="text-center">
              <div className="w-16 h-16 bg-teal rounded-xl flex items-center justify-center mx-auto mb-3">
                <span className="font-heading text-xl font-semibold text-warm-white tracking-[-0.04em] leading-none">Nd</span>
              </div>
              <p className="font-body text-xs text-soft-black-light">A: Typeset</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-teal rounded-xl flex flex-col items-center justify-center mx-auto mb-3">
                <span className="font-heading text-sm font-medium text-warm-white leading-none">N</span>
                <span className="font-heading text-sm font-medium text-warm-white/50 leading-none -mt-0.5">D</span>
              </div>
              <p className="font-body text-xs text-soft-black-light">B: Stacked</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-teal rounded-xl flex items-center justify-center mx-auto mb-3">
                <span className="font-heading text-lg font-semibold text-warm-white tracking-[-0.06em] leading-none">ND</span>
              </div>
              <p className="font-body text-xs text-soft-black-light">C: Ligature</p>
            </div>
            <div className="text-center">
              <div className="h-16 bg-teal rounded-xl flex items-center justify-center mx-auto mb-3 px-5">
                <span className="font-heading text-lg font-semibold text-warm-white tracking-[-0.02em] leading-none">NurseDex</span>
              </div>
              <p className="font-body text-xs text-soft-black-light">D: Wordmark</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
