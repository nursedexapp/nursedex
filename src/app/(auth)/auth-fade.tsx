"use client";

import { usePathname } from "next/navigation";

export function AuthFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} style={{ animation: "fadeIn 0.3s ease-out" }}>
      {children}
    </div>
  );
}
