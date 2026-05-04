const icons = [
  {
    name: "Search",
    svg: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
  },
  {
    name: "Heart",
    svg: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
  },
  {
    name: "Verified",
    svg: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    name: "Phone",
    svg: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
      </svg>
    ),
  },
  {
    name: "Location",
    svg: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    name: "Star",
    svg: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    name: "User",
    svg: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="7" r="4" />
        <path d="M5.5 21a6.5 6.5 0 0113 0" />
      </svg>
    ),
  },
  {
    name: "Calendar",
    svg: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
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
  {
    label: "Small",
    value: "4px",
    use: "Buttons, inputs",
    className: "rounded",
  },
  {
    label: "Medium",
    value: "8px",
    use: "Cards, containers",
    className: "rounded-lg",
  },
  {
    label: "Large",
    value: "12px",
    use: "Modals, dialogs",
    className: "rounded-xl",
  },
  {
    label: "Pill",
    value: "24px",
    use: "Tags, pills, badges",
    className: "rounded-3xl",
  },
];

export default function VisualSection() {
  return (
    <section id="visual">
      {/* -------------------------------------------------- */}
      {/* Section Header, sage background from divider */}
      {/* -------------------------------------------------- */}
      <div className="bg-sage px-6 pt-24 pb-24 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-heading text-teal-dark text-6xl sm:text-7xl">
            Visual Language
          </h2>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Iconography */}
      {/* -------------------------------------------------- */}
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12 lg:px-24">
          <h3 className="font-heading text-teal-dark mb-4 text-3xl sm:text-4xl lg:text-5xl">
            Iconography
          </h3>
          <p className="font-body text-soft-black-light mb-8 max-w-2xl leading-relaxed">
            Rounded, 2px stroke weight, friendly but professional. All icons sit
            on a 24&times;24 base grid with 2px internal padding.
          </p>

          {/* Icon Grid */}
          <div className="mb-10 grid grid-cols-4 gap-6 sm:grid-cols-8">
            {icons.map((icon) => (
              <div
                key={icon.name}
                className="flex flex-col items-center gap-3 py-4"
              >
                <span className="text-soft-black">{icon.svg}</span>
                <span className="font-body text-soft-black-light text-[11px]">
                  {icon.name}
                </span>
              </div>
            ))}
          </div>

          {/* Icon Color States */}
          <div className="mb-10 grid gap-6 sm:grid-cols-3">
            <div className="flex items-center gap-4 py-4">
              <span className="text-soft-black">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </span>
              <div>
                <p className="font-body text-soft-black text-sm font-semibold">
                  Default
                </p>
                <p className="font-body text-soft-black-light text-xs">
                  Soft Black
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 py-4">
              <span className="text-teal">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </span>
              <div>
                <p className="font-body text-soft-black text-sm font-semibold">
                  Interactive
                </p>
                <p className="font-body text-soft-black-light text-xs">
                  Deep Teal
                </p>
              </div>
            </div>
            <div className="bg-teal-dark flex items-center gap-4 rounded-xl p-4">
              <span className="text-warm-white">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </span>
              <div>
                <p className="font-body text-warm-white text-sm font-semibold">
                  On Dark
                </p>
                <p className="font-body text-sage-light text-xs">White</p>
              </div>
            </div>
          </div>
        </div>

        {/* Icon Do's and Don'ts, sage strip */}
        <div className="bg-sage/10">
          <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 lg:px-24">
            <div className="grid gap-8 md:grid-cols-2">
              <div className="border-teal border-l-4 pl-8">
                <p className="font-body text-teal-dark mb-4 text-xs font-semibold tracking-[0.25em] uppercase">
                  Do
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="bg-teal mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2.5 6L5 8.5L9.5 3.5"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="font-body text-soft-black leading-relaxed">
                      Use consistently from the same icon family
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="bg-teal mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2.5 6L5 8.5L9.5 3.5"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="font-body text-soft-black leading-relaxed">
                      Maintain 24px grid alignment
                    </span>
                  </li>
                </ul>
              </div>
              <div className="border-cream-dark border-l-4 pl-8">
                <p className="font-body text-soft-black-light mb-4 text-xs font-semibold tracking-[0.25em] uppercase">
                  Don&apos;t
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="bg-cream-dark mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M3 3L9 9M9 3L3 9"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span className="font-body text-soft-black-light leading-relaxed">
                      Mix filled and outlined icon styles
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="bg-cream-dark mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M3 3L9 9M9 3L3 9"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
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
      {/* Photography Direction, full-bleed sage-light */}
      {/* -------------------------------------------------- */}
      <div className="bg-sage-light">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12 lg:px-24">
          <h3 className="font-heading text-teal-dark mb-4 text-3xl sm:text-4xl lg:text-5xl">
            Photography Direction
          </h3>
          <p className="font-body text-soft-black-light mb-10 max-w-2xl leading-relaxed">
            Real people, real moments of care. Diverse ages and ethnicities.
            Homes, not hospitals. Warm, natural lighting. Candid over posed.
            Genuine smiles.
          </p>

          {/* Photo Subject Placeholders, white bg cards */}
          <div className="mb-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {photoSubjects.map((photo) => (
              <div
                key={photo.label}
                className={`${photo.bg} relative aspect-[3/4] overflow-hidden rounded-2xl`}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute right-0 bottom-0 left-0 p-5">
                  <p className="font-body text-sage-light mb-2 text-xs tracking-[0.2em] uppercase">
                    {photo.label}
                  </p>
                  <p className="font-body text-warm-white text-sm leading-relaxed">
                    {photo.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* What to Avoid */}
          <div className="mb-10 rounded-2xl bg-white p-8">
            <p className="font-body text-sage-dark mb-4 text-xs font-semibold tracking-[0.25em] uppercase">
              What to Avoid
            </p>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              {[
                "Stock photo cliches",
                "Scrubs-only imagery",
                "Sterile hospital settings",
                "Clinical white backgrounds",
              ].map((item) => (
                <div
                  key={item}
                  className="font-body text-soft-black-light flex items-center gap-2 text-sm"
                >
                  <span className="bg-cream-dark flex h-4 w-4 shrink-0 items-center justify-center rounded-full">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path
                        d="M2 2L6 6M6 2L2 6"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Photography Treatment & Overlays, demonstrated live */}
          <h4 className="font-body text-soft-black mb-6 text-lg font-semibold">
            Photography Treatment &amp; Overlays
          </h4>
          <p className="font-body text-soft-black-light mb-6 max-w-2xl leading-relaxed">
            When placing text over photography, use a gradient overlay or
            semi-transparent color block to ensure legibility.
          </p>
        </div>

        {/* Full-width overlay strips */}
        <div className="bg-sage relative h-48 w-full overflow-hidden">
          <div className="bg-teal/75 absolute inset-0" />
          <div className="absolute inset-0 mx-auto flex max-w-6xl items-center px-6 sm:px-12 lg:px-24">
            <div>
              <p className="font-body text-sage-light mb-2 text-xs tracking-[0.2em] uppercase">
                Teal Overlay &middot; 70 to 85% Opacity
              </p>
              <p className="font-heading text-warm-white text-2xl sm:text-3xl">
                Find care that feels like family
              </p>
            </div>
          </div>
        </div>
        <div className="bg-sage relative h-48 w-full overflow-hidden">
          <div className="bg-soft-black/70 absolute inset-0" />
          <div className="absolute inset-0 mx-auto flex max-w-6xl items-center px-6 sm:px-12 lg:px-24">
            <div>
              <p className="font-body text-sage-light mb-2 text-xs tracking-[0.2em] uppercase">
                Soft Black Overlay &middot; 60 to 80% Opacity
              </p>
              <p className="font-heading text-warm-white text-2xl sm:text-3xl">
                Find care that feels like family
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Illustration Style, white bg */}
      {/* -------------------------------------------------- */}
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12 lg:px-24">
          <p className="font-body text-sage-dark mb-4 text-xs tracking-[0.4em] uppercase">
            Illustration Style
          </p>
          <p className="font-body text-soft-black-light mb-8 max-w-2xl leading-relaxed">
            Organic, soft, hand-drawn feel. Rounded shapes, imperfect lines.
            Limited palette drawn from brand colors.
          </p>

          <div className="grid gap-12 sm:grid-cols-2">
            <div>
              <p className="font-body text-sage-dark mb-4 text-xs font-semibold tracking-[0.25em] uppercase">
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
                    <span className="bg-teal mt-2 h-2 w-2 shrink-0 rounded-full" />
                    <span className="font-body text-soft-black leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-body text-sage-dark mb-4 text-xs font-semibold tracking-[0.25em] uppercase">
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
                    <span className="bg-cream-dark mt-2 h-2 w-2 shrink-0 rounded-full" />
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
                <div className={`h-8 w-8 rounded-full ${color.className}`} />
                <span className="font-body text-soft-black-light text-sm">
                  {color.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* Graphic Elements & Patterns, full-bleed teal-dark */}
      {/* -------------------------------------------------- */}
      <div className="bg-teal-dark">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12 lg:px-24">
          <h3 className="font-heading text-warm-white mb-4 text-2xl sm:text-3xl">
            Graphic Elements &amp; Patterns
          </h3>
          <p className="font-body text-sage-light mb-8 max-w-2xl leading-relaxed">
            Organic blob shapes as background decorations. Curved dividers
            instead of straight rules. Light paper-like texture for warmth.
          </p>

          {/* Decorative Blobs */}
          <div className="relative min-h-[280px] overflow-hidden py-8">
            <p className="font-body text-sage-light relative z-10 mb-4 text-xs tracking-[0.25em] uppercase">
              Decorative Blob Shapes
            </p>

            {/* Blob 1 */}
            <div
              className="bg-warm-white/15 absolute top-8 right-12 h-40 w-40"
              style={{
                borderRadius: "60% 40% 50% 70% / 50% 60% 40% 50%",
              }}
            />
            {/* Blob 2 */}
            <div
              className="bg-sage/20 absolute bottom-8 left-16 h-36 w-52"
              style={{
                borderRadius: "40% 60% 70% 30% / 60% 30% 70% 40%",
              }}
            />
            {/* Blob 3 */}
            <div
              className="bg-warm-white/10 absolute top-20 left-1/3 h-32 w-32"
              style={{
                borderRadius: "50% 60% 40% 70% / 40% 50% 60% 50%",
              }}
            />
            {/* Blob 4 */}
            <div
              className="bg-sage-light/15 absolute right-1/4 bottom-16 h-28 w-24"
              style={{
                borderRadius: "70% 30% 50% 50% / 30% 70% 30% 70%",
              }}
            />

            {/* Curved divider example */}
            <div className="relative z-10 mt-16">
              <p className="font-body text-sage-light mb-4 text-xs tracking-[0.25em] uppercase">
                Curved Divider
              </p>
              <svg
                viewBox="0 0 800 40"
                className="text-sage/40 w-full"
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
      {/* Motion & Animation, white bg, timeline rows */}
      {/* -------------------------------------------------- */}
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12 lg:px-24">
          <p className="font-body text-sage-dark mb-4 text-xs tracking-[0.4em] uppercase">
            Motion &amp; Animation
          </p>
          <p className="font-body text-soft-black-light mb-10 max-w-2xl leading-relaxed">
            Motion should feel natural and calming, never jarring. Use
            ease-in-out curves and avoid linear easing.
          </p>

          {/* Duration Timeline Bar */}
          <div className="mb-12">
            <div className="mb-3 flex items-end gap-1">
              <div className="flex flex-1 flex-col items-center">
                <p className="font-heading text-teal-dark mb-2 text-2xl">
                  150 to 300ms
                </p>
                <div className="bg-teal h-3 w-full rounded-l-full" />
                <p className="font-body text-soft-black-light mt-2 text-xs">
                  Micro-interactions
                </p>
              </div>
              <div className="flex flex-1 flex-col items-center">
                <p className="font-heading text-teal-dark mb-2 text-2xl">
                  300 to 500ms
                </p>
                <div className="bg-sage h-3 w-full" />
                <p className="font-body text-soft-black-light mt-2 text-xs">
                  Page transitions
                </p>
              </div>
              <div className="flex flex-1 flex-col items-center">
                <p className="font-heading text-teal-dark mb-2 text-2xl">
                  1 to 2s
                </p>
                <div className="bg-sage-dark h-3 w-full rounded-r-full" />
                <p className="font-body text-soft-black-light mt-2 text-xs">
                  Loading pulse
                </p>
              </div>
            </div>
          </div>

          {/* Animation Specs, simple rows */}
          <div className="divide-sage/20 divide-y">
            {motionSpecs.map((spec) => (
              <div
                key={spec.name}
                className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:gap-8"
              >
                <div className="shrink-0 sm:w-40">
                  <p className="font-body text-soft-black font-semibold">
                    {spec.name}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-body bg-teal/10 text-teal-dark rounded-full px-3 py-1 text-xs">
                    {spec.duration}
                  </span>
                  <span className="font-body bg-sage/15 text-sage-dark rounded-full px-3 py-1 text-xs">
                    {spec.easing}
                  </span>
                </div>
                <p className="font-body text-soft-black-light text-sm">
                  {spec.description}
                </p>
              </div>
            ))}
          </div>

          {/* Motion Don'ts */}
          <div className="border-cream-dark mt-10 border-l-4 pl-8">
            <p className="font-body text-soft-black-light mb-4 text-xs font-semibold tracking-[0.25em] uppercase">
              Avoid
            </p>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              {[
                "Bounce effects",
                "Spinning loaders",
                "Aggressive shake animations",
                "Anything that increases anxiety",
              ].map((item) => (
                <div
                  key={item}
                  className="font-body text-soft-black-light flex items-center gap-2 text-sm"
                >
                  <span className="bg-cream-dark flex h-4 w-4 shrink-0 items-center justify-center rounded-full">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path
                        d="M2 2L6 6M6 2L2 6"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
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
      {/* Texture & Depth, white bg, no card wrappers */}
      {/* -------------------------------------------------- */}
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-6 pt-16 pb-24 sm:px-12 lg:px-24">
          <p className="font-body text-sage-dark mb-10 text-xs tracking-[0.4em] uppercase">
            Texture &amp; Depth
          </p>

          {/* Shadow System */}
          <h4 className="font-body text-soft-black mb-6 text-lg font-semibold">
            Shadow System
          </h4>
          <div className="mb-14 grid gap-8 sm:grid-cols-3">
            {shadows.map((shadow) => (
              <div
                key={shadow.label}
                className="flex flex-col items-center gap-4"
              >
                <div
                  className={`bg-warm-white aspect-square w-full rounded-xl ${shadow.className} flex items-center justify-center`}
                >
                  <span className="font-body text-soft-black-light text-sm">
                    {shadow.label}
                  </span>
                </div>
                <code className="text-soft-black-light text-center font-mono text-xs">
                  {shadow.value}
                </code>
              </div>
            ))}
          </div>

          {/* Border Radius */}
          <h4 className="font-body text-soft-black mb-6 text-lg font-semibold">
            Border Radius
          </h4>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {radii.map((radius) => (
              <div
                key={radius.label}
                className="flex flex-col items-center gap-4"
              >
                <div
                  className={`border-sage/30 aspect-square w-full border-2 ${radius.className} flex items-center justify-center`}
                >
                  <span className="font-body text-teal-dark text-sm font-semibold">
                    {radius.value}
                  </span>
                </div>
                <div className="text-center">
                  <p className="font-body text-soft-black text-sm font-semibold">
                    {radius.label}
                  </p>
                  <p className="font-body text-soft-black-light text-xs">
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
