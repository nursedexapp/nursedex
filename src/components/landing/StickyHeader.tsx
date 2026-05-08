"use client";

import { useEffect, useState } from "react";
import { WaitlistForm } from "./WaitlistForm";

type StickyHeaderProps = {
  hasSignedUp: boolean;
  role: "nurse" | "family";
  referralSource?: string;
  onSignup?: () => void;
};

export function StickyHeader({
  hasSignedUp,
  role,
  referralSource,
  onSignup,
}: StickyHeaderProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      // Show after scrolling past roughly the hero viewport
      setVisible(window.scrollY > window.innerHeight * 0.6);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`border-sage-light/50 bg-warm-white/90 fixed inset-x-0 top-0 z-50 overflow-x-clip border-b backdrop-blur-sm transition-all duration-300 ${
        visible && !hasSignedUp
          ? "translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-full opacity-0"
      }`}
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
        <p className="font-heading text-teal text-xl">NurseDex</p>
        <WaitlistForm
          role={role}
          referralSource={referralSource}
          variant="header"
          onSignup={onSignup}
          hasSignedUp={hasSignedUp}
        />
      </div>
    </header>
  );
}
