"use client";

import { useState } from "react";
import { StickyHeader } from "./StickyHeader";
import { HeroSection } from "./HeroSection";
import { WhySection } from "./WhySection";
import { HowItWorksSection } from "./HowItWorksSection";
import { FAQSection } from "./FAQSection";
import { FinalCTASection } from "./FinalCTASection";
import { FooterSection } from "./FooterSection";

type LandingPageProps = {
  referralSource?: string;
  // Server-rendered so the count is present on first paint instead of after a
  // client-side fetch.
  waitlistCount?: number | null;
};

export function LandingPage({
  referralSource,
  waitlistCount = null,
}: LandingPageProps) {
  const [role, setRole] = useState<"nurse" | "family">("nurse");
  const [hasSignedUp, setHasSignedUp] = useState(false);

  return (
    <main className="bg-warm-white min-h-screen">
      <StickyHeader
        hasSignedUp={hasSignedUp}
        role={role}
        referralSource={referralSource}
        onSignup={() => setHasSignedUp(true)}
      />
      <HeroSection
        role={role}
        onRoleChange={setRole}
        referralSource={referralSource}
        onSignup={() => setHasSignedUp(true)}
        waitlistCount={waitlistCount}
        hasSignedUp={hasSignedUp}
      />
      <WhySection role={role} />
      <HowItWorksSection role={role} />
      <FAQSection role={role} />
      <FinalCTASection
        role={role}
        referralSource={referralSource}
        onSignup={() => setHasSignedUp(true)}
        hasSignedUp={hasSignedUp}
      />
      <FooterSection />
    </main>
  );
}
