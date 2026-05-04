const designPrinciples = [
  {
    title: "Clarity over Cleverness",
    description:
      "Every screen should be self-explanatory. If someone needs a tutorial, we've failed.",
  },
  {
    title: "Warmth through Detail",
    description:
      "Rounded corners, soft shadows, warm colors. Every pixel should feel approachable.",
  },
  {
    title: "Progressive Disclosure",
    description:
      "Don't overwhelm. Show what matters now, reveal more on demand.",
  },
  {
    title: "Trust Signals Everywhere",
    description:
      "Verified badges, clear pricing, honest disclaimers. Trust is earned at every touchpoint.",
  },
  {
    title: "Mobile-First, Always",
    description:
      "Most families will search on their phones. Design for the smallest screen first.",
  },
];

const accessibilityChecklist = [
  "WCAG 2.1 AA compliance",
  "4.5:1 contrast for text",
  "44px touch targets",
  "2px teal focus outlines",
  "Alt text on all images",
  "Full keyboard navigation",
  "prefers-reduced-motion",
];

const coBrandingRules = [
  "Side-by-side with divider",
  "Clear space always maintained",
  "Never smaller than partner logo",
  "Always in brand colors",
];

export default function ApplicationSection() {
  return (
    <section id="application">
      {/* ────────────────────────────────────────────────── */}
      {/* THE BRAND IN ACTION, a full NurseDex search mock */}
      {/* This replaces "Putting it all together"           */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 pt-32 pb-20 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-heading text-teal-dark mb-6 max-w-3xl text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
            How it could come together.
          </h2>
          <p className="font-body text-soft-black-light max-w-lg">
            This is a conceptual mockup showing the brand tokens applied to a
            search interface. It is not a design for the actual product.
          </p>
        </div>
      </div>

      {/* Conceptual mockup */}
      <div className="bg-soft-black px-4 py-12 sm:px-8 sm:py-16 lg:px-16">
        <div className="mx-auto max-w-5xl">
          {/* Browser chrome, hidden on mobile */}
          <div className="bg-soft-black-light/30 hidden items-center gap-2 rounded-t-xl px-4 py-3 sm:flex">
            <div className="flex gap-1.5">
              <div className="bg-error/60 h-3 w-3 rounded-full" />
              <div className="bg-warning/60 h-3 w-3 rounded-full" />
              <div className="bg-success/60 h-3 w-3 rounded-full" />
            </div>
            <div className="bg-soft-black/40 ml-4 flex-1 rounded-md px-4 py-1.5">
              <span className="font-body text-warm-white/40 text-[11px]">
                nursedex.com/search?care=elder&amp;location=long-island
              </span>
            </div>
          </div>

          {/* App frame */}
          <div className="bg-warm-white overflow-hidden rounded-xl shadow-2xl sm:rounded-t-none sm:rounded-b-xl">
            {/* Nav bar */}
            <div className="bg-teal flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="bg-teal-dark flex h-8 w-8 items-center justify-center rounded-lg">
                  <span className="font-heading text-warm-white text-sm leading-none font-semibold tracking-[-0.06em]">
                    ND
                  </span>
                </div>
                <span className="font-heading text-warm-white hidden text-base sm:inline">
                  NurseDex
                </span>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-body text-warm-white/80 hidden text-sm sm:inline">
                  Find a Nurse
                </span>
                <span className="font-body text-warm-white/80 hidden text-sm sm:inline">
                  How It Works
                </span>
                <div className="bg-warm-white text-teal font-body rounded-lg px-4 py-2 text-xs font-medium">
                  Sign In
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div className="bg-sage/15 border-sage/20 border-b px-6 py-5">
              <div className="flex max-w-3xl flex-col gap-3 sm:flex-row">
                <div className="bg-warm-white border-sage/30 flex-1 rounded-xl border px-4 py-3">
                  <span className="font-body text-soft-black text-sm">
                    Elder Care
                  </span>
                </div>
                <div className="bg-warm-white border-sage/30 flex-1 rounded-xl border px-4 py-3">
                  <span className="font-body text-soft-black-light text-sm">
                    Long Island, NY
                  </span>
                </div>
                <div className="bg-teal text-warm-white font-body rounded-xl px-6 py-3 text-center text-sm font-medium">
                  Search
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="px-6 py-6">
              <p className="font-body text-soft-black-light mb-5 text-sm">
                <span className="text-soft-black font-semibold">24 nurses</span>{" "}
                found for Elder Care near Long Island
              </p>

              {/* Nurse cards, the star moment */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Card 1, Featured */}
                <div className="bg-warm-white border-cream-dark overflow-hidden rounded-2xl border">
                  <div className="bg-sage/20 relative flex h-36 items-center justify-center">
                    <div className="bg-sage/40 flex h-16 w-16 items-center justify-center rounded-full">
                      <svg
                        className="text-sage-dark/50 h-8 w-8"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                        />
                      </svg>
                    </div>
                    <span className="bg-cream text-teal font-body border-cream-dark absolute top-3 left-3 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase">
                      Featured
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="mb-1.5 flex items-start justify-between">
                      <h5 className="font-heading text-soft-black text-base">
                        Maria Santos
                      </h5>
                      <span className="bg-teal text-warm-white font-body rounded-full px-2 py-0.5 text-[9px] tracking-wider uppercase">
                        Verified
                      </span>
                    </div>
                    <div className="mb-2 flex gap-1.5">
                      <span className="bg-sage/25 text-teal-dark font-body rounded-full px-2 py-0.5 text-[11px]">
                        RN
                      </span>
                      <span className="bg-sage/25 text-teal-dark font-body rounded-full px-2 py-0.5 text-[11px]">
                        Elder Care
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <svg
                          key={s}
                          className={`h-3.5 w-3.5 ${s <= 5 ? "text-warning" : "text-cream-dark"}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                      <span className="font-body text-soft-black-light ml-1 text-[11px]">
                        5.0 (12)
                      </span>
                    </div>
                    <p className="font-body text-soft-black-light line-clamp-2 text-xs leading-relaxed">
                      12 years of experience in elder care and post-surgical
                      recovery on Long Island.
                    </p>
                    <p className="font-body text-sage-dark mt-2 text-[11px]">
                      3 miles away
                    </p>
                  </div>
                </div>

                {/* Card 2 */}
                <div className="bg-warm-white border-cream-dark overflow-hidden rounded-2xl border">
                  <div className="bg-sage/20 flex h-36 items-center justify-center">
                    <div className="bg-sage/40 flex h-16 w-16 items-center justify-center rounded-full">
                      <svg
                        className="text-sage-dark/50 h-8 w-8"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="mb-1.5 flex items-start justify-between">
                      <h5 className="font-heading text-soft-black text-base">
                        James O&apos;Brien
                      </h5>
                      <span className="bg-teal text-warm-white font-body rounded-full px-2 py-0.5 text-[9px] tracking-wider uppercase">
                        Verified
                      </span>
                    </div>
                    <div className="mb-2 flex gap-1.5">
                      <span className="bg-sage/25 text-teal-dark font-body rounded-full px-2 py-0.5 text-[11px]">
                        LPN
                      </span>
                      <span className="bg-sage/25 text-teal-dark font-body rounded-full px-2 py-0.5 text-[11px]">
                        Elder Care
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <svg
                          key={s}
                          className={`h-3.5 w-3.5 ${s <= 4 ? "text-warning" : "text-cream-dark"}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                      <span className="font-body text-soft-black-light ml-1 text-[11px]">
                        4.0 (8)
                      </span>
                    </div>
                    <p className="font-body text-soft-black-light line-clamp-2 text-xs leading-relaxed">
                      Compassionate LPN with 8 years helping families across
                      Nassau County.
                    </p>
                    <p className="font-body text-sage-dark mt-2 text-[11px]">
                      5 miles away
                    </p>
                  </div>
                </div>

                {/* Card 3 */}
                <div className="bg-warm-white border-cream-dark hidden overflow-hidden rounded-2xl border sm:block">
                  <div className="bg-sage/20 flex h-36 items-center justify-center">
                    <div className="bg-sage/40 flex h-16 w-16 items-center justify-center rounded-full">
                      <svg
                        className="text-sage-dark/50 h-8 w-8"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="mb-1.5 flex items-start justify-between">
                      <h5 className="font-heading text-soft-black text-base">
                        Patricia Chen
                      </h5>
                      <span className="bg-teal text-warm-white font-body rounded-full px-2 py-0.5 text-[9px] tracking-wider uppercase">
                        Verified
                      </span>
                    </div>
                    <div className="mb-2 flex gap-1.5">
                      <span className="bg-sage/25 text-teal-dark font-body rounded-full px-2 py-0.5 text-[11px]">
                        CNA
                      </span>
                      <span className="bg-sage/25 text-teal-dark font-body rounded-full px-2 py-0.5 text-[11px]">
                        Elder Care
                      </span>
                      <span className="bg-sage/25 text-teal-dark font-body rounded-full px-2 py-0.5 text-[11px]">
                        Memory Care
                      </span>
                    </div>
                    <div className="mb-2 flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <svg
                          key={s}
                          className={`h-3.5 w-3.5 ${s <= 4 ? "text-warning" : "text-cream-dark"}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                      <span className="font-body text-soft-black-light ml-1 text-[11px]">
                        4.5 (15)
                      </span>
                    </div>
                    <p className="font-body text-soft-black-light line-clamp-2 text-xs leading-relaxed">
                      Specializing in memory care and dementia support. Fluent
                      in English and Mandarin.
                    </p>
                    <p className="font-body text-sage-dark mt-2 text-[11px]">
                      7 miles away
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* DESIGN PRINCIPLES, quiet, editorial               */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <div className="divide-sage/20 divide-y">
            {designPrinciples.map((item) => (
              <div
                key={item.title}
                className="grid grid-cols-1 items-baseline gap-4 py-12 first:pt-0 last:pb-0 lg:grid-cols-[3fr_2fr] lg:gap-16"
              >
                <p className="font-body text-soft-black-light leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* COMPONENT TOKENS, buttons on a dark stage         */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-teal-dark px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-body text-sage/40 mb-16 text-xs tracking-[0.4em] uppercase">
            Component tokens
          </p>

          {/* Buttons, large, centered */}
          <div className="mb-8 flex flex-wrap items-center justify-center gap-5">
            <button className="bg-teal text-warm-white font-body rounded-xl px-8 py-4 text-base font-medium">
              Primary Button
            </button>
            <button className="bg-sage text-soft-black font-body rounded-xl px-8 py-4 text-base font-medium">
              Secondary
            </button>
            <button className="text-warm-white border-warm-white/30 font-body rounded-xl border bg-transparent px-8 py-4 text-base font-medium">
              Ghost
            </button>
            <button className="bg-error text-warm-white font-body rounded-xl px-8 py-4 text-base font-medium">
              Danger
            </button>
          </div>

          <div className="mb-32 flex flex-wrap justify-center gap-3">
            <span className="bg-cream text-teal font-body border-cream-dark rounded-full border px-4 py-1.5 text-xs font-medium tracking-wider uppercase">
              Featured
            </span>
            <span className="bg-teal text-warm-white font-body rounded-full px-4 py-1.5 text-xs font-medium tracking-wider uppercase">
              Verified
            </span>
            <span className="bg-sage/30 text-warm-white font-body rounded-full px-3 py-1.5 text-xs">
              RN
            </span>
            <span className="bg-sage/30 text-warm-white font-body rounded-full px-3 py-1.5 text-xs">
              Elder Care
            </span>
            <span className="bg-sage/30 text-warm-white font-body rounded-full px-3 py-1.5 text-xs">
              Pediatric
            </span>
          </div>

          {/* Input states, side by side on dark */}
          <p className="font-body text-sage/40 mb-10 text-xs tracking-[0.4em] uppercase">
            Input states
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-body text-sage/50 mb-2 text-[10px] tracking-widest uppercase">
                Default
              </p>
              <div className="bg-warm-white border-cream-dark font-body text-soft-black-light rounded-xl border px-4 py-3 text-sm">
                Placeholder...
              </div>
            </div>
            <div>
              <p className="font-body text-sage/50 mb-2 text-[10px] tracking-widest uppercase">
                Focus
              </p>
              <div className="bg-warm-white border-teal font-body text-soft-black ring-teal/20 rounded-xl border-2 px-4 py-3 text-sm ring-2">
                Active input
              </div>
            </div>
            <div>
              <p className="font-body text-sage/50 mb-2 text-[10px] tracking-widest uppercase">
                Error
              </p>
              <div className="bg-warm-white border-error font-body text-soft-black rounded-xl border-2 px-4 py-3 text-sm">
                Invalid entry
              </div>
              <p className="font-body text-error mt-1.5 text-xs">
                Required field.
              </p>
            </div>
            <div>
              <p className="font-body text-sage/50 mb-2 text-[10px] tracking-widest uppercase">
                Disabled
              </p>
              <div className="bg-warm-white/50 border-sage/20 font-body text-soft-black-light/30 rounded-xl border px-4 py-3 text-sm">
                Disabled
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* GRID & SPACING, clean, technical                  */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-body text-sage-dark mb-16 text-xs tracking-[0.4em] uppercase">
            Grid &amp; spacing
          </p>

          <div className="mb-20 grid gap-12 md:grid-cols-3">
            {[
              { label: "Desktop", width: "1440px", cols: 12, gutters: "24px" },
              { label: "Tablet", width: "768px", cols: 8, gutters: "16px" },
              { label: "Mobile", width: "375px", cols: 4, gutters: "16px" },
            ].map((bp) => (
              <div key={bp.label}>
                <p className="font-heading text-teal-dark mb-1 text-3xl">
                  {bp.width}
                </p>
                <p className="font-body text-soft-black-light mb-6 text-xs">
                  {bp.cols} columns · {bp.gutters} gutters
                </p>
                <div className="flex gap-[2px]">
                  {Array.from({ length: bp.cols }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-teal/10 h-24 flex-1 rounded-sm"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Spacing scale, proportional blocks */}
          <p className="font-body text-soft-black-light mb-6 text-xs">
            Spacing scale (px)
          </p>
          <div className="flex items-end gap-2 sm:gap-3">
            {[4, 8, 12, 16, 24, 32, 48, 64, 96, 128].map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <div
                  className="bg-teal/15 rounded-sm"
                  style={{
                    width: `${Math.max(size * 0.6, 8)}px`,
                    height: `${size}px`,
                  }}
                />
                <span className="font-body text-soft-black-light text-[10px]">
                  {size}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* EMAIL, full-bleed dark with the mock as star      */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-soft-black px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto flex max-w-5xl flex-col items-center">
          <p className="font-body text-sage/40 mb-16 text-xs tracking-[0.4em] uppercase">
            Email template
          </p>

          {/* Email mock, centered, larger */}
          <div className="mb-16 w-full max-w-sm">
            <div className="bg-teal flex items-center justify-center rounded-t-xl px-6 py-5">
              <span className="font-heading text-warm-white text-xl tracking-tight">
                NurseDex
              </span>
            </div>
            <div className="bg-warm-white space-y-4 px-8 py-10">
              <p className="font-heading text-soft-black text-lg">
                Welcome to NurseDex
              </p>
              <p className="font-body text-soft-black-light text-sm leading-relaxed">
                You&apos;re one step closer to finding the right care for your
                family. Browse verified nurse profiles and connect directly, no
                agencies, no middlemen.
              </p>
              <div className="flex justify-center pt-4">
                <div className="bg-teal text-warm-white font-body rounded-xl px-8 py-3 text-sm font-medium">
                  Start Searching
                </div>
              </div>
            </div>
            <div className="bg-soft-black-light/20 border-warm-white/5 rounded-b-xl border-t px-6 py-4 text-center">
              <p className="font-body text-warm-white/40 text-[10px]">
                Unsubscribe · Privacy Policy · Long Island, NY
              </p>
            </div>
          </div>

          {/* Email rules, minimal */}
          <div className="grid w-full gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Header", rule: "Logo on teal bar, centered" },
              {
                label: "Body",
                rule: "DM Sans fallback, single column, 600px max",
              },
              { label: "CTA", rule: "One teal button per email, rounded" },
              { label: "Footer", rule: "Dark bg, unsubscribe link, CAN-SPAM" },
            ].map((item) => (
              <div key={item.label}>
                <p className="font-body text-sage/50 mb-2 text-[10px] tracking-widest uppercase">
                  {item.label}
                </p>
                <p className="font-body text-warm-white/70 text-sm">
                  {item.rule}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* ACCESSIBILITY + CO-BRANDING, side by side          */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto grid max-w-5xl gap-20 lg:grid-cols-2">
          {/* Accessibility */}
          <div>
            <p className="font-body text-sage-dark mb-10 text-xs tracking-[0.4em] uppercase">
              Accessibility
            </p>
            <ul className="space-y-5">
              {accessibilityChecklist.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="bg-teal/10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                    <svg
                      className="text-teal h-3 w-3"
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
                  <span className="font-body text-soft-black text-sm">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Co-branding */}
          <div>
            <p className="font-body text-sage-dark mb-10 text-xs tracking-[0.4em] uppercase">
              Co-branding
            </p>
            <div className="mb-10 flex items-center gap-8">
              <div className="flex flex-col items-center gap-2">
                <div className="bg-teal flex h-16 w-16 items-center justify-center rounded-xl">
                  <span className="font-heading text-warm-white text-xl leading-none font-semibold tracking-[-0.06em]">
                    ND
                  </span>
                </div>
                <span className="font-body text-sage-dark text-[10px]">
                  NurseDex
                </span>
              </div>
              <div className="bg-sage/30 h-16 w-px" />
              <div className="flex flex-col items-center gap-2">
                <div className="bg-cream-dark/40 flex h-14 w-14 items-center justify-center rounded-xl">
                  <span className="font-body text-soft-black-light text-xs">
                    Partner
                  </span>
                </div>
                <span className="font-body text-sage-dark text-[10px]">
                  Partner Co.
                </span>
              </div>
            </div>
            <ul className="space-y-3">
              {coBrandingRules.map((rule) => (
                <li key={rule} className="flex items-start gap-3">
                  <span className="bg-sage mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
                  <span className="font-body text-soft-black-light text-sm">
                    {rule}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* BACK COVER                                         */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-teal-dark">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-32 text-center sm:px-12 lg:px-24">
          <div className="bg-teal border-sage/30 flex h-20 w-20 items-center justify-center rounded-2xl border-2">
            <span className="font-heading text-warm-white text-3xl leading-none font-semibold tracking-[-0.06em] select-none">
              ND
            </span>
          </div>

          <h3 className="font-heading text-warm-white text-3xl sm:text-4xl">
            NurseDex
          </h3>

          <p className="font-body text-sage text-lg">
            Questions about the brand? Reach out.
          </p>

          <div className="space-y-2">
            <p className="font-body text-warm-white/80">contact@nursedex.com</p>
            <p className="font-body text-warm-white/80">www.nursedex.com</p>
          </div>

          <div className="bg-sage/30 h-0.5 w-8 rounded-full" />

          <p className="font-body text-sage/60 text-sm italic">
            Built with care on Long Island, NY.
          </p>

          <p className="font-body text-sage/40 text-xs tracking-widest uppercase">
            Version 1.0 &middot; 2026
          </p>
        </div>
      </div>
    </section>
  );
}
