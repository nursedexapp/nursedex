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
    {
      name: "Success",
      bg: "bg-success",
      hex: "#2D8B5F",
      desc: "Confirmations, positive actions, completed states",
    },
    {
      name: "Warning",
      bg: "bg-warning",
      hex: "#D4A843",
      desc: "Alerts, caution states, pending reviews",
    },
    {
      name: "Error",
      bg: "bg-error",
      hex: "#C0555A",
      desc: "Errors, destructive actions. Soft, not alarming",
    },
    {
      name: "Info",
      bg: "bg-info",
      hex: "#3A8B9B",
      desc: "Informational, neutral highlights, tips",
    },
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
    {
      name: "Primary",
      css: "linear-gradient(135deg, #2A7B6F, #A8C5B5)",
      desc: "Deep Teal → Soft Sage at 135°",
    },
    {
      name: "Subtle",
      css: "linear-gradient(90deg, #A8C5B5, #FBF9F7)",
      desc: "Soft Sage → Warm White, horizontal",
    },
    {
      name: "Depth",
      css: "linear-gradient(180deg, #2A7B6F, #1A4F47)",
      desc: "Deep Teal → Teal Dark, vertical",
    },
  ];

  const contrastTable = [
    {
      fg: "Soft Black",
      fgHex: "#2D3436",
      bg: "Warm White",
      bgHex: "#FBF9F7",
      ratio: "15.4:1",
      aa: true,
      aaa: true,
    },
    {
      fg: "White",
      fgHex: "#FFFFFF",
      bg: "Deep Teal",
      bgHex: "#2A7B6F",
      ratio: "4.8:1",
      aa: true,
      aaa: false,
    },
    {
      fg: "Deep Teal",
      fgHex: "#2A7B6F",
      bg: "Warm White",
      bgHex: "#FBF9F7",
      ratio: "5.2:1",
      aa: true,
      aaa: false,
    },
    {
      fg: "Soft Black",
      fgHex: "#2D3436",
      bg: "Soft Sage",
      bgHex: "#A8C5B5",
      ratio: "6.3:1",
      aa: true,
      aaa: false,
    },
    {
      fg: "White",
      fgHex: "#FFFFFF",
      bg: "Soft Black",
      bgHex: "#2D3436",
      ratio: "14.5:1",
      aa: true,
      aaa: true,
    },
  ];

  return (
    <section id="colors" className="overflow-hidden">
      {/* ────────────────────────────────────────────────── */}
      {/* PRIMARY, Deep Teal, the wall of teal IS the intro */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-teal flex min-h-[50vh] flex-col justify-end px-6 pt-24 pb-16 sm:px-12 lg:px-24">
        <div className="mx-auto w-full max-w-7xl">
          <p className="font-body mb-6 text-[10px] tracking-[0.4em] text-white/40 uppercase">
            Primary Color
          </p>
          <h3 className="font-heading mb-12 text-[clamp(3rem,8vw,7rem)] leading-[0.9] tracking-tight text-white">
            Deep Teal
          </h3>
          <div className="flex flex-wrap gap-x-16 gap-y-6">
            <div>
              <p className="font-body mb-1 text-[10px] tracking-widest text-white/40 uppercase">
                HEX
              </p>
              <CopyHex
                value="#2A7B6F"
                className="font-mono text-xl text-white"
              />
            </div>
            <div>
              <p className="font-body mb-1 text-[10px] tracking-widest text-white/40 uppercase">
                RGB
              </p>
              <CopyHex
                value="42, 123, 111"
                className="font-mono text-xl text-white"
              />
            </div>
            <div>
              <p className="font-body mb-1 text-[10px] tracking-widest text-white/40 uppercase">
                HSL
              </p>
              <CopyHex
                value="171°, 49%, 32%"
                className="font-mono text-xl text-white"
              />
            </div>
          </div>
          <p className="font-body mt-8 max-w-lg text-white/60">
            The foundation of NurseDex. Used for CTAs, headers, navigation, and
            any element that needs to convey trust and professionalism.
          </p>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* SECONDARY, Soft Sage, half-viewport band         */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-sage flex min-h-[50vh] flex-col justify-end px-6 pt-24 pb-16 sm:px-12 lg:px-24">
        <div className="mx-auto w-full max-w-7xl">
          <p className="font-body text-teal-dark/40 mb-6 text-[10px] tracking-[0.4em] uppercase">
            Secondary Color
          </p>
          <h3 className="font-heading text-teal-dark mb-12 text-[clamp(3rem,8vw,7rem)] leading-[0.9] tracking-tight">
            Soft Sage
          </h3>
          <div className="flex flex-wrap gap-x-16 gap-y-6">
            <div>
              <p className="font-body text-teal-dark/40 mb-1 text-[10px] tracking-widest uppercase">
                HEX
              </p>
              <CopyHex
                value="#A8C5B5"
                className="text-teal-dark font-mono text-xl"
              />
            </div>
            <div>
              <p className="font-body text-teal-dark/40 mb-1 text-[10px] tracking-widest uppercase">
                RGB
              </p>
              <CopyHex
                value="168, 197, 181"
                className="text-teal-dark font-mono text-xl"
              />
            </div>
            <div>
              <p className="font-body text-teal-dark/40 mb-1 text-[10px] tracking-widest uppercase">
                HSL
              </p>
              <CopyHex
                value="147°, 20%, 72%"
                className="text-teal-dark font-mono text-xl"
              />
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
      {/* SUPPORTING, tall edge-to-edge blocks              */}
      {/* ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row">
        {supportingColors.map((c) => (
          <div
            key={c.name}
            className={`${c.bg} flex h-48 flex-1 flex-col justify-end p-6 sm:h-80 sm:p-8`}
          >
            <h4 className={`font-heading text-2xl ${c.text} mb-3`}>{c.name}</h4>
            <CopyHex
              value={c.hex}
              className={`font-mono text-sm ${c.text} mb-1 opacity-60`}
            />
            <p className={`font-body text-xs ${c.text} opacity-50`}>
              {c.usage}
            </p>
          </div>
        ))}
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* USAGE RATIO                                        */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 py-24 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-7xl">
          <h3 className="font-heading text-teal-dark mb-10 text-2xl">
            Recommended Usage Ratio
          </h3>
          <div className="flex h-16 overflow-hidden rounded-xl">
            <div
              className="bg-warm-white border-sage/20 relative border"
              style={{ width: "60%" }}
            >
              <span className="font-body text-soft-black-light absolute bottom-2 left-4 text-[10px] tracking-wider uppercase">
                60% Warm White
              </span>
            </div>
            <div className="bg-teal relative" style={{ width: "20%" }}>
              <span className="font-body absolute bottom-2 left-3 text-[10px] tracking-wider text-white/80 uppercase">
                20% Teal
              </span>
            </div>
            <div className="bg-sage relative" style={{ width: "10%" }}>
              <span className="font-body text-teal-dark/70 absolute bottom-2 left-2 text-[10px] tracking-wider uppercase">
                10%
              </span>
            </div>
            <div className="bg-cream relative" style={{ width: "5%" }}>
              <span className="font-body text-soft-black/50 absolute bottom-2 left-1 text-[10px] tracking-wider uppercase">
                5%
              </span>
            </div>
            <div className="bg-soft-black relative" style={{ width: "5%" }}>
              <span className="font-body absolute bottom-2 left-1 text-[10px] tracking-wider text-white/50 uppercase">
                5%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* EXTENDED PALETTE, real tints/shades, tall bands   */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 pt-24 pb-8 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-7xl">
          <h3 className="font-heading text-teal-dark mb-4 text-2xl">
            Extended Palette
          </h3>
          <p className="font-body text-soft-black-light mb-16 max-w-xl">
            True tints and shades, mixed with white and black, not opacity. Use
            lighter values for backgrounds and hover states, darker values for
            active states and depth.
          </p>
        </div>
      </div>

      {extendedPalette.map((row) => (
        <div
          key={row.name}
          className="flex h-32 items-end px-6 pb-4 sm:h-40 sm:px-12 lg:px-24"
          style={{
            background: `linear-gradient(90deg, ${row.stops})`,
          }}
        >
          <div className="mx-auto flex w-full max-w-7xl items-end justify-between">
            <span className="font-heading text-lg text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
              {row.name}
            </span>
            <div className="hidden gap-8 sm:flex">
              {["Lightest", "Light", "Base", "Dark", "Darkest"].map((label) => (
                <span
                  key={label}
                  className="font-body text-[10px] tracking-wider text-white/80 uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* ────────────────────────────────────────────────── */}
      {/* SEMANTIC, tall immersive blocks                   */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-7xl">
          <h3 className="font-heading text-teal-dark mb-4 text-2xl">
            Semantic Colors
          </h3>
          <p className="font-body text-soft-black-light mb-16 max-w-xl">
            Reserved for UI feedback. Never use these for decorative purposes.
          </p>

          <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-4">
            {semanticColors.map((c) => (
              <div
                key={c.name}
                className={`${c.bg} flex h-40 flex-col justify-end p-6 sm:h-52`}
              >
                <h4 className="font-heading mb-2 text-2xl text-white">
                  {c.name}
                </h4>
                <CopyHex
                  value={c.hex}
                  className="mb-2 font-mono text-sm text-white/70"
                />
                <p className="font-body text-xs leading-relaxed text-white/60">
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* GRADIENTS, full-bleed live bands                  */}
      {/* ────────────────────────────────────────────────── */}
      {gradients.map((g) => (
        <div
          key={g.name}
          className="flex min-h-[30vh] flex-col justify-end px-6 pt-16 pb-12 sm:px-12 lg:px-24"
          style={{ background: g.css }}
        >
          <div className="mx-auto w-full max-w-7xl">
            <h4 className="font-heading mb-3 text-3xl text-white drop-shadow-sm sm:text-4xl">
              {g.name}
            </h4>
            <p className="font-body mb-2 text-sm text-white/70">{g.desc}</p>
            <p className="font-mono text-xs text-white/50">{g.css}</p>
          </div>
        </div>
      ))}

      {/* ────────────────────────────────────────────────── */}
      {/* ACCESSIBILITY TABLE                                */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-7xl">
          <h3 className="font-heading text-teal-dark mb-4 text-2xl">
            Color Accessibility
          </h3>
          <p className="font-body text-soft-black-light mb-16 max-w-xl">
            WCAG 2.1 contrast ratios for key text/background pairings. All
            primary text must meet AA (4.5:1) at minimum.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-sage/30 border-b-2">
                  <th className="font-body text-soft-black-light py-4 pr-6 text-[10px] tracking-widest uppercase">
                    Foreground
                  </th>
                  <th className="font-body text-soft-black-light py-4 pr-6 text-[10px] tracking-widest uppercase">
                    Background
                  </th>
                  <th className="font-body text-soft-black-light py-4 pr-6 text-[10px] tracking-widest uppercase">
                    Preview
                  </th>
                  <th className="font-body text-soft-black-light py-4 pr-6 text-center text-[10px] tracking-widest uppercase">
                    Ratio
                  </th>
                  <th className="font-body text-soft-black-light py-4 pr-6 text-center text-[10px] tracking-widest uppercase">
                    AA
                  </th>
                  <th className="font-body text-soft-black-light py-4 text-center text-[10px] tracking-widest uppercase">
                    AAA
                  </th>
                </tr>
              </thead>
              <tbody>
                {contrastTable.map((row, i) => (
                  <tr key={i} className="border-sage/15 border-b">
                    <td className="font-body text-soft-black py-5 pr-6 text-sm">
                      {row.fg}
                    </td>
                    <td className="font-body text-soft-black py-5 pr-6 text-sm">
                      {row.bg}
                    </td>
                    <td className="py-5 pr-6">
                      <div
                        className="flex h-10 w-24 items-center justify-center rounded-lg"
                        style={{ backgroundColor: row.bgHex }}
                      >
                        <span
                          className="font-heading text-base"
                          style={{ color: row.fgHex }}
                        >
                          Aa
                        </span>
                      </div>
                    </td>
                    <td className="text-soft-black py-5 pr-6 text-center font-mono text-sm font-medium">
                      {row.ratio}
                    </td>
                    <td className="py-5 pr-6 text-center">
                      <span
                        className={`font-body inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                          row.aa
                            ? "bg-success/10 text-success"
                            : "bg-error/10 text-error"
                        }`}
                      >
                        {row.aa ? "Pass" : "Fail"}
                      </span>
                    </td>
                    <td className="py-5 text-center">
                      <span
                        className={`font-body inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                          row.aaa
                            ? "bg-success/10 text-success"
                            : "bg-error/10 text-error"
                        }`}
                      >
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
