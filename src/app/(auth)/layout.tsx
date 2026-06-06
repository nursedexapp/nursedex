import Link from "next/link";
import { AuthBrandPanel } from "./auth-brand-panel";
import { AuthFade } from "./auth-fade";
import { AuthProgress } from "./auth-progress";
import { AppFooter } from "@/components/shared/AppFooter";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-warm-white flex min-h-screen flex-col">
      <div className="flex-1 lg:grid lg:grid-cols-2">
        {/* Brand panel - left side on desktop, top strip on mobile */}
        <div className="bg-teal relative overflow-hidden px-6 py-4 lg:flex lg:flex-col lg:justify-center lg:px-16 lg:py-0">
          {/* Decorative shapes - desktop only */}
          <div
            className="pointer-events-none hidden lg:block"
            aria-hidden="true"
          >
            {/* Large circle ring - top right corner, clipped */}
            <div className="border-warm-white/10 absolute -top-20 -right-20 h-72 w-72 rounded-full border" />
            {/* Smaller circle ring - bottom left corner */}
            <div className="border-warm-white/[0.07] absolute -bottom-16 -left-16 h-48 w-48 rounded-full border" />
            {/* Thin horizontal rule accent */}
            <div className="bg-warm-white/10 absolute right-0 bottom-[18%] h-px w-24" />
          </div>
          <div className="relative mx-auto max-w-md lg:max-w-sm">
            {/* Monogram + Wordmark */}
            <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-4">
              <div className="bg-teal-dark flex h-8 w-8 shrink-0 items-center justify-center rounded-lg lg:h-14 lg:w-14 lg:rounded-xl">
                <span className="font-heading text-warm-white text-sm leading-none font-semibold tracking-[-0.06em] select-none lg:text-xl">
                  ND
                </span>
              </div>
              <Link
                href="/"
                className="font-heading text-warm-white hover:text-warm-white/90 text-lg font-semibold tracking-[-0.02em] transition-colors lg:text-3xl"
              >
                NurseDex
              </Link>
            </div>
            {/* Tagline */}
            <p className="font-heading text-warm-white mt-0.5 text-xs italic lg:mt-1 lg:text-base">
              Find care that feels like family.
            </p>

            {/* Contextual content - desktop only */}
            <AuthBrandPanel />

            {/* Vision statement - desktop only */}
            <div className="border-warm-white/10 mt-12 hidden border-t pt-6 lg:block">
              <p className="text-warm-white text-xs leading-relaxed italic">
                Built for the New York care community. Connecting families with
                trusted, verified nurses since 2026.
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

      <AppFooter />
    </div>
  );
}
