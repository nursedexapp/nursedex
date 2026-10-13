"use client";

import { useEffect, type RefObject } from "react";

/**
 * Publishes an element's rendered height as a CSS variable on <html>, kept
 * current as it resizes, and removed when the element goes or `active` turns
 * false. For fixed bars that other layout has to clear: the page padding under
 * the cookie bar, and the cookie bar's offset above the dashboard's mobile nav.
 * Measured rather than written down because both wrap to a second line on a
 * narrow phone, so no constant is right for every width.
 *
 * Without ResizeObserver the height is published once, at mount. Readers give
 * the variable a fallback (0px) for when it is absent.
 */
export function useHeightVariable(
  ref: RefObject<HTMLElement | null>,
  name: `--${string}`,
  active = true,
): void {
  useEffect(() => {
    const element = ref.current;
    const root = document.documentElement;
    if (!active || !element) {
      root.style.removeProperty(name);
      return;
    }
    const publish = () =>
      root.style.setProperty(name, `${element.offsetHeight}px`);
    publish();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(publish);
    observer?.observe(element, { box: "border-box" });
    return () => {
      observer?.disconnect();
      root.style.removeProperty(name);
    };
  }, [ref, name, active]);
}
