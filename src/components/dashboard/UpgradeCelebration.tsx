"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { CircleCheckIcon, XIcon } from "lucide-react";

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

    // Bespoke, calm celebration toast. We bypass toast.success on purpose:
    // the global Toaster runs richColors, whose loud filled style reads like
    // an alert. The confetti carries the celebration, so the toast just needs
    // to be quiet, readable, and on-brand.
    toast.custom(
      (id) => (
        <div className="border-sage/40 flex w-[356px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border bg-white p-4 shadow-lg">
          <CircleCheckIcon className="text-teal mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-soft-black text-sm font-semibold">
              Welcome to Featured
            </p>
            <p className="text-soft-black-light mt-0.5 text-sm">
              Your priority placement is live.
            </p>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(id);
                router.push("/dashboard/analytics");
              }}
              className="text-teal hover:text-teal-dark mt-2 text-sm font-medium underline-offset-4 hover:underline"
            >
              View analytics
            </button>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => toast.dismiss(id)}
            className="text-soft-black-light/50 hover:text-soft-black -m-1 shrink-0 p-1 transition-colors"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ),
      { duration: 7000, unstyled: true },
    );

    // Strip the query param so a refresh doesn't replay the celebration.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("upgraded");
    const qs = params.toString();
    router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
  }, [upgraded, router, searchParams]);

  return null;
}
