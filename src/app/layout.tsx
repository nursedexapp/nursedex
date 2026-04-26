import type { Metadata, Viewport } from "next";
import { Fraunces, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://nursedex.com"),
  title: "NurseDex | Long Island's Trusted Nurse Directory",
  description:
    "Find verified, trusted caregivers on Long Island. Join the waitlist for early access to NurseDex.",
  manifest: "/site.webmanifest",
  openGraph: {
    title: "NurseDex | Long Island's Trusted Nurse Directory",
    description:
      "Find verified, trusted caregivers on Long Island. Join the waitlist for early access.",
    url: "https://nursedex.com",
    siteName: "NurseDex",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "NurseDex | Long Island's Trusted Nurse Directory",
    description:
      "Find verified, trusted caregivers on Long Island. Join the waitlist for early access.",
  },
};

export const viewport: Viewport = {
  themeColor: "#2A7B6F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
