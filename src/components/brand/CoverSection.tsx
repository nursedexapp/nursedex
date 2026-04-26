export default function CoverSection() {
  return (
    <section className="bg-teal-dark relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 left-0 h-full w-full bg-[radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.15)_0%,transparent_50%)]" />
        <div className="absolute top-0 right-0 h-full w-full bg-[radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.1)_0%,transparent_50%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-10 px-6 text-center">
        {/* ND Monogram */}
        <div className="bg-teal-light border-sage/50 mb-2 flex h-28 w-28 items-center justify-center rounded-2xl border-2">
          <span className="font-heading text-warm-white text-5xl leading-none font-semibold tracking-[-0.06em] select-none">
            ND
          </span>
        </div>

        {/* Decorative accent line */}
        <div className="bg-sage h-0.5 w-16 rounded-full" />

        {/* Title */}
        <h1 className="font-heading text-warm-white text-6xl leading-tight sm:text-7xl md:text-8xl">
          NurseDex
        </h1>

        {/* Subtitle */}
        <p className="font-body text-sage text-sm font-medium tracking-[0.35em] uppercase sm:text-base">
          Brand Guidelines
        </p>

        {/* Second accent line */}
        <div className="bg-sage/50 h-0.5 w-10 rounded-full" />
      </div>

      {/* Footer */}
      <div className="absolute right-0 bottom-10 left-0 px-6 text-center">
        <p className="font-body text-sage/50 mb-1 text-xs">
          For the founding team and anyone building NurseDex.
        </p>
        <p className="font-body text-sage/35 text-[10px] tracking-widest uppercase">
          v1.0 &middot; March 2026 &middot; Working document
        </p>
      </div>
    </section>
  );
}
