import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/helpers";
import { primaryNavItems } from "./nav-items";
import { MobileNav } from "./MobileNav";

export async function Header() {
  const user = await getCurrentUser();
  const isLoggedIn = !!user;
  const navItems = primaryNavItems(user?.role ?? null);

  return (
    <header className="border-sage-light/50 bg-warm-white border-b">
      <div className="max-w-site mx-auto flex items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link href="/" className="font-heading text-teal text-xl">
          NurseDex
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-body text-soft-black-light hover:text-soft-black text-sm transition-colors"
            >
              {item.label}
            </Link>
          ))}

          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="bg-teal font-body hover:bg-teal-dark rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="font-body text-soft-black-light hover:text-soft-black text-sm transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="bg-teal font-body hover:bg-teal-dark rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                Sign up
              </Link>
            </div>
          )}
        </nav>

        {/* Mobile nav */}
        <MobileNav isLoggedIn={isLoggedIn} navItems={navItems} />
      </div>
    </header>
  );
}
