import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NurseDex Brand Guidelines",
  description:
    "The official brand guidelines for NurseDex — colors, typography, logo, voice, and more.",
};

export default function BrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
