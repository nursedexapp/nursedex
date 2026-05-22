"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleCheckIcon, XIcon } from "lucide-react";
import { fireBrandConfetti } from "@/lib/celebrate";

/**
 * Fires once when a family lands back from Stripe checkout with
 * `?subscribed=family`. Mounted in the root layout so it works wherever
 * the family returns to (a nurse profile or the dashboard). Mirrors the
 * nurse Featured celebration: brand confetti plus a calm on-brand toast.
 */
export function FamilyAccessCelebration() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subscribed = searchParams.get("subscribed");

  useEffect(() => {
    if (subscribed !== "family") return;

    fireBrandConfetti();

    toast.custom(
      (id) => (
        <div className="border-sage/40 flex w-[356px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border bg-white p-4 shadow-lg">
          <CircleCheckIcon className="text-teal mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-soft-black text-sm font-semibold">
              Welcome to Family Access
            </p>
            <p className="text-soft-black-light mt-0.5 text-sm">
              You can now reveal contact info for any verified nurse. Reach out
              anytime.
            </p>
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

    // Strip the param so a refresh doesn't replay the celebration, keeping
    // whatever page the family landed on.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("subscribed");
    const qs = params.toString();
    const path = window.location.pathname;
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }, [subscribed, router, searchParams]);

  return null;
}
