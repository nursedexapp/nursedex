export default function LogoExploration() {
  return (
    <main className="bg-warm-white min-h-screen px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <p className="font-body text-sage-dark mb-4 text-xs tracking-[0.4em] uppercase">
          Logo Exploration v2
        </p>
        <h1 className="font-heading text-teal-dark mb-4 text-3xl">
          NurseDex Monogram
        </h1>
        <p className="font-body text-soft-black-light mb-24 max-w-lg">
          Typographic approaches rooted in Fraunces. Refined, professional, and
          warm without being childish.
        </p>

        {/* ─── OPTION A: Fraunces Serif Monogram ─── */}
        <section className="mb-40">
          <p className="font-body text-sage-dark mb-3 text-xs tracking-[0.4em] uppercase">
            Option A
          </p>
          <h2 className="font-heading text-teal-dark mb-3 text-2xl">
            Typeset Monogram
          </h2>
          <p className="font-body text-soft-black-light mb-16 max-w-md">
            The letters N and D set in Fraunces at optical weight, tightly
            kerned inside a soft square. No illustration. The typography IS the
            logo. Confident and direct.
          </p>

          <div className="mb-12 grid grid-cols-2 gap-8 lg:grid-cols-4">
            {/* Teal bg, white type */}
            <div className="bg-teal flex aspect-square items-center justify-center rounded-2xl">
              <span className="font-heading text-warm-white text-[5.5rem] leading-none font-semibold tracking-[-0.06em] select-none">
                Nd
              </span>
            </div>

            {/* Dark bg */}
            <div className="bg-soft-black flex aspect-square items-center justify-center rounded-2xl">
              <span className="font-heading text-warm-white text-[5.5rem] leading-none font-semibold tracking-[-0.06em] select-none">
                Nd
              </span>
            </div>

            {/* White bg, teal type */}
            <div className="border-sage/20 flex aspect-square items-center justify-center rounded-2xl border bg-white">
              <span className="font-heading text-teal text-[5.5rem] leading-none font-semibold tracking-[-0.06em] select-none">
                Nd
              </span>
            </div>

            {/* With wordmark */}
            <div className="border-sage/20 flex aspect-square items-center justify-center rounded-2xl border bg-white px-6">
              <div className="flex items-center gap-5">
                <div className="bg-teal flex h-14 w-14 shrink-0 items-center justify-center rounded-xl">
                  <span className="font-heading text-warm-white text-2xl leading-none font-semibold tracking-[-0.04em] select-none">
                    Nd
                  </span>
                </div>
                <span className="font-heading text-soft-black text-2xl tracking-[-0.02em]">
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
                  className="bg-teal flex items-center justify-center rounded-lg"
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size * 0.16,
                  }}
                >
                  <span
                    className="font-heading text-warm-white leading-none font-semibold select-none"
                    style={{ fontSize: size * 0.42, letterSpacing: "-0.04em" }}
                  >
                    Nd
                  </span>
                </div>
                <span className="font-body text-soft-black-light text-[10px]">
                  {size}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── OPTION B: Stacked Initials ─── */}
        <section className="mb-40">
          <p className="font-body text-sage-dark mb-3 text-xs tracking-[0.4em] uppercase">
            Option B
          </p>
          <h2 className="font-heading text-teal-dark mb-3 text-2xl">
            Stacked Initials
          </h2>
          <p className="font-body text-soft-black-light mb-16 max-w-md">
            N over D, stacked vertically in a tall container. The vertical
            arrangement implies hierarchy and structure. Feels like a monogram
            on a letterhead or building facade.
          </p>

          <div className="mb-12 grid grid-cols-2 gap-8 lg:grid-cols-4">
            {/* Teal bg */}
            <div className="bg-teal flex aspect-square items-center justify-center rounded-2xl">
              <div className="flex flex-col items-center leading-none select-none">
                <span className="font-heading text-warm-white text-[4rem] font-medium tracking-[-0.02em]">
                  N
                </span>
                <span className="font-heading text-warm-white/50 -mt-3 text-[4rem] font-medium tracking-[-0.02em]">
                  D
                </span>
              </div>
            </div>

            {/* Dark bg */}
            <div className="bg-soft-black flex aspect-square items-center justify-center rounded-2xl">
              <div className="flex flex-col items-center leading-none select-none">
                <span className="font-heading text-warm-white text-[4rem] font-medium tracking-[-0.02em]">
                  N
                </span>
                <span className="font-heading text-sage -mt-3 text-[4rem] font-medium tracking-[-0.02em]">
                  D
                </span>
              </div>
            </div>

            {/* White bg */}
            <div className="border-sage/20 flex aspect-square items-center justify-center rounded-2xl border bg-white">
              <div className="flex flex-col items-center leading-none select-none">
                <span className="font-heading text-teal text-[4rem] font-medium tracking-[-0.02em]">
                  N
                </span>
                <span className="font-heading text-sage-dark -mt-3 text-[4rem] font-medium tracking-[-0.02em]">
                  D
                </span>
              </div>
            </div>

            {/* With wordmark */}
            <div className="border-sage/20 flex aspect-square items-center justify-center rounded-2xl border bg-white px-6">
              <div className="flex items-center gap-5">
                <div className="bg-teal flex h-14 w-14 shrink-0 items-center justify-center rounded-xl">
                  <div className="flex flex-col items-center leading-none select-none">
                    <span className="font-heading text-warm-white text-lg font-medium">
                      N
                    </span>
                    <span className="font-heading text-warm-white/50 -mt-1 text-lg font-medium">
                      D
                    </span>
                  </div>
                </div>
                <span className="font-heading text-soft-black text-2xl tracking-[-0.02em]">
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
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size * 0.16,
                  }}
                >
                  <span
                    className="font-heading text-warm-white leading-none font-medium select-none"
                    style={{ fontSize: size * 0.32 }}
                  >
                    N
                  </span>
                  <span
                    className="font-heading text-warm-white/50 leading-none font-medium select-none"
                    style={{ fontSize: size * 0.32, marginTop: size * -0.04 }}
                  >
                    D
                  </span>
                </div>
                <span className="font-body text-soft-black-light text-[10px]">
                  {size}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── OPTION C: Ligature ─── */}
        <section className="mb-40">
          <p className="font-body text-sage-dark mb-3 text-xs tracking-[0.4em] uppercase">
            Option C
          </p>
          <h2 className="font-heading text-teal-dark mb-3 text-2xl">
            Serif Ligature
          </h2>
          <p className="font-body text-soft-black-light mb-16 max-w-md">
            Full uppercase ND, tightly set as a ligature pair. The serifs of the
            N nearly touch the D, creating a natural connection without forcing
            it. Feels established, like a law firm or heritage brand, but
            softened by the Fraunces curves.
          </p>

          <div className="mb-12 grid grid-cols-2 gap-8 lg:grid-cols-4">
            {/* Teal bg */}
            <div className="bg-teal flex aspect-square items-center justify-center rounded-2xl">
              <span className="font-heading text-warm-white text-[5rem] leading-none font-semibold tracking-[-0.08em] select-none">
                ND
              </span>
            </div>

            {/* Dark bg */}
            <div className="bg-soft-black flex aspect-square items-center justify-center rounded-2xl">
              <span className="font-heading text-warm-white text-[5rem] leading-none font-semibold tracking-[-0.08em] select-none">
                ND
              </span>
            </div>

            {/* White bg */}
            <div className="border-sage/20 flex aspect-square items-center justify-center rounded-2xl border bg-white">
              <span className="font-heading text-teal text-[5rem] leading-none font-semibold tracking-[-0.08em] select-none">
                ND
              </span>
            </div>

            {/* With wordmark */}
            <div className="border-sage/20 flex aspect-square items-center justify-center rounded-2xl border bg-white px-6">
              <div className="flex items-center gap-5">
                <div className="bg-teal flex h-14 w-14 shrink-0 items-center justify-center rounded-xl">
                  <span className="font-heading text-warm-white text-xl leading-none font-semibold tracking-[-0.06em] select-none">
                    ND
                  </span>
                </div>
                <span className="font-heading text-soft-black text-2xl tracking-[-0.02em]">
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
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size * 0.16,
                  }}
                >
                  <span
                    className="font-heading text-warm-white leading-none font-semibold select-none"
                    style={{ fontSize: size * 0.38, letterSpacing: "-0.06em" }}
                  >
                    ND
                  </span>
                </div>
                <span className="font-body text-soft-black-light text-[10px]">
                  {size}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── OPTION D: Wordmark Only ─── */}
        <section className="mb-40">
          <p className="font-body text-sage-dark mb-3 text-xs tracking-[0.4em] uppercase">
            Option D
          </p>
          <h2 className="font-heading text-teal-dark mb-3 text-2xl">
            Wordmark Only
          </h2>
          <p className="font-body text-soft-black-light mb-16 max-w-md">
            No monogram at all. Just "NurseDex" in Fraunces, carefully kerned.
            The strongest brands often use their name as the logo. Google,
            Stripe, Airbnb. The word itself is distinctive enough.
          </p>

          <div className="mb-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Teal bg */}
            <div className="bg-teal flex items-center justify-center rounded-2xl px-12 py-20">
              <span className="font-heading text-warm-white text-5xl leading-none font-semibold tracking-[-0.03em] select-none sm:text-6xl">
                NurseDex
              </span>
            </div>

            {/* White bg */}
            <div className="border-sage/20 flex items-center justify-center rounded-2xl border bg-white px-12 py-20">
              <span className="font-heading text-teal text-5xl leading-none font-semibold tracking-[-0.03em] select-none sm:text-6xl">
                NurseDex
              </span>
            </div>

            {/* Dark bg */}
            <div className="bg-soft-black flex items-center justify-center rounded-2xl px-12 py-20">
              <span className="font-heading text-warm-white text-5xl leading-none font-semibold tracking-[-0.03em] select-none sm:text-6xl">
                NurseDex
              </span>
            </div>

            {/* Compact */}
            <div className="bg-warm-white border-sage/20 flex items-center justify-center rounded-2xl border px-12 py-20">
              <div className="flex items-center gap-4">
                <div className="bg-teal h-10 w-2 rounded-full" />
                <span className="font-heading text-soft-black text-3xl leading-none font-semibold tracking-[-0.02em] select-none">
                  NurseDex
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Side by side comparison ─── */}
        <section className="border-sage/20 border-t pt-20">
          <p className="font-body text-sage-dark mb-16 text-xs tracking-[0.4em] uppercase">
            Comparison at 48px
          </p>
          <div className="flex flex-wrap items-center justify-center gap-10">
            <div className="text-center">
              <div className="bg-teal mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl">
                <span className="font-heading text-warm-white text-xl leading-none font-semibold tracking-[-0.04em]">
                  Nd
                </span>
              </div>
              <p className="font-body text-soft-black-light text-xs">
                A: Typeset
              </p>
            </div>
            <div className="text-center">
              <div className="bg-teal mx-auto mb-3 flex h-16 w-16 flex-col items-center justify-center rounded-xl">
                <span className="font-heading text-warm-white text-sm leading-none font-medium">
                  N
                </span>
                <span className="font-heading text-warm-white/50 -mt-0.5 text-sm leading-none font-medium">
                  D
                </span>
              </div>
              <p className="font-body text-soft-black-light text-xs">
                B: Stacked
              </p>
            </div>
            <div className="text-center">
              <div className="bg-teal mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl">
                <span className="font-heading text-warm-white text-lg leading-none font-semibold tracking-[-0.06em]">
                  ND
                </span>
              </div>
              <p className="font-body text-soft-black-light text-xs">
                C: Ligature
              </p>
            </div>
            <div className="text-center">
              <div className="bg-teal mx-auto mb-3 flex h-16 items-center justify-center rounded-xl px-5">
                <span className="font-heading text-warm-white text-lg leading-none font-semibold tracking-[-0.02em]">
                  NurseDex
                </span>
              </div>
              <p className="font-body text-soft-black-light text-xs">
                D: Wordmark
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
