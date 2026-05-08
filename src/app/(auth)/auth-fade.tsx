"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Wraps each auth route's content in a brief fade so transitioning
 * between /signup, /login, /forgot-password feels less jarring.
 *
 * The first mount renders fully opaque so the form is interactive
 * and contrast-accurate from the first paint. Only subsequent
 * pathname changes within the auth flow trigger the animation.
 */
export function AuthFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const initialPathname = useRef(pathname);
  const [hasNavigated, setHasNavigated] = useState(false);

  useEffect(() => {
    if (pathname !== initialPathname.current) {
      setHasNavigated(true);
    }
  }, [pathname]);

  return (
    <div
      key={pathname}
      style={
        hasNavigated ? { animation: "fadeIn 0.3s ease-out" } : undefined
      }
    >
      {children}
    </div>
  );
}
