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
          <Link
            href="/nurses"
            onClick={() => setOpen(false)}
            className="font-body text-soft-black hover:bg-sage/10 rounded-lg px-4 py-3 text-sm transition-colors"
          >
            Find a Nurse
          </Link>

          {isLoggedIn ? (
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="bg-teal font-body hover:bg-teal-dark mt-2 rounded-lg px-4 py-3 text-center text-sm font-medium text-white transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="font-body text-soft-black hover:bg-sage/10 rounded-lg px-4 py-3 text-sm transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="bg-teal font-body hover:bg-teal-dark mt-2 rounded-lg px-4 py-3 text-center text-sm font-medium text-white transition-colors"
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
