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

interface MobileNavProps {
  isLoggedIn: boolean;
}

export function MobileNav({ isLoggedIn }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="cursor-pointer rounded-md p-2 text-soft-black transition-colors hover:bg-sage/10 md:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-72 bg-warm-white">
        <SheetTitle className="font-heading text-xl text-teal">
          NurseDex
        </SheetTitle>

        <nav className="flex flex-col gap-1 px-4">
          <Link
            href="/search"
            onClick={() => setOpen(false)}
            className="rounded-lg px-4 py-3 font-body text-sm text-soft-black transition-colors hover:bg-sage/10"
          >
            Find a Nurse
          </Link>

          {isLoggedIn ? (
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-lg bg-teal px-4 py-3 text-center font-body text-sm font-medium text-white transition-colors hover:bg-teal-dark"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-3 font-body text-sm text-soft-black transition-colors hover:bg-sage/10"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-lg bg-teal px-4 py-3 text-center font-body text-sm font-medium text-white transition-colors hover:bg-teal-dark"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
