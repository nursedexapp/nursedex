"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";

const panels: Record<string, { description: string; signals?: { text: string; detail: string }[] }> = {
  "/signup": {
    description: "The nurse directory built for Long Island. Get found by families searching for exactly your skills and availability.",
    signals: [
      { text: "Free to join", detail: "Create your profile at no cost" },
      { text: "You control your profile", detail: "Set your rates, availability, and service area" },
      { text: "Verified by our team", detail: "A verified badge builds trust with families" },
    ],
  },
  "/signup/confirm": {
    description: "You are almost there. Check your inbox for a confirmation link to activate your account.",
  },
  "/login": {
    description: "The nurse directory built for Long Island. Connect with families and nurses in your community.",
    signals: [
      { text: "Long Island focused", detail: "Nurses and families in Nassau, Suffolk, and Queens" },
      { text: "Your data stays private", detail: "We never share your information without consent" },
      { text: "Always free for families", detail: "Search and connect at no cost" },
    ],
  },
  "/forgot-password": {
    description: "No worries. We will send you a link to reset your password and get you back in.",
  },
  "/forgot-password/sent": {
    description: "A reset link is on its way. Check your inbox and follow the link to set a new password.",
  },
  "/reset-password": {
    description: "Almost there. Set a new password and you will be back to your account in no time.",
  },
  "/role-select": {
    description: "One quick step so we can tailor NurseDex to how you will use it.",
  },
};

const fallback = panels["/login"];

export function AuthBrandPanel() {
  const pathname = usePathname();
  const panel = panels[pathname] ?? fallback;

  return (
    <div className="mt-12 space-y-6 hidden lg:block">
      <p className="text-sage-light text-sm leading-relaxed">
        {panel.description}
      </p>
      {panel.signals && (
        <div className="space-y-4">
          {panel.signals.map((item) => (
            <div key={item.text} className="flex items-start gap-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-cream" strokeWidth={2.5} />
              <div className="flex flex-col">
                <span className="text-warm-white text-sm font-medium">
                  {item.text}
                </span>
                <span className="text-sage-light/70 text-xs">
                  {item.detail}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
