import { WaitlistForm } from "./WaitlistForm";

type HeroSectionProps = {
  role: "nurse" | "family";
  onRoleChange: (role: "nurse" | "family") => void;
  referralSource?: string;
  onSignup?: () => void;
  waitlistCount?: number | null;
  hasSignedUp?: boolean;
};

const copy = {
  family: {
    headline: "Find care that feels like family.",
    subheadline:
      "NurseDex connects New York families with verified, trusted caregivers. Browse real profiles, read honest reviews, and hire with confidence.",
  },
  nurse: {
    headline: "Grow your care practice across New York.",
    subheadline:
      "NurseDex puts you in front of families actively looking for care. Connect directly and keep 100% of what you earn, no agency fees or commissions.",
  },
};

export function HeroSection({
  role,
  onRoleChange,
  referralSource,
  onSignup,
  waitlistCount,
  hasSignedUp,
}: HeroSectionProps) {
  return (
    <section className="bg-teal-dark relative flex flex-col overflow-hidden px-6 text-center">
      {/* Decorative outline rings, no fills, clipped by section edges */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="border-warm-white/10 absolute -top-24 -right-24 h-[400px] w-[400px] rounded-full border" />
        <div className="border-warm-white/[0.07] absolute bottom-1/4 -left-32 h-[300px] w-[300px] rounded-full border" />
      </div>

      {/* Top bar */}
      <div className="relative mx-auto flex w-full max-w-4xl items-center justify-between py-6">
        <p className="font-heading text-warm-white text-2xl">NurseDex</p>
        <span className="font-body text-warm-white flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs">
          <span className="bg-sage inline-block h-1.5 w-1.5 rounded-full" />
          New York
        </span>
      </div>

      <div className="relative mx-auto flex max-w-2xl flex-col items-center pt-10 pb-8">
        {/* Role toggle */}
        <div
          className="mb-8 inline-flex rounded-full border border-white/10 bg-white/5 p-1"
          role="radiogroup"
          aria-label="I am a"
        >
          <button
            type="button"
            role="radio"
            aria-checked={role === "family"}
            onClick={() => onRoleChange("family")}
            className={`font-body focus-visible:ring-offset-teal-dark cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:outline-none ${
              role === "family"
                ? "bg-teal text-warm-white shadow-sm"
                : "text-sage-light hover:text-warm-white"
            }`}
          >
            I need care
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={role === "nurse"}
            onClick={() => onRoleChange("nurse")}
            className={`font-body focus-visible:ring-offset-teal-dark cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:outline-none ${
              role === "nurse"
                ? "bg-teal text-warm-white shadow-sm"
                : "text-sage-light hover:text-warm-white"
            }`}
          >
            I&apos;m a caregiver
          </button>
        </div>

        <h1
          key={`headline-${role}`}
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 font-heading text-warm-white text-4xl leading-tight motion-safe:duration-300 sm:text-5xl md:text-6xl"
        >
          {copy[role].headline}
        </h1>

        <p
          key={`sub-${role}`}
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 font-body text-warm-white mx-auto mt-6 max-w-xl text-lg motion-safe:duration-300"
        >
          {copy[role].subheadline}
        </p>

        {/* Waitlist form */}
        <div id="waitlist" className="mt-10">
          <WaitlistForm
            role={role}
            referralSource={referralSource}
            variant="hero"
            onSignup={onSignup}
            hasSignedUp={hasSignedUp}
          />
          <div className="mt-3 space-y-1">
            {role === "nurse" ? (
              <p className="font-body text-cream-light text-sm">
                First 100 caregivers get priority placement. No spam, ever.
              </p>
            ) : waitlistCount ? (
              <p className="font-body text-warm-white text-sm">
                Join {waitlistCount}+ people already on the waitlist.
              </p>
            ) : (
              <p className="font-body text-warm-white text-sm">
                We&apos;ll only email you when we launch. No spam, ever.
              </p>
            )}
            {role === "nurse" && waitlistCount && (
              <p className="font-body text-warm-white text-sm">
                Join {waitlistCount}+ people already on the waitlist.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
