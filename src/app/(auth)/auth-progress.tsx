"use client";

import { usePathname } from "next/navigation";

const steps = [
  { path: "/signup", label: "Create account" },
  { path: "/signup/confirm", label: "Confirm email" },
  { path: "/role-select", label: "Choose role" },
];

export function AuthProgress() {
  const pathname = usePathname();
  const currentIndex = steps.findIndex((s) => s.path === pathname);

  // Only show on signup journey pages
  if (currentIndex === -1) return null;

  const isCentered = pathname === "/signup/confirm";

  return (
    <div className={`mb-8 flex items-center gap-2 ${isCentered ? "justify-center" : ""}`}>
      {steps.map((step, i) => (
        <div key={step.path} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className={`h-2 w-2 rounded-full transition-colors ${
                i <= currentIndex ? "bg-teal" : "bg-sage/40"
              }`}
            />
            <span
              className={`text-xs hidden sm:inline ${
                i === currentIndex
                  ? "text-soft-black font-medium"
                  : i < currentIndex
                    ? "text-teal"
                    : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-px w-8 sm:w-6 transition-colors ${
                i < currentIndex ? "bg-teal" : "bg-sage/30"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
