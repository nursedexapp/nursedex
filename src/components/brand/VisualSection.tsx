const icons = [
  {
    name: "Search",
    svg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
  },
  {
    name: "Heart",
    svg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
  },
  {
    name: "Verified",
    svg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    name: "Phone",
    svg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
      </svg>
    ),
  },
  {
    name: "Location",
    svg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    name: "Star",
    svg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    name: "User",
    svg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="7" r="4" />
        <path d="M5.5 21a6.5 6.5 0 0113 0" />
      </svg>
    ),
  },
  {
    name: "Calendar",
    svg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
];

const photoSubjects = [
  {
    label: "Caregiver & Elder",
    description:
      "A home health aide helping an elderly woman in her living room. Warm natural light from a window. Both smiling.",
    bg: "bg-teal",
  },
  {
    label: "Family Moment",
    description:
      "An adult daughter visiting her father with a nurse present. Kitchen table, coffee mugs, genuine laughter.",
    bg: "bg-sage",
  },
  {
    label: "Nurse Portrait",
    description:
      "A confident nurse in casual professional clothing, standing on a front porch. Soft morning light, relaxed posture.",
    bg: "bg-teal-dark",
  },
  {
    label: "Hands of Care",
    description:
      "Close-up of a caregiver holding a patient's hand. Soft focus background, warm color tones.",
    bg: "bg-sage-dark",
  },
];

const motionSpecs = [
  {
    name: "Button Hover",
    duration: "150ms",
    easing: "ease-in-out",
    description: "Subtle background color shift and slight elevation",
  },
  {
    name: "Card Hover",
    duration: "200ms",
    easing: "ease-in-out",
    description: "Shadow increase and gentle 2px upward translate",
  },
  {
    name: "Page Transition",
    duration: "300 to 500ms",
    easing: "ease-in-out",
    description: "Fade with subtle vertical slide (8 to 12px)",
  },
  {
    name: "Toast Notification",
    duration: "250ms in / 200ms out",
    easing: "ease-out / ease-in",
    description: "Slide in from top-right, fade out",
  },
];

const shadows = [
  {
    label: "Shadow SM",
    value: "0 1px 2px rgba(0,0,0,0.06)",
    className: "shadow-sm",
  },
  {
    label: "Shadow MD",
    value: "0 4px 6px -1px rgba(0,0,0,0.07)",
    className: "shadow-md",
  },
  {
    label: "Shadow LG",
    value: "0 10px 15px -3px rgba(0,0,0,0.08)",
    className: "shadow-lg",
  },
];

const radii = [
  { label: "Small", value: "4px", use: "Buttons, inputs", className: "rounded" },
  { label: "Medium", value: "8px", use: "Cards, containers", className: "rounded-lg" },
  { label: "Large", value: "12px", use: "Modals, dialogs", className: "rounded-xl" },
  { label: "Pill", value: "24px", use: "Tags, pills, badges", className: "rounded-3xl" },
];

export default function VisualSection() {
  return (
    <section id="visual">
      {/* -------------------------------------------------- */}
      {/* Section Header — sage background from divider */}
      {/* -------------------------------------------------- */}
      <div className="bg-sage px-6 sm:px-12 lg:px-24 pt-24 pb-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-heading text-6xl sm:text-7xl text-teal-dark">
            Visual Language
          </h2>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Iconography */}
      {/* -------------------------------------------------- */}
      <div className="bg-white">
        <div className="px-6 sm:px-12 lg:px-24 py-16 max-w-6xl mx-auto">
          <h3 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-teal-dark mb-4">
            Iconography
          </h3>
          <p className="font-body text-soft-black-light leading-relaxed mb-8 max-w-2xl">
            Rounded, 2px stroke weight, friendly but professional. All icons sit
            on a 24&times;24 base grid with 2px internal padding.
          </p>

          {/* Icon Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-6 mb-10">
            {icons.map((icon) => (
              <div
                key={icon.name}
                className="flex flex-col items-center gap-3 py-4"
              >
                <span className="text-soft-black">{icon.svg}</span>
                <span className="font-body text-[11px] text-soft-black-light">
                  {icon.name}
                </span>
              </div>
            ))}
          </div>

          {/* Icon Color States */}
          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            <div className="flex items-center gap-4 py-4">
              <span className="text-soft-black">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </span>
              <div>
                <p className="font-body text-sm font-semibold text-soft-black">Default</p>
                <p className="font-body text-xs text-soft-black-light">Soft Black</p>
              </div>
            </div>
            <div className="flex items-center gap-4 py-4">
              <span className="text-teal">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </span>
              <div>
                <p className="font-body text-sm font-semibold text-soft-black">Interactive</p>
                <p className="font-body text-xs text-soft-black-light">Deep Teal</p>
              </div>
            </div>
            <div className="bg-teal-dark rounded-xl p-4 flex items-center gap-4">
              <span className="text-warm-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </span>
              <div>
                <p className="font-body text-sm font-semibold text-warm-white">On Dark</p>
                <p className="font-body text-xs text-sage-light">White</p>
              </div>
            </div>
          </div>
        </div>

        {/* Icon Do's and Don'ts — sage strip */}
        <div className="bg-sage/10">
          <div className="px-6 sm:px-12 lg:px-24 py-10 max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="border-l-4 border-teal pl-8">
                <p className="font-body text-xs uppercase tracking-[0.25em] text-teal-dark mb-4 font-semibold">
                  Do
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-5 h-5 rounded-full bg-teal flex items-center justify-center shrink-0">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="font-body text-soft-black leading-relaxed">
                      Use consistently from the same icon family
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-5 h-5 rounded-full bg-teal flex items-center justify-center shrink-0">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="font-body text-soft-black leading-relaxed">
                      Maintain 24px grid alignment
                    </span>
                  </li>
                </ul>
              </div>
              <div className="border-l-4 border-cream-dark pl-8">
                <p className="font-body text-xs uppercase tracking-[0.25em] text-soft-black-light mb-4 font-semibold">
                  Don&apos;t
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-5 h-5 rounded-full bg-cream-dark flex items-center justify-center shrink-0">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 3L9 9M9 3L3 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="font-body text-soft-black-light leading-relaxed">
                      Mix filled and outlined icon styles
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 w-5 h-5 rounded-full bg-cream-dark flex items-center justify-center shrink-0">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 3L9 9M9 3L3 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="font-body text-soft-black-light leading-relaxed">
                      Use clinical medical icons (syringes, red crosses)
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Photography Direction — full-bleed sage-light */}
      {/* -------------------------------------------------- */}
      <div className="bg-sage-light">
        <div className="px-6 sm:px-12 lg:px-24 py-16 max-w-6xl mx-auto">
          <h3 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-teal-dark mb-4">
            Photography Direction
          </h3>
          <p className="font-body text-soft-black-light leading-relaxed mb-10 max-w-2xl">
            Real people, real moments of care. Diverse ages and ethnicities. Homes,
            not hospitals. Warm, natural lighting. Candid over posed. Genuine
            smiles.
          </p>

          {/* Photo Subject Placeholders — white bg cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {photoSubjects.map((photo) => (
              <div
                key={photo.label}
                className={`${photo.bg} rounded-2xl aspect-[3/4] relative overflow-hidden`}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <p className="font-body text-xs uppercase tracking-[0.2em] text-sage-light mb-2">
                    {photo.label}
                  </p>
                  <p className="font-body text-sm text-warm-white leading-relaxed">
                    {photo.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* What to Avoid */}
          <div className="bg-white rounded-2xl p-8 mb-10">
            <p className="font-body text-xs uppercase tracking-[0.25em] text-sage-dark mb-4 font-semibold">
              What to Avoid
            </p>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                "Stock photo cliches",
                "Scrubs-only imagery",
                "Sterile hospital settings",
                "Clinical white backgrounds",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 font-body text-sm text-soft-black-light"
                >
                  <span className="w-4 h-4 rounded-full bg-cream-dark flex items-center justify-center shrink-0">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M2 2L6 6M6 2L2 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Photography Treatment & Overlays — demonstrated live */}
          <h4 className="font-body text-lg font-semibold text-soft-black mb-6">
            Photography Treatment &amp; Overlays
          </h4>
          <p className="font-body text-soft-black-light leading-relaxed mb-6 max-w-2xl">
            When placing text over photography, use a gradient overlay or
            semi-transparent color block to ensure legibility.
          </p>
        </div>

        {/* Full-width overlay strips */}
        <div className="relative w-full h-48 bg-sage overflow-hidden">
          <div className="absolute inset-0 bg-teal/75" />
          <div className="absolute inset-0 flex items-center px-6 sm:px-12 lg:px-24 max-w-6xl mx-auto">
            <div>
              <p className="font-body text-xs uppercase tracking-[0.2em] text-sage-light mb-2">
                Teal Overlay &middot; 70 to 85% Opacity
              </p>
              <p className="font-heading text-2xl sm:text-3xl text-warm-white">
                Find care that feels like family
              </p>
            </div>
          </div>
        </div>
        <div className="relative w-full h-48 bg-sage overflow-hidden">
          <div className="absolute inset-0 bg-soft-black/70" />
          <div className="absolute inset-0 flex items-center px-6 sm:px-12 lg:px-24 max-w-6xl mx-auto">
            <div>
              <p className="font-body text-xs uppercase tracking-[0.2em] text-sage-light mb-2">
                Soft Black Overlay &middot; 60 to 80% Opacity
              </p>
              <p className="font-heading text-2xl sm:text-3xl text-warm-white">
                Find care that feels like family
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Illustration Style — white bg */}
      {/* -------------------------------------------------- */}
      <div className="bg-white">
        <div className="px-6 sm:px-12 lg:px-24 py-16 max-w-6xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-4">
            Illustration Style
          </p>
          <p className="font-body text-soft-black-light leading-relaxed mb-8 max-w-2xl">
            Organic, soft, hand-drawn feel. Rounded shapes, imperfect lines.
            Limited palette drawn from brand colors.
          </p>

          <div className="grid sm:grid-cols-2 gap-12">
            <div>
              <p className="font-body text-xs uppercase tracking-[0.25em] text-sage-dark mb-4 font-semibold">
                Subject Matter
              </p>
              <ul className="space-y-3">
                {[
                  "People and hands in moments of connection",
                  "Homes, doorways, warm interiors",
                  "Nature: leaves, organic shapes, flowers",
                  "Community scenes, neighborhoods",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="w-2 h-2 rounded-full bg-teal mt-2 shrink-0" />
                    <span className="font-body text-soft-black leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-body text-xs uppercase tracking-[0.25em] text-sage-dark mb-4 font-semibold">
                Avoid
              </p>
              <ul className="space-y-3">
                {[
                  "Flat corporate illustration styles",
                  "Geometric or tech-forward aesthetics",
                  "Hospital infographics or clinical diagrams",
                  "Overly polished vector art",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="w-2 h-2 rounded-full bg-cream-dark mt-2 shrink-0" />
                    <span className="font-body text-soft-black-light leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Color palette for illustrations */}
          <div className="mt-8 flex flex-wrap gap-4">
            {[
              { name: "Teal", className: "bg-teal" },
              { name: "Sage", className: "bg-sage" },
              { name: "Cream", className: "bg-cream" },
              { name: "Soft Black", className: "bg-soft-black" },
            ].map((color) => (
              <div key={color.name} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full ${color.className}`}
                />
                <span className="font-body text-sm text-soft-black-light">
                  {color.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Graphic Elements & Patterns — full-bleed teal-dark */}
      {/* -------------------------------------------------- */}
      <div className="bg-teal-dark">
        <div className="px-6 sm:px-12 lg:px-24 py-16 max-w-6xl mx-auto">
          <h3 className="font-heading text-2xl sm:text-3xl text-warm-white mb-4">
            Graphic Elements &amp; Patterns
          </h3>
          <p className="font-body text-sage-light leading-relaxed mb-8 max-w-2xl">
            Organic blob shapes as background decorations. Curved dividers instead
            of straight rules. Light paper-like texture for warmth.
          </p>

          {/* Decorative Blobs */}
          <div className="relative overflow-hidden min-h-[280px] py-8">
            <p className="font-body text-xs uppercase tracking-[0.25em] text-sage-light mb-4 relative z-10">
              Decorative Blob Shapes
            </p>

            {/* Blob 1 */}
            <div
              className="absolute top-8 right-12 w-40 h-40 bg-warm-white/15"
              style={{
                borderRadius: "60% 40% 50% 70% / 50% 60% 40% 50%",
              }}
            />
            {/* Blob 2 */}
            <div
              className="absolute bottom-8 left-16 w-52 h-36 bg-sage/20"
              style={{
                borderRadius: "40% 60% 70% 30% / 60% 30% 70% 40%",
              }}
            />
            {/* Blob 3 */}
            <div
              className="absolute top-20 left-1/3 w-32 h-32 bg-warm-white/10"
              style={{
                borderRadius: "50% 60% 40% 70% / 40% 50% 60% 50%",
              }}
            />
            {/* Blob 4 */}
            <div
              className="absolute bottom-16 right-1/4 w-24 h-28 bg-sage-light/15"
              style={{
                borderRadius: "70% 30% 50% 50% / 30% 70% 30% 70%",
              }}
            />

            {/* Curved divider example */}
            <div className="relative z-10 mt-16">
              <p className="font-body text-xs uppercase tracking-[0.25em] text-sage-light mb-4">
                Curved Divider
              </p>
              <svg
                viewBox="0 0 800 40"
                className="w-full text-sage/40"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 20 Q200 0 400 20 Q600 40 800 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Motion & Animation — white bg, timeline rows */}
      {/* -------------------------------------------------- */}
      <div className="bg-white">
        <div className="px-6 sm:px-12 lg:px-24 py-16 max-w-6xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-4">
            Motion &amp; Animation
          </p>
          <p className="font-body text-soft-black-light leading-relaxed mb-10 max-w-2xl">
            Motion should feel natural and calming, never jarring. Use
            ease-in-out curves and avoid linear easing.
          </p>

          {/* Duration Timeline Bar */}
          <div className="mb-12">
            <div className="flex items-end gap-1 mb-3">
              <div className="flex flex-col items-center flex-1">
                <p className="font-heading text-2xl text-teal-dark mb-2">150 to 300ms</p>
                <div className="w-full h-3 bg-teal rounded-l-full" />
                <p className="font-body text-xs text-soft-black-light mt-2">Micro-interactions</p>
              </div>
              <div className="flex flex-col items-center flex-1">
                <p className="font-heading text-2xl text-teal-dark mb-2">300 to 500ms</p>
                <div className="w-full h-3 bg-sage" />
                <p className="font-body text-xs text-soft-black-light mt-2">Page transitions</p>
              </div>
              <div className="flex flex-col items-center flex-1">
                <p className="font-heading text-2xl text-teal-dark mb-2">1 to 2s</p>
                <div className="w-full h-3 bg-sage-dark rounded-r-full" />
                <p className="font-body text-xs text-soft-black-light mt-2">Loading pulse</p>
              </div>
            </div>
          </div>

          {/* Animation Specs — simple rows */}
          <div className="divide-y divide-sage/20">
            {motionSpecs.map((spec) => (
              <div key={spec.name} className="py-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-8">
                <div className="sm:w-40 shrink-0">
                  <p className="font-body font-semibold text-soft-black">
                    {spec.name}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-body text-xs bg-teal/10 text-teal-dark px-3 py-1 rounded-full">
                    {spec.duration}
                  </span>
                  <span className="font-body text-xs bg-sage/15 text-sage-dark px-3 py-1 rounded-full">
                    {spec.easing}
                  </span>
                </div>
                <p className="font-body text-sm text-soft-black-light">
                  {spec.description}
                </p>
              </div>
            ))}
          </div>

          {/* Motion Don'ts */}
          <div className="mt-10 border-l-4 border-cream-dark pl-8">
            <p className="font-body text-xs uppercase tracking-[0.25em] text-soft-black-light mb-4 font-semibold">
              Avoid
            </p>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                "Bounce effects",
                "Spinning loaders",
                "Aggressive shake animations",
                "Anything that increases anxiety",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 font-body text-sm text-soft-black-light"
                >
                  <span className="w-4 h-4 rounded-full bg-cream-dark flex items-center justify-center shrink-0">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M2 2L6 6M6 2L2 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Texture & Depth — white bg, no card wrappers */}
      {/* -------------------------------------------------- */}
      <div className="bg-white">
        <div className="px-6 sm:px-12 lg:px-24 pt-16 pb-24 max-w-6xl mx-auto">
          <p className="font-body text-xs uppercase tracking-[0.4em] text-sage-dark mb-10">
            Texture &amp; Depth
          </p>

          {/* Shadow System */}
          <h4 className="font-body text-lg font-semibold text-soft-black mb-6">
            Shadow System
          </h4>
          <div className="grid sm:grid-cols-3 gap-8 mb-14">
            {shadows.map((shadow) => (
              <div key={shadow.label} className="flex flex-col items-center gap-4">
                <div
                  className={`w-full aspect-square bg-warm-white rounded-xl ${shadow.className} flex items-center justify-center`}
                >
                  <span className="font-body text-sm text-soft-black-light">
                    {shadow.label}
                  </span>
                </div>
                <code className="font-mono text-xs text-soft-black-light text-center">
                  {shadow.value}
                </code>
              </div>
            ))}
          </div>

          {/* Border Radius */}
          <h4 className="font-body text-lg font-semibold text-soft-black mb-6">
            Border Radius
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {radii.map((radius) => (
              <div key={radius.label} className="flex flex-col items-center gap-4">
                <div
                  className={`w-full aspect-square border-2 border-sage/30 ${radius.className} flex items-center justify-center`}
                >
                  <span className="font-body text-sm font-semibold text-teal-dark">
                    {radius.value}
                  </span>
                </div>
                <div className="text-center">
                  <p className="font-body text-sm font-semibold text-soft-black">
                    {radius.label}
                  </p>
                  <p className="font-body text-xs text-soft-black-light">
                    {radius.use}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
