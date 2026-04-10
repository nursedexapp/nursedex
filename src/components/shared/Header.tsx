import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/helpers";
import { MobileNav } from "./MobileNav";

export async function Header() {
  const user = await getCurrentUser();
  const isLoggedIn = !!user;

  return (
    <header className="border-b border-sage-light/50 bg-warm-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link href="/" className="font-heading text-xl text-teal">
          NurseDex
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/search"
            className="font-body text-sm text-soft-black-light transition-colors hover:text-soft-black"
          >
            Find a Nurse
          </Link>

          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-teal px-4 py-2 font-body text-sm font-medium text-white transition-colors hover:bg-teal-dark"
            >
              Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="font-body text-sm text-soft-black-light transition-colors hover:text-soft-black"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-teal px-4 py-2 font-body text-sm font-medium text-white transition-colors hover:bg-teal-dark"
              >
                Sign up
              </Link>
            </div>
          )}
        </nav>

        {/* Mobile nav */}
        <MobileNav isLoggedIn={isLoggedIn} />
      </div>
    </header>
  );
}
