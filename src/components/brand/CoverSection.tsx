export default function CoverSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center bg-teal-dark overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.15)_0%,transparent_50%)]" />
        <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.1)_0%,transparent_50%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-10 px-6 text-center">
        {/* ND Monogram */}
        <div className="w-28 h-28 rounded-2xl bg-teal-light border-2 border-sage/50 flex items-center justify-center mb-2">
          <span className="font-heading text-5xl font-semibold text-warm-white tracking-[-0.06em] leading-none select-none">
            ND
          </span>
        </div>

        {/* Decorative accent line */}
        <div className="w-16 h-0.5 bg-sage rounded-full" />

        {/* Title */}
        <h1 className="font-heading text-6xl sm:text-7xl md:text-8xl text-warm-white leading-tight">
          NurseDex
        </h1>

        {/* Subtitle */}
        <p className="font-body text-sm sm:text-base uppercase tracking-[0.35em] text-sage font-medium">
          Brand Guidelines
        </p>

        {/* Second accent line */}
        <div className="w-10 h-0.5 bg-sage/50 rounded-full" />
      </div>

      {/* Footer */}
      <div className="absolute bottom-10 left-0 right-0 text-center px-6">
        <p className="font-body text-xs text-sage/50 mb-1">
          For the founding team and anyone building NurseDex.
        </p>
        <p className="font-body text-[10px] tracking-widest text-sage/35 uppercase">
          v1.0 &middot; March 2026 &middot; Working document
        </p>
      </div>
    </section>
  );
}
