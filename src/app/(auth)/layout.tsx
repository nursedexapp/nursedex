import Link from "next/link";
import { AuthBrandPanel } from "./auth-brand-panel";
import { AuthFade } from "./auth-fade";
import { AuthProgress } from "./auth-progress";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-warm-white lg:grid lg:grid-cols-2">
      {/* Brand panel - left side on desktop, top strip on mobile */}
      <div className="relative overflow-hidden bg-teal px-6 py-4 lg:flex lg:flex-col lg:justify-center lg:px-16 lg:py-0">
        {/* Decorative shapes - desktop only */}
        <div className="hidden lg:block pointer-events-none" aria-hidden="true">
          {/* Large circle ring - top right corner, clipped */}
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full border border-warm-white/10" />
          {/* Smaller circle ring - bottom left corner */}
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full border border-warm-white/[0.07]" />
          {/* Thin horizontal rule accent */}
          <div className="absolute bottom-[18%] right-0 h-px w-24 bg-warm-white/10" />
        </div>
        <div className="relative mx-auto max-w-md lg:max-w-sm">
          {/* Monogram + Wordmark */}
          <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-4">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-teal-dark flex items-center justify-center lg:h-14 lg:w-14 lg:rounded-xl">
              <span className="font-heading text-sm font-semibold text-warm-white tracking-[-0.06em] leading-none select-none lg:text-xl">
                ND
              </span>
            </div>
            <Link href="/" className="font-heading text-lg font-semibold text-warm-white tracking-[-0.02em] lg:text-3xl hover:text-warm-white/90 transition-colors">
              NurseDex
            </Link>
          </div>
          {/* Tagline */}
          <p className="font-heading text-xs italic text-sage-light/80 mt-0.5 lg:text-base lg:mt-1">
            Find care that feels like family.
          </p>

          {/* Contextual content - desktop only */}
          <AuthBrandPanel />

          {/* Vision statement - desktop only */}
          <div className="hidden lg:block mt-12 pt-6 border-t border-warm-white/10">
            <p className="text-sage-light/60 text-xs leading-relaxed italic">
              Built for the Long Island care community. Connecting families with trusted, verified nurses since 2026.
            </p>
          </div>
        </div>
      </div>

      {/* Form panel - right side */}
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-10 lg:min-h-0 lg:px-12 lg:py-16">
        <div className="w-full max-w-md">
          <AuthProgress />
          <AuthFade>{children}</AuthFade>
        </div>
      </div>
    </div>
  );
}
