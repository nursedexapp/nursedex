import CopyHex from "./CopyHex";

export default function ColorSection() {
  const supportingColors = [
    {
      name: "Warm Cream",
      hex: "#F5D5A8",
      rgb: "245, 213, 168",
      usage: "Accent. Warm highlights, badges, soft emphasis.",
      bg: "bg-cream",
      text: "text-soft-black",
    },
    {
      name: "Warm White",
      hex: "#FBF9F7",
      rgb: "251, 249, 247",
      usage: "Default background. Page canvas, cards.",
      bg: "bg-warm-white",
      text: "text-soft-black",
    },
    {
      name: "Soft Black",
      hex: "#2D3436",
      rgb: "45, 52, 54",
      usage: "Primary text. Headings, body copy, icons.",
      bg: "bg-soft-black",
      text: "text-white",
    },
  ];

  const semanticColors = [
    { name: "Success", bg: "bg-success", hex: "#2D8B5F", desc: "Confirmations, positive actions, completed states" },
    { name: "Warning", bg: "bg-warning", hex: "#D4A843", desc: "Alerts, caution states, pending reviews" },
    { name: "Error", bg: "bg-error", hex: "#C0555A", desc: "Errors, destructive actions. Soft, not alarming" },
    { name: "Info", bg: "bg-info", hex: "#3A8B9B", desc: "Informational, neutral highlights, tips" },
  ];

  const extendedPalette = [
    {
      name: "Deep Teal",
      stops: "#E9F2F1, #B5D7D2, #6AADA4, #2A7B6F, #1A4F47",
    },
    {
      name: "Soft Sage",
      stops: "#EFF5F1, #D4E5DB, #A8C5B5, #7FA897, #5A8A78",
    },
    {
      name: "Warm Cream",
      stops: "#FDF6EC, #FAE8CD, #F5D5A8, #E8BF82, #D4A35C",
    },
    {
      name: "Soft Black",
      stops: "#E8EAEB, #B0B5B7, #6E7577, #2D3436, #1A1F20",
    },
  ];

  const gradients = [
    { name: "Primary", css: "linear-gradient(135deg, #2A7B6F, #A8C5B5)", desc: "Deep Teal → Soft Sage at 135°" },
    { name: "Subtle", css: "linear-gradient(90deg, #A8C5B5, #FBF9F7)", desc: "Soft Sage → Warm White, horizontal" },
    { name: "Depth", css: "linear-gradient(180deg, #2A7B6F, #1A4F47)", desc: "Deep Teal → Teal Dark, vertical" },
  ];

  const contrastTable = [
    { fg: "Soft Black", fgHex: "#2D3436", bg: "Warm White", bgHex: "#FBF9F7", ratio: "15.4:1", aa: true, aaa: true },
    { fg: "White", fgHex: "#FFFFFF", bg: "Deep Teal", bgHex: "#2A7B6F", ratio: "4.8:1", aa: true, aaa: false },
    { fg: "Deep Teal", fgHex: "#2A7B6F", bg: "Warm White", bgHex: "#FBF9F7", ratio: "5.2:1", aa: true, aaa: false },
    { fg: "Soft Black", fgHex: "#2D3436", bg: "Soft Sage", bgHex: "#A8C5B5", ratio: "6.3:1", aa: true, aaa: false },
    { fg: "White", fgHex: "#FFFFFF", bg: "Soft Black", bgHex: "#2D3436", ratio: "14.5:1", aa: true, aaa: true },
  ];

  return (
    <section id="colors" className="overflow-hidden">
      {/* ────────────────────────────────────────────────── */}
      {/* PRIMARY — Deep Teal — the wall of teal IS the intro */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-teal min-h-[50vh] flex flex-col justify-end px-6 sm:px-12 lg:px-24 pb-16 pt-24">
        <div className="max-w-7xl mx-auto w-full">
          <p className="font-body text-[10px] uppercase tracking-[0.4em] text-white/40 mb-6">
            Primary Color
          </p>
          <h3 className="font-heading text-[clamp(3rem,8vw,7rem)] text-white leading-[0.9] tracking-tight mb-12">
            Deep Teal
          </h3>
          <div className="flex flex-wrap gap-x-16 gap-y-6">
            <div>
              <p className="font-body text-[10px] uppercase tracking-widest text-white/40 mb-1">HEX</p>
              <CopyHex value="#2A7B6F" className="font-mono text-xl text-white" />
            </div>
            <div>
              <p className="font-body text-[10px] uppercase tracking-widest text-white/40 mb-1">RGB</p>
              <CopyHex value="42, 123, 111" className="font-mono text-xl text-white" />
            </div>
            <div>
              <p className="font-body text-[10px] uppercase tracking-widest text-white/40 mb-1">HSL</p>
              <CopyHex value="171°, 49%, 32%" className="font-mono text-xl text-white" />
            </div>
          </div>
          <p className="font-body text-white/60 mt-8 max-w-lg">
            The foundation of NurseDex. Used for CTAs, headers, navigation, and
            any element that needs to convey trust and professionalism.
          </p>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* SECONDARY — Soft Sage — half-viewport band         */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-sage min-h-[50vh] flex flex-col justify-end px-6 sm:px-12 lg:px-24 pb-16 pt-24">
        <div className="max-w-7xl mx-auto w-full">
          <p className="font-body text-[10px] uppercase tracking-[0.4em] text-teal-dark/40 mb-6">
            Secondary Color
          </p>
          <h3 className="font-heading text-[clamp(3rem,8vw,7rem)] text-teal-dark leading-[0.9] tracking-tight mb-12">
            Soft Sage
          </h3>
          <div className="flex flex-wrap gap-x-16 gap-y-6">
            <div>
              <p className="font-body text-[10px] uppercase tracking-widest text-teal-dark/40 mb-1">HEX</p>
              <CopyHex value="#A8C5B5" className="font-mono text-xl text-teal-dark" />
            </div>
            <div>
              <p className="font-body text-[10px] uppercase tracking-widest text-teal-dark/40 mb-1">RGB</p>
              <CopyHex value="168, 197, 181" className="font-mono text-xl text-teal-dark" />
            </div>
            <div>
              <p className="font-body text-[10px] uppercase tracking-widest text-teal-dark/40 mb-1">HSL</p>
              <CopyHex value="147°, 20%, 72%" className="font-mono text-xl text-teal-dark" />
            </div>
          </div>
          <p className="font-body text-teal-dark/60 mt-8 max-w-lg">
            The calming counterpart. Backgrounds, secondary buttons, accents,
            and supporting elements that need to feel approachable without
            competing with teal.
          </p>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* SUPPORTING — tall edge-to-edge blocks              */}
      {/* ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row">
        {supportingColors.map((c) => (
          <div
            key={c.name}
            className={`${c.bg} flex-1 h-48 sm:h-80 flex flex-col justify-end p-6 sm:p-8`}
          >
            <h4 className={`font-heading text-2xl ${c.text} mb-3`}>{c.name}</h4>
            <CopyHex value={c.hex} className={`font-mono text-sm ${c.text} opacity-60 mb-1`} />
            <p className={`font-body text-xs ${c.text} opacity-50`}>{c.usage}</p>
          </div>
        ))}
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* USAGE RATIO                                        */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 sm:px-12 lg:px-24 py-24">
        <div className="max-w-7xl mx-auto">
          <h3 className="font-heading text-2xl text-teal-dark mb-10">
            Recommended Usage Ratio
          </h3>
          <div className="flex h-16 rounded-xl overflow-hidden">
            <div className="bg-warm-white border border-sage/20 relative" style={{ width: "60%" }}>
              <span className="absolute bottom-2 left-4 font-body text-[10px] text-soft-black-light uppercase tracking-wider">60% Warm White</span>
            </div>
            <div className="bg-teal relative" style={{ width: "20%" }}>
              <span className="absolute bottom-2 left-3 font-body text-[10px] text-white/80 uppercase tracking-wider">20% Teal</span>
            </div>
            <div className="bg-sage relative" style={{ width: "10%" }}>
              <span className="absolute bottom-2 left-2 font-body text-[10px] text-teal-dark/70 uppercase tracking-wider">10%</span>
            </div>
            <div className="bg-cream relative" style={{ width: "5%" }}>
              <span className="absolute bottom-2 left-1 font-body text-[10px] text-soft-black/50 uppercase tracking-wider">5%</span>
            </div>
            <div className="bg-soft-black relative" style={{ width: "5%" }}>
              <span className="absolute bottom-2 left-1 font-body text-[10px] text-white/50 uppercase tracking-wider">5%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* EXTENDED PALETTE — real tints/shades, tall bands   */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 sm:px-12 lg:px-24 pt-24 pb-8">
        <div className="max-w-7xl mx-auto">
          <h3 className="font-heading text-2xl text-teal-dark mb-4">
            Extended Palette
          </h3>
          <p className="font-body text-soft-black-light mb-16 max-w-xl">
            True tints and shades, mixed with white and black, not opacity.
            Use lighter values for backgrounds and hover states, darker values
            for active states and depth.
          </p>
        </div>
      </div>

      {extendedPalette.map((row) => (
        <div
          key={row.name}
          className="h-32 sm:h-40 flex items-end px-6 sm:px-12 lg:px-24 pb-4"
          style={{
            background: `linear-gradient(90deg, ${row.stops})`,
          }}
        >
          <div className="max-w-7xl mx-auto w-full flex items-end justify-between">
            <span className="font-heading text-lg text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
              {row.name}
            </span>
            <div className="hidden sm:flex gap-8">
              {["Lightest", "Light", "Base", "Dark", "Darkest"].map((label) => (
                <span key={label} className="font-body text-[10px] text-white/80 uppercase tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* ────────────────────────────────────────────────── */}
      {/* SEMANTIC — tall immersive blocks                   */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 sm:px-12 lg:px-24 py-32">
        <div className="max-w-7xl mx-auto">
          <h3 className="font-heading text-2xl text-teal-dark mb-4">
            Semantic Colors
          </h3>
          <p className="font-body text-soft-black-light mb-16 max-w-xl">
            Reserved for UI feedback. Never use these for decorative purposes.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
            {semanticColors.map((c) => (
              <div key={c.name} className={`${c.bg} h-40 sm:h-52 flex flex-col justify-end p-6`}>
                <h4 className="font-heading text-2xl text-white mb-2">{c.name}</h4>
                <CopyHex value={c.hex} className="font-mono text-sm text-white/70 mb-2" />
                <p className="font-body text-xs text-white/60 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* GRADIENTS — full-bleed live bands                  */}
      {/* ────────────────────────────────────────────────── */}
      {gradients.map((g) => (
        <div
          key={g.name}
          className="min-h-[30vh] flex flex-col justify-end px-6 sm:px-12 lg:px-24 pb-12 pt-16"
          style={{ background: g.css }}
        >
          <div className="max-w-7xl mx-auto w-full">
            <h4 className="font-heading text-3xl sm:text-4xl text-white drop-shadow-sm mb-3">
              {g.name}
            </h4>
            <p className="font-body text-sm text-white/70 mb-2">{g.desc}</p>
            <p className="font-mono text-xs text-white/50">{g.css}</p>
          </div>
        </div>
      ))}

      {/* ────────────────────────────────────────────────── */}
      {/* ACCESSIBILITY TABLE                                */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-white px-6 sm:px-12 lg:px-24 py-32">
        <div className="max-w-7xl mx-auto">
          <h3 className="font-heading text-2xl text-teal-dark mb-4">
            Color Accessibility
          </h3>
          <p className="font-body text-soft-black-light mb-16 max-w-xl">
            WCAG 2.1 contrast ratios for key text/background pairings.
            All primary text must meet AA (4.5:1) at minimum.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-sage/30">
                  <th className="font-body text-[10px] uppercase tracking-widest text-soft-black-light py-4 pr-6">Foreground</th>
                  <th className="font-body text-[10px] uppercase tracking-widest text-soft-black-light py-4 pr-6">Background</th>
                  <th className="font-body text-[10px] uppercase tracking-widest text-soft-black-light py-4 pr-6">Preview</th>
                  <th className="font-body text-[10px] uppercase tracking-widest text-soft-black-light py-4 pr-6 text-center">Ratio</th>
                  <th className="font-body text-[10px] uppercase tracking-widest text-soft-black-light py-4 pr-6 text-center">AA</th>
                  <th className="font-body text-[10px] uppercase tracking-widest text-soft-black-light py-4 text-center">AAA</th>
                </tr>
              </thead>
              <tbody>
                {contrastTable.map((row, i) => (
                  <tr key={i} className="border-b border-sage/15">
                    <td className="font-body text-sm text-soft-black py-5 pr-6">{row.fg}</td>
                    <td className="font-body text-sm text-soft-black py-5 pr-6">{row.bg}</td>
                    <td className="py-5 pr-6">
                      <div
                        className="w-24 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: row.bgHex }}
                      >
                        <span className="font-heading text-base" style={{ color: row.fgHex }}>
                          Aa
                        </span>
                      </div>
                    </td>
                    <td className="font-mono text-sm font-medium text-soft-black py-5 pr-6 text-center">
                      {row.ratio}
                    </td>
                    <td className="py-5 pr-6 text-center">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-body font-semibold ${
                        row.aa ? "bg-success/10 text-success" : "bg-error/10 text-error"
                      }`}>
                        {row.aa ? "Pass" : "Fail"}
                      </span>
                    </td>
                    <td className="py-5 text-center">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-body font-semibold ${
                        row.aaa ? "bg-success/10 text-success" : "bg-error/10 text-error"
                      }`}>
                        {row.aaa ? "Pass" : "Fail"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
