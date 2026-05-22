"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // This project's design tokens are --color-* (Tailwind v4), so the
          // original var(--popover)/var(--border)/var(--radius) resolved to
          // nothing. Point them at the real tokens.
          "--normal-bg": "var(--color-popover)",
          "--normal-text": "var(--color-popover-foreground)",
          "--normal-border": "var(--color-border)",
          "--border-radius": "var(--radius-lg)",
          // Soften richColors: replace sonner's bold dark fills with calm,
          // readable on-brand tints (light background, dark text).
          "--success-bg": "#eef5f2",
          "--success-text": "#1f5c53",
          "--success-border": "#cfe2db",
          "--info-bg": "#eef5f2",
          "--info-text": "#1f5c53",
          "--info-border": "#cfe2db",
          "--warning-bg": "#fbf3df",
          "--warning-text": "#7a611c",
          "--warning-border": "#ecd7a3",
          "--error-bg": "#fcebe9",
          "--error-text": "#b42318",
          "--error-border": "#f1c9c4",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
