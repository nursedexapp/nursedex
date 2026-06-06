import Link from "next/link";
import { SocialLinks } from "@/components/shared/SocialLinks";

// Slim footer for in-app surfaces (dashboard, auth). Lighter than the marketing
// Footer: just legal links, copyright, and social. Pass className for per-surface
// spacing (e.g. clearing the dashboard's fixed mobile bottom nav).
export function AppFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear();

  return (
    <footer
      className={`border-sage-light/50 bg-warm-white border-t px-6 py-6 ${className ?? ""}`}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="font-body text-soft-black-light flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs">
          <span>&copy; {year} NurseDex LLC</span>
          <Link
            href="/privacy"
            className="hover:text-soft-black underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hover:text-soft-black underline underline-offset-2"
          >
            Terms of Service
          </Link>
        </div>
        <SocialLinks />
      </div>
    </footer>
  );
}
