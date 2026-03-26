export default function LogoSection() {
  return (
    <section id="logo">
      {/* ────────────────────────────────────────────────── */}
      {/* HERO MONOGRAM — near full-screen, the mark alone  */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-teal min-h-[70vh] flex flex-col items-center justify-center px-6 md:px-16 lg:px-24 py-24">
        <div className="w-56 h-56 sm:w-72 sm:h-72 lg:w-96 lg:h-96 rounded-[2rem] sm:rounded-[2.5rem] lg:rounded-[3rem] bg-teal-dark flex items-center justify-center">
          <span className="font-heading text-[7rem] sm:text-[9rem] lg:text-[12rem] font-semibold text-warm-white tracking-[-0.06em] leading-none select-none">
            ND
          </span>
        </div>
      </div>

      {/* Wordmark lockup + description on white */}
      <div className="bg-warm-white px-6 md:px-16 lg:px-24 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-5 mb-10">
            <div className="w-14 h-14 rounded-xl bg-teal flex items-center justify-center">
              <span className="font-heading text-xl font-semibold text-white tracking-[-0.06em] leading-none select-none">ND</span>
            </div>
            <span className="font-heading text-4xl font-semibold text-teal tracking-[-0.02em] select-none">NurseDex</span>
          </div>
          <p className="font-body text-lg text-soft-black-light max-w-2xl mb-6">
            The NurseDex identity centers on an <strong className="text-soft-black">ND monogram</strong> set
            in Fraunces semibold with tight kerning, paired with
            the <strong className="text-soft-black">NurseDex wordmark</strong>. The serif
            ligature represents the connection between Nurses and the families
            who need them.
          </p>
          <div className="bg-cream/60 rounded-xl px-6 py-4 max-w-md">
            <p className="font-body text-sm text-soft-black-light">
              This monogram is a working direction, not finalized.
              The typographic approach (Fraunces serif ligature) is approved.
              Final refinements to kerning and proportions are in progress.
            </p>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* VARIATIONS — quiet label, clean grid               */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 md:px-16 lg:px-24 pb-24">
        <div className="max-w-5xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-12">
            Variations
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Primary */}
            <div className="bg-white border border-sage/20 rounded-2xl p-12 flex flex-col items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-teal flex items-center justify-center">
                  <span className="font-heading text-lg font-semibold text-white tracking-[-0.06em] leading-none select-none">ND</span>
                </div>
                <span className="font-heading text-2xl font-semibold text-teal tracking-[-0.02em] select-none">NurseDex</span>
              </div>
              <span className="font-body text-[10px] uppercase tracking-widest text-soft-black-light">Primary</span>
            </div>

            {/* Stacked */}
            <div className="bg-white border border-sage/20 rounded-2xl p-12 flex flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-lg bg-teal flex items-center justify-center">
                  <span className="font-heading text-lg font-semibold text-white tracking-[-0.06em] leading-none select-none">ND</span>
                </div>
                <span className="font-heading text-xl font-semibold text-teal tracking-[-0.02em] select-none">NurseDex</span>
              </div>
              <span className="font-body text-[10px] uppercase tracking-widest text-soft-black-light">Stacked</span>
            </div>

            {/* Monogram Only */}
            <div className="bg-white border border-sage/20 rounded-2xl p-12 flex flex-col items-center gap-6">
              <div className="w-14 h-14 rounded-xl bg-teal flex items-center justify-center">
                <span className="font-heading text-xl font-semibold text-white tracking-[-0.06em] leading-none select-none">ND</span>
              </div>
              <span className="font-body text-[10px] uppercase tracking-widest text-soft-black-light">Monogram Only</span>
            </div>

            {/* Wordmark Only */}
            <div className="bg-white border border-sage/20 rounded-2xl p-12 flex flex-col items-center gap-6">
              <span className="font-heading text-3xl font-semibold text-teal tracking-[-0.02em] select-none">NurseDex</span>
              <span className="font-body text-[10px] uppercase tracking-widest text-soft-black-light">Wordmark Only</span>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* COLOR VERSIONS — full-bleed dark gallery           */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-soft-black px-6 md:px-16 lg:px-24 py-32">
        <div className="max-w-5xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage/40 mb-16">
            Color versions
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
            {/* White on dark */}
            <div className="flex flex-col items-center gap-6">
              <div className="h-40 w-full flex items-center justify-center gap-3">
                <div className="w-11 h-11 rounded-lg border-2 border-warm-white/30 flex items-center justify-center">
                  <span className="font-heading text-sm font-semibold text-warm-white tracking-[-0.06em] leading-none select-none">ND</span>
                </div>
                <span className="font-heading text-xl font-semibold text-warm-white tracking-[-0.02em] select-none">NurseDex</span>
              </div>
              <p className="font-body text-[10px] uppercase tracking-widest text-sage/50">White on dark</p>
            </div>

            {/* Teal on white */}
            <div className="flex flex-col items-center gap-6">
              <div className="h-40 w-full bg-warm-white rounded-xl flex items-center justify-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-teal flex items-center justify-center">
                  <span className="font-heading text-sm font-semibold text-white tracking-[-0.06em] leading-none select-none">ND</span>
                </div>
                <span className="font-heading text-xl font-semibold text-teal tracking-[-0.02em] select-none">NurseDex</span>
              </div>
              <p className="font-body text-[10px] uppercase tracking-widest text-sage/50">Teal on light</p>
            </div>

            {/* Black on white */}
            <div className="flex flex-col items-center gap-6">
              <div className="h-40 w-full bg-warm-white rounded-xl flex items-center justify-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-soft-black flex items-center justify-center">
                  <span className="font-heading text-sm font-semibold text-white tracking-[-0.06em] leading-none select-none">ND</span>
                </div>
                <span className="font-heading text-xl font-semibold text-soft-black tracking-[-0.02em] select-none">NurseDex</span>
              </div>
              <p className="font-body text-[10px] uppercase tracking-widest text-sage/50">Black on light</p>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* CLEAR SPACE — clean technical diagram              */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-white px-6 md:px-16 lg:px-24 py-32">
        <div className="max-w-5xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-16">
            Clear space &amp; minimum size
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
            {/* Clear space diagram */}
            <div className="flex items-center justify-center">
              <div className="relative">
                <div className="border-2 border-dashed border-teal/30 rounded-xl p-16">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 h-16 w-px border-l border-dashed border-teal/40" />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-16 w-px border-l border-dashed border-teal/40" />
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-16 h-px border-t border-dashed border-teal/40" />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-px border-t border-dashed border-teal/40" />

                  <div className="w-28 h-28 rounded-xl bg-teal flex items-center justify-center">
                    <span className="font-heading text-4xl font-semibold text-white tracking-[-0.06em] leading-none select-none">ND</span>
                  </div>
                </div>

                <span className="absolute -top-3 left-1/2 -translate-x-1/2 font-body text-sm text-teal font-medium">x</span>
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 font-body text-sm text-teal font-medium">x</span>
                <span className="absolute top-1/2 -left-5 -translate-y-1/2 font-body text-sm text-teal font-medium">x</span>
                <span className="absolute top-1/2 -right-5 -translate-y-1/2 font-body text-sm text-teal font-medium">x</span>
              </div>
            </div>

            {/* Size specs */}
            <div className="flex flex-col justify-center gap-12">
              <div>
                <p className="font-body text-xs uppercase tracking-[0.3em] text-sage-dark mb-6">Minimum sizes</p>
                <div className="flex items-end gap-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 rounded bg-teal flex items-center justify-center">
                      <span className="font-heading text-[8px] font-semibold text-white select-none">ND</span>
                    </div>
                    <span className="font-body text-xs text-soft-black-light">24px / 10mm</span>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="w-5 h-5 rounded bg-teal flex items-center justify-center">
                        <span className="font-heading text-[6px] font-semibold text-white select-none">ND</span>
                      </div>
                      <span className="font-heading text-xs font-semibold text-teal select-none">NurseDex</span>
                    </div>
                    <span className="font-body text-xs text-soft-black-light">80px wide</span>
                  </div>
                </div>
              </div>

              <p className="font-body text-sm text-soft-black-light leading-relaxed">
                <strong className="text-soft-black">Clear space</strong> equals the
                width of the N in the monogram on all sides. Never place other
                elements, text, or edges within this zone.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* DON'TS — more breathing room between examples      */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 md:px-16 lg:px-24 py-32">
        <div className="max-w-5xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-16">
            Logo don&apos;ts
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { label: "Don\u2019t stretch or distort", style: { transform: "scaleX(1.5)" }, bg: "bg-teal" },
              { label: "Don\u2019t rotate", style: { transform: "rotate(15deg)" }, bg: "bg-teal" },
              { label: "Don\u2019t change brand colors", style: {}, bg: "bg-purple-500" },
              { label: "Don\u2019t add drop shadows", style: { boxShadow: "4px 4px 12px rgba(0,0,0,0.4)" }, bg: "bg-teal" },
              { label: "Don\u2019t use on low contrast", style: { color: "#A8C5B5" }, bg: "bg-sage", textOverride: true },
              { label: "Don\u2019t rearrange elements", style: {}, bg: "bg-teal", text: "DN" },
              { label: "Don\u2019t outline the logo", style: {}, bg: "bg-transparent border-2 border-teal", tealText: true },
              { label: "Don\u2019t crop the logo", style: {}, bg: "bg-teal", crop: true },
            ].map((item) => (
              <div key={item.label} className="relative rounded-2xl border border-sage/20 bg-white p-8 flex flex-col items-center gap-6 overflow-hidden">
                {/* Red strike */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[140%] h-1 bg-red-500/80 rotate-45 rounded-full" />
                </div>

                <div className="h-20 flex items-center justify-center">
                  {item.crop ? (
                    <div className="w-14 h-12 rounded-lg bg-teal flex items-end justify-end overflow-hidden">
                      <span className="font-heading text-2xl font-semibold text-white tracking-[-0.06em] select-none translate-x-2 translate-y-1">ND</span>
                    </div>
                  ) : item.textOverride ? (
                    <div className={`w-14 h-14 rounded-lg ${item.bg} flex items-center justify-center`}>
                      <span className="font-heading text-lg select-none" style={item.style}>ND</span>
                    </div>
                  ) : (
                    <div className={`w-14 h-14 rounded-lg ${item.bg} flex items-center justify-center`} style={item.style}>
                      <span className={`font-heading text-lg font-semibold tracking-[-0.06em] leading-none select-none ${item.tealText ? "text-teal" : "text-white"}`}>
                        {item.text || "ND"}
                      </span>
                    </div>
                  )}
                </div>

                <p className="font-body text-xs text-red-600/80 text-center leading-snug">
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
      <div className="bg-teal-dark px-6 md:px-16 lg:px-24 py-32">
        <div className="max-w-5xl mx-auto">
          <p className="font-heading text-[clamp(2rem,5vw,4rem)] italic text-warm-white leading-[1.1] max-w-3xl mb-16">
            &ldquo;Find care that feels like family.&rdquo;
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-3xl">
            <div>
              <p className="font-body text-[10px] uppercase tracking-widest text-sage/50 mb-3">Placement</p>
              <p className="font-body text-sm text-sage-light leading-relaxed">
                Always separated from the logo. Never locked up with the monogram or wordmark.
              </p>
            </div>
            <div>
              <p className="font-body text-[10px] uppercase tracking-widest text-sage/50 mb-3">Typography</p>
              <p className="font-body text-sm text-sage-light leading-relaxed">
                DM Sans italic, always smaller than the wordmark. Never bold, never uppercase.
              </p>
            </div>
            <div>
              <p className="font-body text-[10px] uppercase tracking-widest text-sage/50 mb-3">Usage</p>
              <p className="font-body text-sm text-sage-light leading-relaxed">
                Below the logo with generous whitespace, or independently in marketing copy.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* FAVICON & APP ICON — simple row                    */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-white px-6 md:px-16 lg:px-24 py-24">
        <div className="max-w-5xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-16">
            Favicon &amp; app icon
          </p>

          <div className="flex flex-wrap items-end gap-10 mb-12">
            {[
              { size: 16, text: "text-[5px]", radius: "rounded-sm" },
              { size: 32, text: "text-[8px]", radius: "rounded" },
              { size: 48, text: "text-sm font-semibold tracking-[-0.06em]", radius: "rounded-md" },
              { size: 80, text: "text-2xl font-semibold tracking-[-0.06em]", radius: "rounded-2xl", label: "App Icon" },
              { size: 112, text: "text-4xl font-semibold tracking-[-0.06em]", radius: "rounded-3xl", label: "App Store" },
            ].map((item) => (
              <div key={item.size} className="flex flex-col items-center gap-3">
                <div
                  className={`bg-teal ${item.radius} flex items-center justify-center`}
                  style={{ width: item.size, height: item.size }}
                >
                  <span className={`font-heading ${item.text} text-white leading-none select-none`}>ND</span>
                </div>
                <span className="font-body text-[10px] text-soft-black-light">
                  {item.label || `${item.size}px`}
                </span>
              </div>
            ))}
          </div>

          <p className="font-body text-xs text-soft-black-light leading-relaxed max-w-md">
            <strong className="text-soft-black">Favicon:</strong> 16, 32, 48px. Simplified at small sizes.
            <br />
            <strong className="text-soft-black">App Icon:</strong> 180px (iOS) / 512px (Android). OS applies rounded-rect mask.
          </p>
        </div>
      </div>
    </section>
  );
}
