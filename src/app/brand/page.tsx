"use client";

import { useEffect, useRef, useState } from "react";

import CoverSection from "@/components/brand/CoverSection";
import FoundationSection from "@/components/brand/FoundationSection";
import LogoSection from "@/components/brand/LogoSection";
import ColorSection from "@/components/brand/ColorSection";
import TypographySection from "@/components/brand/TypographySection";
import VisualSection from "@/components/brand/VisualSection";
import VoiceSection from "@/components/brand/VoiceSection";
import ApplicationSection from "@/components/brand/ApplicationSection";

const NAV_ITEMS = [
  { id: "foundation", label: "Foundation" },
  { id: "logo", label: "Logo" },
  { id: "colors", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "visual", label: "Visual" },
  { id: "voice", label: "Voice" },
  { id: "application", label: "Application" },
] as const;

export default function BrandGuidelinesPage() {
  const [activeSection, setActiveSection] = useState<string>("foundation");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => {
            const aTop = a.boundingClientRect.top;
            const bTop = b.boundingClientRect.top;
            return Math.abs(aTop) - Math.abs(bTop);
          });

        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: "-10% 0px -60% 0px",
        threshold: 0,
      }
    );

    sectionRefs.current.forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  const registerSection = (id: string) => (el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
      observerRef.current?.observe(el);
    }
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="relative min-h-screen bg-warm-white">
      {/* Dot navigation -- right edge, hidden on mobile */}
      <nav
        className="fixed right-6 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col gap-4"
        aria-label="Brand guidelines navigation"
      >
        {NAV_ITEMS.map(({ id, label }) => {
          const isActive = activeSection === id;
          return (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="group relative flex items-center justify-end"
              aria-label={label}
            >
              {/* Tooltip -- appears to the left of the dot on hover */}
              <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-md bg-soft-black px-2.5 py-1 font-body text-xs text-warm-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {label}
              </span>
              {/* Dot */}
              <span
                className={`block rounded-full transition-all duration-200 ${
                  isActive
                    ? "h-3 w-3 bg-teal"
                    : "h-2 w-2 bg-sage/40 group-hover:bg-sage"
                }`}
              />
            </button>
          );
        })}
      </nav>

      {/* Mobile horizontal nav -- plain text links */}
      <div className="sticky top-0 z-30 overflow-x-auto border-b border-sage-light/30 bg-warm-white/95 backdrop-blur-sm lg:hidden animate-[fadeIn_0.6s_ease-out]">
        <div className="flex gap-4 px-4 py-3">
          {NAV_ITEMS.map(({ id, label }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`shrink-0 font-body text-xs transition-all ${
                  isActive
                    ? "border-b-2 border-teal text-soft-black font-medium"
                    : "text-soft-black-light hover:text-soft-black"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content area */}
      <main className="lg:ml-0">
        <CoverSection />

        <section id="foundation" ref={registerSection("foundation")}>
          <FoundationSection />
        </section>

        <section id="logo" ref={registerSection("logo")}>
          <LogoSection />
        </section>

        <section id="colors" ref={registerSection("colors")}>
          <ColorSection />
        </section>

        <section id="typography" ref={registerSection("typography")}>
          <TypographySection />
        </section>

        <section id="visual" ref={registerSection("visual")}>
          <VisualSection />
        </section>

        <section id="voice" ref={registerSection("voice")}>
          <VoiceSection />
        </section>

        <section id="application" ref={registerSection("application")}>
          <ApplicationSection />
        </section>
      </main>
    </div>
  );
}
