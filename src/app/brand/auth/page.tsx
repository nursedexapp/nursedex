import type { Metadata } from "next";
import {
  Check,
  Eye,
  EyeOff,
  Heart,
  Loader2,
  Mail,
  Stethoscope,
} from "lucide-react";
import {
  LoginSandboxSection,
  SignupSandboxSection,
  RoleSelectSandboxSection,
  ForgotPasswordSandboxSection,
  ResetPasswordSandboxSection,
} from "./sandbox";

export const metadata: Metadata = {
  title: "Auth Design Rationale | NurseDex Brand",
  description:
    "Design decisions and reasoning behind the NurseDex authentication experience.",
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const layoutDecisions = [
  {
    decision: "50/50 split panel",
    reasoning:
      "Authentication is a moment of trust. A full-screen form feels transactional. The split panel dedicates half the screen to brand reinforcement, reminding users who we are and why they came here. The left panel sells; the right panel converts.",
  },
  {
    decision: "Teal brand panel, warm-white form panel",
    reasoning:
      "The teal panel creates an emotional anchor (care, trust, professionalism) while the warm-white panel provides a clean, distraction-free surface for the form. The contrast between the two panels creates a clear visual hierarchy: brand context on the left, action on the right.",
  },
  {
    decision: "Mobile collapses to strip + full form",
    reasoning:
      "On mobile, screen real estate is too precious for a 50/50 split. The brand panel compresses to a branded strip (logo, wordmark, tagline) that maintains identity without stealing space from the form. The tagline stays visible because even on mobile, warmth matters.",
  },
  {
    decision: "Form panel is vertically centered",
    reasoning:
      "A centered form feels grounded and balanced. Top-aligned forms feel like they are floating or unfinished. Centering also adapts gracefully as form height changes between login (shorter) and signup (taller).",
  },
  {
    decision: "Decorative circle rings on brand panel",
    reasoning:
      "Two unfilled circle rings (warm-white at low opacity) peek from opposite corners, clipped by overflow. They add depth without competing with content. Using outlines rather than fills prevents the muddy blob effect. A thin horizontal rule near the bottom adds structure.",
  },
  {
    decision: "AuthFade page transitions",
    reasoning:
      "A 0.3s ease-out fadeIn animation plays when navigating between auth pages (login to signup, signup to confirm, etc.). The subtle upward slide (translateY -4px to 0) gives a sense of forward momentum without being distracting. Keyed by pathname so it re-triggers on route change.",
  },
];

const brandPanelDecisions = [
  {
    decision: "Contextual content per route",
    reasoning:
      "A static brand panel wastes an opportunity. The AuthBrandPanel component reads the current pathname and swaps in messaging tailored to each step: signup gets value propositions, login gets community reinforcement, forgot-password gets reassurance. The user never sees the same generic pitch twice.",
  },
  {
    decision: "Trust signals with checkmarks",
    reasoning:
      'Checkmarks are universally understood as affirmation. Each signal pairs a bold claim ("Free to join") with a supporting detail ("Create your profile at no cost"). This two-line pattern builds credibility without requiring the user to read a paragraph. The cream-colored check icon ties back to the brand palette.',
  },
  {
    decision: "Different signals for login vs. signup",
    reasoning:
      "New users need conversion signals: free, you control it, verified. Returning users need belonging signals: local focus, privacy, free for families. The same component, different content, different job.",
  },
  {
    decision: "Vision statement as footer",
    reasoning:
      '"Built for the Long Island care community" anchored at the bottom of the brand panel, separated by a subtle border, grounds the entire experience in place and purpose. It is quiet, italic, and never competes with the primary content above it.',
  },
];

const loginDecisions = [
  {
    decision: "Google OAuth first, email second",
    reasoning:
      'OAuth reduces friction. One tap, no password to remember. Placing it above the form with a clear separator ("or continue with email") gives users the fastest path first while keeping email as a reliable fallback. The Google button uses the official multicolor logo for instant recognition.',
  },
  {
    decision: '"Welcome back" + community subtext',
    reasoning:
      '"Welcome back" is warm and personal. The subtext ("Your Long Island care community is waiting") reinforces belonging rather than stating the obvious ("Sign in to your account"). Every piece of copy on the login page should make the user feel like they are returning to something meaningful, not completing a transaction.',
  },
  {
    decision: "Password visibility toggle",
    reasoning:
      'A masked password field with no toggle creates anxiety ("did I type it right?"). The eye icon toggle reduces failed attempts, especially on mobile where typos are common. The 44px hit area meets accessibility touch target requirements.',
  },
  {
    decision: "Inline error with resend option",
    reasoning:
      'When a user sees "please confirm your email," they need an immediate way to fix it. Embedding the resend button directly inside the error message eliminates the need to navigate away. The user sees the problem and the solution in the same visual block.',
  },
  {
    decision: "Forgot password at field level",
    reasoning:
      'Placing the "Forgot password?" link inline with the password label (right-aligned) puts recovery exactly where the user is looking when they realize they have forgotten. It does not compete with the primary action (Sign in) because it is secondary in both size and position.',
  },
];

const signupDecisions = [
  {
    decision: '"Join NurseDex" headline',
    reasoning:
      '"Join" implies community membership, not just account creation. It frames the action as becoming part of something, not filling out a form. The subtext "Create your free account" includes the word "free" to reduce hesitation.',
  },
  {
    decision: "Password strength indicator (X/8 characters)",
    reasoning:
      'Instead of a generic "too weak" message, we show a live character count (e.g. "5/8 characters") as the user types. This is more helpful than a strength meter because the only requirement is 8 characters. The indicator disappears once the minimum is met, reducing visual noise.',
  },
  {
    decision: "Inline field validation on change",
    reasoning:
      "Validation errors clear as soon as the user starts correcting the field (onChange). This avoids the frustrating pattern where errors persist until the next submit. Each field has its own error state (fieldErrors.email, fieldErrors.password) so they are independent.",
  },
  {
    decision: "Implicit terms acceptance",
    reasoning:
      'No checkbox. The terms text reads "By clicking Join NurseDex, you agree to our Terms and Privacy Policy." A hidden input (name="tos" value="on") records acceptance. This reduces form friction while maintaining legal compliance. The Terms and Privacy links are underlined and teal-colored for discoverability.',
  },
  {
    decision: "No name field at signup",
    reasoning:
      "We only collect email and password at signup. Name, credentials, and profile details come later during onboarding. Every additional field at signup is a drop-off point. Get them in the door first, enrich later.",
  },
];

const forgotPasswordDecisions = [
  {
    decision: "Redirect to /sent instead of inline success",
    reasoning:
      'After submitting the forgot-password form, the user is redirected to a dedicated /forgot-password/sent page. This creates a clear state transition ("I submitted" to "I need to check email") rather than showing a success message on the same form. The new page has a centered layout with a Mail icon, reinforcing the next action.',
  },
  {
    decision: "Security-conscious messaging",
    reasoning:
      'The sent page says "If an account exists with that email, we sent a password reset link." The "if" is deliberate. It prevents email enumeration attacks where bad actors probe the system to discover which emails have accounts. The same message appears whether the email exists or not.',
  },
  {
    decision: "Single-field simplicity",
    reasoning:
      "The forgot-password form has exactly one field (email) and one button (Send reset link). No CAPTCHA, no additional questions, no recovery codes. When someone is locked out, complexity equals abandonment.",
  },
  {
    decision: '"Back to sign in" as escape hatch',
    reasoning:
      'Both the form page and the sent page include a "Back to sign in" link. Users who remember their password mid-flow, or who realize they used the wrong email, need a graceful exit. The link is positioned as subtext (not a competing button) to maintain clear CTA hierarchy.',
  },
];

const resetPasswordDecisions = [
  {
    decision: "Dual password fields with independent toggles",
    reasoning:
      "Password and Confirm Password each have their own visibility toggle. Users often want to reveal one but not the other (e.g., reveal the confirm field to verify it matches what they typed blind in the first). Independent toggles respect that workflow.",
  },
  {
    decision: "Client-side match validation",
    reasoning:
      "The form validates that passwords match before submitting to the server. This catches the most common error (typo in confirm field) instantly, without a round-trip. The error appears directly below the confirm field with aria-describedby for screen readers.",
  },
  {
    decision: '"Set new password" heading, not "Reset password"',
    reasoning:
      'By this point, the user has already "reset" (clicked the email link). They are now setting a new password. The copy matches their current action, not the overall flow name.',
  },
];

const roleSelectDecisions = [
  {
    decision: "Cards, not a dropdown",
    reasoning:
      "With only two options (Nurse or Family), a dropdown hides the choices behind a click. Large, tappable cards let users see both options at once, compare them, and choose with confidence. The card format also gives space for a supporting description that a dropdown cannot.",
  },
  {
    decision: "Stethoscope and Heart icons",
    reasoning:
      "The Stethoscope icon for nurses and the Heart icon for families are immediately recognizable and emotionally resonant. They reinforce the identity of each role without requiring the user to read the description. Both are rendered from the Lucide icon set at a consistent 24px size.",
  },
  {
    decision: "radiogroup accessibility pattern",
    reasoning:
      'The cards use role="radiogroup" with role="radio" on each button and aria-checked tracking the selected state. This means screen readers announce "I am a nurse, radio button, not checked" and "I am a nurse, radio button, checked" correctly. It is semantically a single-select choice, not two independent buttons.',
  },
  {
    decision: "No skip option",
    reasoning:
      "Role selection is not optional. The entire product experience (nurse dashboard vs. family search) depends on this choice. Allowing users to skip would create an undefined state where we cannot personalize anything. The Continue button is disabled until a selection is made.",
  },
  {
    decision: "Selected state: border + ring",
    reasoning:
      'The selected card gets a teal border and a teal/20 ring. The ring provides a visual "glow" that makes the selection feel definitive, not just a border color change. The unselected card has a subtle hover state (border-sage) so both feel interactive.',
  },
];

const confirmDecisions = [
  {
    decision: "Centered layout with Mail icon",
    reasoning:
      "The confirmation page breaks from the left-aligned form layout and centers everything. This signals a state change: you are no longer filling out a form, you are waiting for something. The large Mail icon in a teal/10 circle reinforces the next action (check your email) visually.",
  },
  {
    decision: "Show the submitted email address",
    reasoning:
      'The email address is displayed in bold ("We sent a confirmation link to you@email.com"). This serves two purposes: it confirms we have the right address, and it helps the user remember which inbox to check (many people have multiple email accounts).',
  },
  {
    decision: "60-second resend cooldown",
    reasoning:
      'After clicking Resend, the button enters a 60-second countdown ("Resend available in 45s"). This prevents accidental spam (clicking resend repeatedly), gives the email time to arrive, and sets expectations. The countdown uses setInterval with cleanup to avoid memory leaks.',
  },
  {
    decision: "Empty state for missing email param",
    reasoning:
      'If someone navigates to /signup/confirm directly (no email query param), they see "No email provided" with a link to go to signup. This handles bookmark/direct-URL edge cases gracefully instead of showing a broken page.',
  },
];

const loadingDecisions = [
  {
    decision: "Suspense boundaries on search-param pages",
    reasoning:
      "Login and confirm pages use useSearchParams(), which requires a Suspense boundary in Next.js. The fallback renders a skeleton that matches the layout shape (heading + subtext + button) using animate-pulse divs in sage/20. This prevents layout shift when the real content loads.",
  },
  {
    decision: "Button loading states",
    reasoning:
      'Every submit button shows a Loader2 spinner with contextual text ("Signing in...", "Joining...", "Sending...", "Setting up...") while async. The button is disabled during loading to prevent double-submission. The spinner is 16px (h-4 w-4), matching the text size.',
  },
  {
    decision: "Visibility change resets Google button",
    reasoning:
      "The Google OAuth button listens for visibilitychange events. When the user returns to the tab (after the Google popup closes), loading resets to false. This handles the case where OAuth is cancelled or fails silently, ensuring the button is not stuck in a loading state.",
  },
];

const accessibilityDecisions = [
  {
    label: "Focus management on errors",
    detail:
      "When a form submission fails, focus moves to the error message via useRef. Screen reader users hear the error immediately instead of being stranded at the submit button.",
  },
  {
    label: "aria-invalid on fields",
    detail:
      "Signup and reset-password inputs set aria-invalid when validation fails, connecting to aria-describedby for the error message. Assistive technology can announce exactly which field has an issue.",
  },
  {
    label: 'role="alert" on error blocks',
    detail:
      'Error messages use role="alert" so screen readers announce them automatically without the user needing to navigate to them. Success messages use role="status" for a less urgent, polite announcement.',
  },
  {
    label: "Password toggle aria-label",
    detail:
      'The eye icon button dynamically labels itself "Show password" or "Hide password" based on state. Without this, screen readers would announce nothing or just "button."',
  },
  {
    label: "Semantic form with labels",
    detail:
      "Every input has a corresponding Label with htmlFor. No placeholder-only patterns. autocomplete attributes (email, current-password, new-password) enable password managers and browser autofill.",
  },
  {
    label: "Role select radiogroup",
    detail:
      'The nurse/family cards use role="radiogroup" with aria-checked. Screen readers announce the selection state correctly. Focus-visible rings (ring-2 ring-teal ring-offset-2) provide keyboard navigation feedback.',
  },
];

const mobileDecisions = [
  {
    label: "min-h-[80vh] form panel",
    detail:
      "On short mobile screens, the form panel guarantees enough vertical space for the form content to breathe, preventing the cramped feeling that comes from the brand strip eating into limited viewport height.",
  },
  {
    label: "Brand strip shows tagline",
    detail:
      "Even compressed to a strip, the mobile brand panel includes the tagline at text-xs. This small addition transforms a generic branded header into something that communicates warmth and purpose.",
  },
  {
    label: "h-11 touch targets",
    detail:
      "All inputs and buttons are 44px (h-11) tall, meeting WCAG touch target requirements. The password toggle is a 36px hit area within the input, also above minimum when including padding.",
  },
  {
    label: "Signup progress dots",
    detail:
      "The three-step progress indicator (Create account, Confirm email, Choose role) uses dots that work at any screen width. Step labels hide below sm breakpoint, leaving just the dots for a compact but informative progress bar.",
  },
  {
    label: "Role select cards stack vertically",
    detail:
      "The nurse/family cards use grid-cols-1 on mobile and sm:grid-cols-2 on wider screens. Stacked cards are easier to compare on a narrow viewport and each card gets full-width tap area.",
  },
];

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

function GoogleLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function MockInput({
  label,
  placeholder,
  rightIcon,
  secondaryLabel,
}: {
  label: string;
  placeholder: string;
  rightIcon?: React.ReactNode;
  secondaryLabel?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-soft-black text-xs font-medium">{label}</label>
        {secondaryLabel}
      </div>
      <div className="flex h-10 items-center justify-between rounded-lg border border-[#C8D2D0] px-3">
        <span className="text-soft-black-light text-sm">{placeholder}</span>
        {rightIcon}
      </div>
    </div>
  );
}

function BrowserChrome({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="bg-soft-black-light/30 hidden items-center gap-2 rounded-t-xl px-4 py-3 sm:flex">
        <div className="flex gap-1.5">
          <div className="bg-error/60 h-3 w-3 rounded-full" />
          <div className="bg-warning/60 h-3 w-3 rounded-full" />
          <div className="bg-success/60 h-3 w-3 rounded-full" />
        </div>
        <div className="bg-soft-black/40 ml-4 flex-1 rounded-md px-4 py-1.5">
          <span className="font-body text-warm-white/40 text-[11px]">
            {url}
          </span>
        </div>
      </div>
      <div className="bg-warm-white overflow-hidden rounded-xl shadow-2xl sm:rounded-t-none sm:rounded-b-xl">
        {children}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-body text-sage-dark mb-4 text-xs tracking-[0.4em] uppercase">
      {children}
    </p>
  );
}

function SectionLabelLight({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-body text-sage/40 mb-4 text-xs tracking-[0.4em] uppercase">
      {children}
    </p>
  );
}

function DecisionList({
  items,
}: {
  items: { decision: string; reasoning: string }[];
}) {
  return (
    <div className="divide-sage/20 divide-y">
      {items.map((item) => (
        <div
          key={item.decision}
          className="grid grid-cols-1 items-baseline gap-4 py-10 first:pt-0 last:pb-0 lg:grid-cols-[1fr_2fr] lg:gap-16"
        >
          <h3 className="font-heading text-teal-dark text-lg">
            {item.decision}
          </h3>
          <p className="font-body text-soft-black-light leading-relaxed">
            {item.reasoning}
          </p>
        </div>
      ))}
    </div>
  );
}

function DecisionListLight({
  items,
}: {
  items: { decision: string; reasoning: string }[];
}) {
  return (
    <div className="space-y-12">
      {items.map((item) => (
        <div key={item.decision}>
          <h3 className="font-heading text-warm-white mb-3 text-xl">
            {item.decision}
          </h3>
          <p className="font-body text-sage-light max-w-2xl text-sm leading-relaxed">
            {item.reasoning}
          </p>
        </div>
      ))}
    </div>
  );
}

function MockAnnotations({
  items,
}: {
  items: { label: string; rule: string }[];
}) {
  return (
    <div
      className={`grid sm:grid-cols-2 lg:grid-cols-${items.length > 3 ? 4 : items.length} mt-10 gap-8`}
    >
      {items.map((item) => (
        <div key={item.label}>
          <p className="font-body text-sage/50 mb-2 text-[10px] tracking-widest uppercase">
            {item.label}
          </p>
          <p className="font-body text-warm-white/70 text-sm">{item.rule}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AuthDesignRationale() {
  return (
    <div className="bg-warm-white min-h-screen">
      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  COVER                                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-teal-dark relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-0 h-full w-full bg-[radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.15)_0%,transparent_50%)]" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-6">
          <p className="font-body text-sage text-xs tracking-[0.35em] uppercase">
            Design Rationale
          </p>
          <h1 className="font-heading text-warm-white text-5xl leading-tight sm:text-6xl lg:text-7xl">
            Authentication
          </h1>
          <p className="font-body text-sage max-w-md text-base sm:text-lg">
            The reasoning behind every decision in the NurseDex login, signup,
            and password recovery experience.
          </p>
          <div className="bg-sage/50 mt-2 h-0.5 w-10 rounded-full" />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  PRINCIPLE                                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-cream px-6 py-24 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-4xl">
          <blockquote className="font-heading text-soft-black text-4xl leading-[1.08] italic sm:text-5xl lg:text-6xl">
            Authentication is the
            <br />
            first act of trust.
          </blockquote>
          <p className="font-body text-soft-black-light mt-8 max-w-lg text-base leading-relaxed">
            For a healthcare platform, the login screen is not just a gate. It
            is the first moment a family or nurse decides whether NurseDex feels
            safe. Every design choice here serves one goal: lower the walls
            without lowering the guard.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  1. LAYOUT                                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Layout</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            The split-panel structure
          </h2>
          <DecisionList items={layoutDecisions} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  2. LOGIN MOCKUP                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-soft-black px-4 py-16 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <p className="font-body text-sage/40 mb-10 text-center text-xs tracking-[0.4em] uppercase">
            Login / Desktop
          </p>
          <BrowserChrome url="nursedex.com/login">
            <div className="grid min-h-[520px] lg:grid-cols-2">
              {/* Brand panel */}
              <div className="bg-teal relative flex flex-col justify-center overflow-hidden px-10 py-16">
                <div className="border-warm-white/10 absolute -top-20 -right-20 h-72 w-72 rounded-full border" />
                <div className="border-warm-white/[0.07] absolute -bottom-16 -left-16 h-48 w-48 rounded-full border" />
                <div className="relative max-w-xs">
                  <div className="bg-teal-dark mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
                    <span className="font-heading text-warm-white text-lg leading-none font-semibold tracking-[-0.06em]">
                      ND
                    </span>
                  </div>
                  <p className="font-heading text-warm-white text-2xl font-semibold tracking-[-0.02em]">
                    NurseDex
                  </p>
                  <p className="font-heading text-sage-light/80 mt-1 text-sm italic">
                    Find care that feels like family.
                  </p>
                  <p className="text-sage-light mt-8 text-xs leading-relaxed">
                    The nurse directory built for Long Island. Connect with
                    families and nurses in your community.
                  </p>
                  <div className="mt-6 space-y-3">
                    {[
                      {
                        text: "Long Island focused",
                        detail: "Nassau, Suffolk, and Queens",
                      },
                      {
                        text: "Your data stays private",
                        detail: "Never shared without consent",
                      },
                      {
                        text: "Always free for families",
                        detail: "Search and connect at no cost",
                      },
                    ].map((s) => (
                      <div key={s.text} className="flex items-start gap-2.5">
                        <Check
                          className="text-cream mt-0.5 h-3.5 w-3.5 shrink-0"
                          strokeWidth={2.5}
                        />
                        <div>
                          <span className="text-warm-white block text-xs font-medium">
                            {s.text}
                          </span>
                          <span className="text-sage-light/70 text-[10px]">
                            {s.detail}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-warm-white/10 mt-10 border-t pt-4">
                    <p className="text-sage-light/60 text-[10px] leading-relaxed italic">
                      Built for the Long Island care community. Connecting
                      families with trusted, verified nurses since 2026.
                    </p>
                  </div>
                </div>
              </div>
              {/* Form panel */}
              <div className="flex items-center justify-center px-10 py-16">
                <div className="w-full max-w-sm">
                  <h2 className="font-heading mb-1 text-xl">Welcome back</h2>
                  <p className="text-soft-black-light mb-6 text-xs">
                    Your Long Island care community is waiting.{" "}
                    <span className="text-teal font-medium underline">
                      New here? Create an account
                    </span>
                  </p>
                  <div className="border-sage-dark/50 mb-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg border">
                    <GoogleLogo className="h-4 w-4" />
                    <span className="font-body text-sm font-semibold">
                      Continue with Google
                    </span>
                  </div>
                  <div className="relative my-5">
                    <div className="bg-sage/20 h-px" />
                    <span className="bg-warm-white text-soft-black-light absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 text-[10px]">
                      or continue with email
                    </span>
                  </div>
                  <div className="space-y-3.5">
                    <MockInput label="Email" placeholder="your@email.com" />
                    <MockInput
                      label="Password"
                      placeholder="........"
                      rightIcon={
                        <Eye className="text-soft-black-light h-3.5 w-3.5" />
                      }
                      secondaryLabel={
                        <span className="text-teal text-sm font-medium underline">
                          Forgot password?
                        </span>
                      }
                    />
                    <div className="bg-teal mt-1 flex h-10 items-center justify-center rounded-lg">
                      <span className="text-warm-white text-sm font-semibold">
                        Sign in
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </BrowserChrome>
          <MockAnnotations
            items={[
              { label: "Brand panel", rule: "Contextual messaging per route" },
              {
                label: "Trust signals",
                rule: "Checkmark + claim + detail pattern",
              },
              {
                label: "Form panel",
                rule: "Centered, max-w-md, semantic labels",
              },
              {
                label: "CTA hierarchy",
                rule: "Google first, email second, forgot last",
              },
            ]}
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  3. BRAND PANEL DECISIONS                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-teal-dark px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabelLight>Brand Panel</SectionLabelLight>
          <h2 className="font-heading text-warm-white mb-16 text-3xl sm:text-4xl">
            Selling while they sign in
          </h2>
          <DecisionListLight items={brandPanelDecisions} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  4. CONTENT STRATEGY                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Content Strategy</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            Every route tells a different story
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                route: "/signup",
                heading: "Join NurseDex",
                tone: "Aspirational",
                message:
                  "Value propositions for new users. Free, controlled, verified.",
              },
              {
                route: "/login",
                heading: "Welcome back",
                tone: "Warm",
                message:
                  "Community belonging. Local focus, privacy, free for families.",
              },
              {
                route: "/forgot-password",
                heading: "Reset password",
                tone: "Reassuring",
                message:
                  '"No worries." Calm, confident, helpful. Reduce anxiety.',
              },
              {
                route: "/signup/confirm",
                heading: "Check your inbox",
                tone: "Encouraging",
                message: '"You are almost there." Momentum toward completion.',
              },
              {
                route: "/reset-password",
                heading: "New password",
                tone: "Supportive",
                message: '"Almost there." Quick resolution, back to normal.',
              },
              {
                route: "/role-select",
                heading: "Choose your role",
                tone: "Guiding",
                message: '"One quick step." Framing effort as minimal.',
              },
            ].map((item) => (
              <div
                key={item.route}
                className="border-sage/20 overflow-hidden rounded-2xl border"
              >
                <div className="bg-teal px-5 py-3">
                  <span className="text-warm-white/70 font-mono text-xs">
                    {item.route}
                  </span>
                </div>
                <div className="space-y-3 px-5 py-5">
                  <h4 className="font-heading text-soft-black text-base">
                    {item.heading}
                  </h4>
                  <span className="bg-cream text-teal-dark font-body inline-block rounded-full px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase">
                    {item.tone}
                  </span>
                  <p className="font-body text-soft-black-light text-xs leading-relaxed">
                    {item.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  5. LOGIN FORM DECISIONS                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-sage/10 px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Login</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            Reducing friction, building confidence
          </h2>
          <DecisionList items={loginDecisions} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  6. SIGNUP MOCKUP + DECISIONS                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-soft-black px-4 py-16 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <p className="font-body text-sage/40 mb-10 text-center text-xs tracking-[0.4em] uppercase">
            Signup / Form panel
          </p>
          <BrowserChrome url="nursedex.com/signup">
            <div className="flex items-center justify-center px-10 py-12">
              <div className="w-full max-w-sm">
                {/* Progress */}
                <div className="mb-6 flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="bg-teal h-2 w-2 rounded-full" />
                    <span className="text-soft-black text-[10px] font-medium">
                      Create account
                    </span>
                  </div>
                  <div className="bg-sage/30 h-px w-6" />
                  <div className="flex items-center gap-1.5">
                    <div className="bg-sage/40 h-2 w-2 rounded-full" />
                    <span className="text-soft-black-light text-[10px]">
                      Confirm email
                    </span>
                  </div>
                  <div className="bg-sage/30 h-px w-6" />
                  <div className="flex items-center gap-1.5">
                    <div className="bg-sage/40 h-2 w-2 rounded-full" />
                    <span className="text-soft-black-light text-[10px]">
                      Choose role
                    </span>
                  </div>
                </div>
                <h2 className="font-heading mb-1 text-xl">Join NurseDex</h2>
                <p className="text-soft-black-light mb-6 text-xs">
                  Create your free account.{" "}
                  <span className="text-teal font-medium underline">
                    Sign in instead
                  </span>
                </p>
                <div className="border-sage-dark/50 mb-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg border">
                  <GoogleLogo className="h-4 w-4" />
                  <span className="font-body text-sm font-semibold">
                    Continue with Google
                  </span>
                </div>
                <div className="relative my-5">
                  <div className="bg-sage/20 h-px" />
                  <span className="bg-warm-white text-soft-black-light absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 text-[10px]">
                    or continue with email
                  </span>
                </div>
                <div className="space-y-3.5">
                  <MockInput label="Email" placeholder="your@email.com" />
                  <div>
                    <MockInput
                      label="Password"
                      placeholder="At least 8 characters"
                      rightIcon={
                        <Eye className="text-soft-black-light h-3.5 w-3.5" />
                      }
                    />
                    <p className="text-soft-black-light mt-1 text-[10px]">
                      5/8 characters
                    </p>
                  </div>
                  <p className="text-soft-black-light text-center text-[10px]">
                    By clicking Join NurseDex, you agree to our{" "}
                    <span className="text-teal underline">Terms</span> and{" "}
                    <span className="text-teal underline">Privacy Policy</span>.
                  </p>
                  <div className="bg-teal mt-1 flex h-10 items-center justify-center rounded-lg">
                    <span className="text-warm-white text-sm font-semibold">
                      Join NurseDex
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </BrowserChrome>
          <MockAnnotations
            items={[
              {
                label: "Progress bar",
                rule: "3 dots + labels, dots-only on mobile",
              },
              { label: "Password", rule: "Live X/8 counter, clears at 8" },
              { label: "Terms", rule: "Implicit acceptance, no checkbox" },
            ]}
          />
        </div>
      </section>

      <section className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Signup</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            Getting them in the door
          </h2>
          <DecisionList items={signupDecisions} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  7. CONFIRMATION PAGE                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-soft-black px-4 py-16 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <p className="font-body text-sage/40 mb-10 text-center text-xs tracking-[0.4em] uppercase">
            Email confirmation
          </p>
          <BrowserChrome url="nursedex.com/signup/confirm?email=jane@example.com">
            <div className="px-10 py-16 text-center">
              <div className="bg-teal/10 mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full">
                <Mail className="text-teal h-7 w-7" />
              </div>
              <h2 className="font-heading mb-2 text-xl">Check your email</h2>
              <p className="text-soft-black-light mx-auto max-w-xs text-xs leading-relaxed">
                We sent a confirmation link to{" "}
                <strong className="text-soft-black">jane@example.com</strong>.
                Click the link to activate your account.
              </p>
              <div className="mt-5">
                <div className="border-sage-dark/50 text-soft-black-light inline-flex h-8 items-center rounded-lg border px-4 text-xs font-medium">
                  Resend available in 45s
                </div>
              </div>
            </div>
          </BrowserChrome>
          <MockAnnotations
            items={[
              {
                label: "Mail icon",
                rule: "Centered, teal/10 circle, signals state change",
              },
              {
                label: "Email shown",
                rule: "Bold address confirms correct inbox",
              },
              { label: "Cooldown", rule: "60s countdown prevents spam" },
            ]}
          />
        </div>
      </section>

      <section className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Confirmation</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            The waiting room
          </h2>
          <DecisionList items={confirmDecisions} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  8. ROLE SELECT                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-soft-black px-4 py-16 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <p className="font-body text-sage/40 mb-10 text-center text-xs tracking-[0.4em] uppercase">
            Role selection
          </p>
          <BrowserChrome url="nursedex.com/role-select">
            <div className="px-10 py-12">
              <h2 className="font-heading mb-1 text-xl">
                How will you use NurseDex?
              </h2>
              <p className="text-soft-black-light mb-6 text-xs">
                This helps us personalize your experience.
              </p>
              <div className="mb-5 grid grid-cols-2 gap-4">
                <div className="border-teal ring-teal/20 rounded-xl border-2 p-5 ring-2">
                  <Stethoscope className="text-teal mb-2 h-5 w-5" />
                  <p className="font-heading text-soft-black mb-1 text-sm font-semibold">
                    I am a nurse
                  </p>
                  <p className="text-soft-black-light text-[10px] leading-relaxed">
                    Create a profile, get found by families, and grow your
                    practice.
                  </p>
                </div>
                <div className="border-sage/20 rounded-xl border p-5">
                  <Heart className="text-teal mb-2 h-5 w-5" />
                  <p className="font-heading text-soft-black mb-1 text-sm font-semibold">
                    I need care
                  </p>
                  <p className="text-soft-black-light text-[10px] leading-relaxed">
                    Find qualified nurses in your area and connect with them
                    directly.
                  </p>
                </div>
              </div>
              <div className="bg-teal flex h-10 items-center justify-center rounded-lg">
                <span className="text-warm-white text-sm font-semibold">
                  Continue
                </span>
              </div>
            </div>
          </BrowserChrome>
          <MockAnnotations
            items={[
              {
                label: "Cards",
                rule: "Large, tappable, side-by-side on desktop",
              },
              { label: "Selected state", rule: "Teal border + ring glow" },
              { label: "Icons", rule: "Stethoscope (nurse), Heart (family)" },
            ]}
          />
        </div>
      </section>

      <section className="bg-teal-dark px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabelLight>Role Select</SectionLabelLight>
          <h2 className="font-heading text-warm-white mb-16 text-3xl sm:text-4xl">
            The most important choice
          </h2>
          <DecisionListLight items={roleSelectDecisions} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  9. FORGOT PASSWORD FLOW                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-soft-black px-4 py-16 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <p className="font-body text-sage/40 mb-10 text-center text-xs tracking-[0.4em] uppercase">
            Password recovery flow
          </p>
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Forgot password form */}
            <div>
              <p className="font-body text-sage/50 mb-4 text-[10px] tracking-widest uppercase">
                Step 1: Request
              </p>
              <BrowserChrome url="nursedex.com/forgot-password">
                <div className="px-8 py-12">
                  <h2 className="font-heading mb-1 text-xl">
                    Reset your password
                  </h2>
                  <p className="text-soft-black-light mb-6 text-xs">
                    Enter your email and we will send you a reset link.{" "}
                    <span className="text-teal font-medium underline">
                      Back to sign in
                    </span>
                  </p>
                  <div className="space-y-3.5">
                    <MockInput label="Email" placeholder="your@email.com" />
                    <div className="bg-teal flex h-10 items-center justify-center rounded-lg">
                      <span className="text-warm-white text-sm font-semibold">
                        Send reset link
                      </span>
                    </div>
                  </div>
                </div>
              </BrowserChrome>
            </div>
            {/* Sent confirmation */}
            <div>
              <p className="font-body text-sage/50 mb-4 text-[10px] tracking-widest uppercase">
                Step 2: Confirmation
              </p>
              <BrowserChrome url="nursedex.com/forgot-password/sent">
                <div className="px-8 py-12 text-center">
                  <div className="bg-teal/10 mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full">
                    <Mail className="text-teal h-7 w-7" />
                  </div>
                  <h2 className="font-heading mb-2 text-xl">
                    Check your email
                  </h2>
                  <p className="text-soft-black-light mx-auto max-w-xs text-xs leading-relaxed">
                    If an account exists with that email, we sent a password
                    reset link.
                  </p>
                  <p className="text-teal mt-4 text-sm font-medium underline">
                    Back to sign in
                  </p>
                </div>
              </BrowserChrome>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Forgot Password</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            Recovering with confidence
          </h2>
          <DecisionList items={forgotPasswordDecisions} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  10. RESET PASSWORD                                           */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-soft-black px-4 py-16 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <p className="font-body text-sage/40 mb-10 text-center text-xs tracking-[0.4em] uppercase">
            Reset password
          </p>
          <BrowserChrome url="nursedex.com/reset-password">
            <div className="px-10 py-12">
              <h2 className="font-heading mb-1 text-xl">Set new password</h2>
              <p className="text-soft-black-light mb-6 text-xs">
                Choose a new password for your account.
              </p>
              <div className="space-y-3.5">
                <MockInput
                  label="New password"
                  placeholder="At least 8 characters"
                  rightIcon={
                    <Eye className="text-soft-black-light h-3.5 w-3.5" />
                  }
                />
                <div>
                  <MockInput
                    label="Confirm password"
                    placeholder="........"
                    rightIcon={
                      <EyeOff className="text-soft-black-light h-3.5 w-3.5" />
                    }
                  />
                  <p className="text-error mt-1 text-[10px]">
                    Passwords do not match.
                  </p>
                </div>
                <div className="bg-teal mt-1 flex h-10 items-center justify-center rounded-lg">
                  <span className="text-warm-white text-sm font-semibold">
                    Update password
                  </span>
                </div>
              </div>
            </div>
          </BrowserChrome>
          <MockAnnotations
            items={[
              {
                label: "Independent toggles",
                rule: "Each field has its own eye icon",
              },
              { label: "Match validation", rule: "Client-side before submit" },
              {
                label: "Heading",
                rule: '"Set new" not "Reset" to match the action',
              },
            ]}
          />
        </div>
      </section>

      <section className="bg-sage/10 px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Reset Password</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            The final step back in
          </h2>
          <DecisionList items={resetPasswordDecisions} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  11. ERROR & LOADING PATTERNS                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-soft-black px-4 py-16 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <p className="font-body text-sage/40 mb-10 text-center text-xs tracking-[0.4em] uppercase">
            Error handling patterns
          </p>
          <div className="bg-warm-white mx-auto max-w-sm space-y-4 overflow-hidden rounded-xl p-8 shadow-2xl">
            {/* Error with resend */}
            <div className="bg-error/10 text-error rounded-lg px-4 py-3 text-sm">
              Please confirm your email address before signing in.
              <button className="text-teal mt-1 block text-sm font-medium underline">
                Resend confirmation email
              </button>
            </div>
            {/* Field error */}
            <div>
              <div className="border-error flex h-10 items-center rounded-lg border-2 px-3">
                <span className="text-soft-black text-sm">bad@</span>
              </div>
              <p className="text-error mt-1 text-xs">
                Please enter a valid email address.
              </p>
            </div>
            {/* Success */}
            <div className="bg-success/10 text-success rounded-lg px-4 py-3 text-sm">
              Password reset successfully. Sign in with your new password.
            </div>
          </div>
          <MockAnnotations
            items={[
              {
                label: "Block errors",
                rule: "Inline, near the problem, with recovery action",
              },
              {
                label: "Field errors",
                rule: "Red border + message below, aria-describedby",
              },
              { label: "Success", rule: 'Same shape, green, role="status"' },
            ]}
          />
        </div>
      </section>

      <section className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Loading &amp; Skeleton States</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            Never leave them guessing
          </h2>
          <DecisionList items={loadingDecisions} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  12. ACCESSIBILITY                                            */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-teal-dark px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabelLight>Accessibility</SectionLabelLight>
          <h2 className="font-heading text-warm-white mb-16 text-3xl sm:text-4xl">
            Every user deserves a seamless experience
          </h2>
          <div className="grid gap-8 sm:grid-cols-2">
            {accessibilityDecisions.map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <span className="bg-warm-white/10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                  <svg
                    className="text-cream h-3 w-3"
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
                <div>
                  <h4 className="font-body text-warm-white mb-1 text-sm font-medium">
                    {item.label}
                  </h4>
                  <p className="font-body text-sage-light text-xs leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  13. MOBILE ADAPTATION                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Mobile</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            Adapting, not shrinking
          </h2>
          <div className="grid gap-10 sm:grid-cols-2">
            {mobileDecisions.map((item) => (
              <div key={item.label}>
                <h4 className="font-heading text-teal-dark mb-2 text-lg">
                  {item.label}
                </h4>
                <p className="font-body text-soft-black-light text-sm leading-relaxed">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  14. COMPONENT TOKENS                                         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-sage/10 px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>Component Tokens</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            Auth-specific components
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {/* Google button */}
            <div>
              <p className="font-body text-sage-dark mb-4 text-[10px] tracking-widest uppercase">
                OAuth button
              </p>
              <div className="border-sage-dark/50 bg-warm-white flex h-11 items-center justify-center gap-2 rounded-lg border shadow-sm">
                <GoogleLogo />
                <span className="font-body text-base font-semibold">
                  Continue with Google
                </span>
              </div>
              <p className="font-body text-soft-black-light mt-3 text-xs">
                Official multicolor logo. border-sage-dark/50 for visibility on
                warm-white.
              </p>
            </div>
            {/* Primary button states */}
            <div>
              <p className="font-body text-sage-dark mb-4 text-[10px] tracking-widest uppercase">
                Primary action
              </p>
              <div className="bg-teal flex h-11 items-center justify-center rounded-lg">
                <span className="text-warm-white text-base font-semibold">
                  Sign in
                </span>
              </div>
              <div className="bg-teal/50 mt-3 flex h-11 items-center justify-center gap-2 rounded-lg">
                <Loader2 className="text-warm-white h-4 w-4 animate-spin" />
                <span className="text-warm-white text-base font-semibold">
                  Signing in...
                </span>
              </div>
              <p className="font-body text-soft-black-light mt-3 text-xs">
                Full-width, h-11, teal bg. Loading disables + shows spinner.
              </p>
            </div>
            {/* Separator */}
            <div>
              <p className="font-body text-sage-dark mb-4 text-[10px] tracking-widest uppercase">
                Separator
              </p>
              <div className="relative py-6">
                <div className="bg-sage/20 h-px" />
                <span className="bg-warm-white text-soft-black-light absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 text-xs">
                  or continue with email
                </span>
              </div>
              <p className="font-body text-soft-black-light mt-3 text-xs">
                Text centered over rule. bg-background covers the line.
              </p>
            </div>
          </div>

          {/* Second row */}
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {/* Role cards */}
            <div>
              <p className="font-body text-sage-dark mb-4 text-[10px] tracking-widest uppercase">
                Role card (selected)
              </p>
              <div className="border-teal ring-teal/20 rounded-xl border-2 p-4 ring-2">
                <Stethoscope className="text-teal mb-1.5 h-5 w-5" />
                <p className="font-heading text-soft-black text-sm font-semibold">
                  I am a nurse
                </p>
              </div>
              <p className="font-body text-soft-black-light mt-3 text-xs">
                border-teal + ring-teal/20 glow on selection.
              </p>
            </div>
            {/* Confirmation icon */}
            <div>
              <p className="font-body text-sage-dark mb-4 text-[10px] tracking-widest uppercase">
                Confirmation icon
              </p>
              <div className="flex justify-center">
                <div className="bg-teal/10 flex h-14 w-14 items-center justify-center rounded-full">
                  <Mail className="text-teal h-7 w-7" />
                </div>
              </div>
              <p className="font-body text-soft-black-light mt-3 text-xs">
                Centered icon in teal/10 circle. Signals state transition.
              </p>
            </div>
            {/* Progress indicator */}
            <div>
              <p className="font-body text-sage-dark mb-4 text-[10px] tracking-widest uppercase">
                Progress indicator
              </p>
              <div className="flex items-center gap-2 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="bg-teal h-2 w-2 rounded-full" />
                  <span className="text-soft-black text-[10px] font-medium">
                    Step 1
                  </span>
                </div>
                <div className="bg-sage/30 h-px w-6" />
                <div className="flex items-center gap-1.5">
                  <div className="bg-sage/40 h-2 w-2 rounded-full" />
                  <span className="text-soft-black-light text-[10px]">
                    Step 2
                  </span>
                </div>
                <div className="bg-sage/30 h-px w-6" />
                <div className="flex items-center gap-1.5">
                  <div className="bg-sage/40 h-2 w-2 rounded-full" />
                  <span className="text-soft-black-light text-[10px]">
                    Step 3
                  </span>
                </div>
              </div>
              <p className="font-body text-soft-black-light mt-3 text-xs">
                Dot + label. Active dot is teal, inactive sage/40.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  15. USER JOURNEY                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-warm-white px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto max-w-5xl">
          <SectionLabel>User Journey</SectionLabel>
          <h2 className="font-heading text-teal-dark mb-16 text-3xl sm:text-4xl">
            Three steps to onboarded
          </h2>
          <div className="grid gap-0 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Create account",
                detail:
                  "Google OAuth or email + password. Minimal fields. No name collection at this stage to reduce friction. Terms acceptance is implicit (visible link, hidden checkbox).",
              },
              {
                step: "02",
                title: "Confirm email",
                detail:
                  "Redirect to /signup/confirm with the email pre-displayed. Clear instruction to check inbox. Resend link available with 60-second cooldown. No dead ends.",
              },
              {
                step: "03",
                title: "Choose role",
                detail:
                  "Family or Nurse. This single choice tailors the entire product experience. Presented as large, tappable cards with icons. No skip option, this is essential data.",
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className={`px-8 py-10 ${i < 2 ? "border-sage/20 border-b md:border-r md:border-b-0" : ""}`}
              >
                <span className="font-heading text-sage/30 text-4xl">
                  {item.step}
                </span>
                <h4 className="font-heading text-teal-dark mt-3 mb-3 text-xl">
                  {item.title}
                </h4>
                <p className="font-body text-soft-black-light text-sm leading-relaxed">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  16. INTERACTIVE SANDBOX                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-soft-black px-4 py-16 sm:px-8 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <p className="font-body text-sage/40 mb-4 text-center text-xs tracking-[0.4em] uppercase">
            Interactive Sandbox
          </p>
          <h2 className="font-heading text-warm-white mb-4 text-center text-3xl sm:text-4xl">
            Try it yourself
          </h2>
          <p className="font-body text-sage mx-auto mb-16 max-w-lg text-center text-sm">
            Fully interactive versions of every auth page. Type, click, toggle,
            and submit. Nothing is connected to a real backend. All behavior is
            simulated locally.
          </p>

          <div className="space-y-16">
            <LoginSandboxSection />
            <SignupSandboxSection />
            <RoleSelectSandboxSection />
            <ForgotPasswordSandboxSection />
            <ResetPasswordSandboxSection />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  BACK COVER                                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="bg-teal-dark px-6 py-32 sm:px-12 lg:px-24">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 text-center">
          <div className="bg-teal border-sage/30 flex h-20 w-20 items-center justify-center rounded-2xl border-2">
            <span className="font-heading text-warm-white text-3xl leading-none font-semibold tracking-[-0.06em] select-none">
              ND
            </span>
          </div>
          <h3 className="font-heading text-warm-white text-3xl sm:text-4xl">
            Authentication Design
          </h3>
          <p className="font-body text-sage max-w-md text-lg">
            Every screen is a chance to build trust. The auth flow is where that
            trust begins.
          </p>
          <div className="bg-sage/30 h-0.5 w-8 rounded-full" />
          <p className="font-body text-sage/60 text-sm italic">
            NurseDex Design System &middot; Auth Module
          </p>
          <p className="font-body text-sage/40 text-xs tracking-widest uppercase">
            v1.0 &middot; March 2026
          </p>
        </div>
      </section>
    </div>
  );
}
