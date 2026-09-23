"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SignOutButton } from "@/components/auth/SignOutButton";
import type { NavItem } from "./nav-items";

interface MobileNavProps {
  isLoggedIn: boolean;
  /** Built once by the Header from the viewer's role, so the two navs agree. */
  navItems: NavItem[];
}

// Shared by the next/link items and the plain links below, which must look
// the same while navigating differently.
const LINK_CLASS =
  "font-body text-soft-black hover:bg-sage/10 rounded-lg px-4 py-3 text-sm transition-colors";
const PRIMARY_LINK_CLASS =
  "bg-teal font-body hover:bg-teal-dark mt-2 rounded-lg px-4 py-3 text-center text-sm font-medium text-white transition-colors";

export function MobileNav({ isLoggedIn, navItems }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="text-soft-black hover:bg-sage/10 cursor-pointer rounded-md p-2 transition-colors md:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="right" className="bg-warm-white w-72">
        <SheetTitle className="font-heading text-teal text-xl">
          NurseDex
        </SheetTitle>

        <nav className="flex flex-col gap-1 px-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={LINK_CLASS}
            >
              {item.label}
            </Link>
          ))}

          {/*
            These three leave the public section, so they load the page with a
            plain link rather than next/link. A client side navigation out of
            the section, taken from this sheet while it is open or closing,
            trips a React bug: the shell re-suspends in a loop until React
            throws #482 ("An unknown Component is an async Client Component")
            and the person lands on "We hit a snag" (NURSEDEX-SITE-13, still
            present in Next 16.3.6). The sheet goes with the page, so nothing
            needs to close it.
          */}
          {isLoggedIn ? (
            <>
              <a href="/dashboard" className={PRIMARY_LINK_CLASS}>
                Dashboard
              </a>
              <SignOutButton
                className="mt-1"
                onNavigate={() => setOpen(false)}
              />
            </>
          ) : (
            <>
              <a href="/login" className={LINK_CLASS}>
                Log in
              </a>
              <a href="/signup" className={PRIMARY_LINK_CLASS}>
                Sign up
              </a>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
