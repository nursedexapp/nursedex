"use client";

import Script from "next/script";
import { useCallback, useEffect, useId, useRef } from "react";

interface TurnstileWidgetProps {
  onSolved: (token: string) => void;
}

// Minimal TS for the Cloudflare Turnstile API we use.
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

/**
 * Inline Cloudflare Turnstile widget. Loads the API script (idempotent;
 * Cloudflare's script handles repeat injects) and renders a widget into a
 * div. Calls onSolved with the token when the user passes the challenge.
 */
export function TurnstileWidget({ onSolved }: TurnstileWidgetProps) {
  const containerId = useId();
  const widgetIdRef = useRef<string | null>(null);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const render = useCallback(() => {
    if (!sitekey || !window.turnstile) return;
    const el = document.getElementById(containerId);
    if (!el) return;
    if (widgetIdRef.current) return; // already rendered
    widgetIdRef.current = window.turnstile.render(el, {
      sitekey,
      callback: onSolved,
      "error-callback": () => {
        // Surface a soft error; the user can retry.
        console.warn("[turnstile] challenge errored");
      },
    });
  }, [containerId, sitekey, onSolved]);

  useEffect(() => {
    // If the script already loaded, render immediately. Otherwise the
    // Script onLoad below will handle it.
    if (window.turnstile) render();
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore remove errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [render]);

  if (!sitekey) {
    return (
      <p className="text-destructive text-xs">
        CAPTCHA not configured. Contact support.
      </p>
    );
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
        onLoad={render}
      />
      <div id={containerId} />
    </>
  );
}
