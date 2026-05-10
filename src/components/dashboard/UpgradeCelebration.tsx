"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import confetti from "canvas-confetti";

export function UpgradeCelebration() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const upgraded = searchParams.get("upgraded");

  useEffect(() => {
    if (upgraded !== "featured") return;

    // Brand-tinted confetti from two angles so it spans the viewport.
    const colors = ["#1f7a5a", "#3a9c7a", "#f1c84b", "#ffffff"];
    const fire = (originX: number, angle: number) => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: originX, y: 0.7 },
        angle,
        colors,
        scalar: 1.1,
        gravity: 0.9,
        ticks: 200,
      });
    };
    fire(0.2, 60);
    fire(0.8, 120);
    setTimeout(() => {
      fire(0.5, 90);
    }, 250);

    toast.success("Welcome to Featured.", {
      description:
        "Your priority placement is live. Check your analytics dashboard to see views and saves over time.",
      duration: 7000,
      action: {
        label: "View analytics",
        onClick: () => router.push("/dashboard/analytics"),
      },
    });

    // Strip the query param so a refresh doesn't replay the celebration.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("upgraded");
    const qs = params.toString();
    router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
  }, [upgraded, router, searchParams]);

  return null;
}
