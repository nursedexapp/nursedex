"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NurseCard } from "@/components/nurses/NurseCard";
import type { NurseSearchCard } from "@/lib/nurses/card";

interface SurveyResultCardProps {
  nurse: NurseSearchCard;
  // /signup?survey=... , carries the survey filters through the handoff.
  signupHref: string;
  dimmed?: boolean;
}

/**
 * A survey-results nurse card that, when clicked, opens a dismissible
 * sign-up prompt instead of forcing a navigation. The visitor can sign up,
 * or close it and keep browsing.
 */
export function SurveyResultCard({
  nurse,
  signupHref,
  dimmed,
}: SurveyResultCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`See more of ${nurse.first_name}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="focus-visible:ring-teal block cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <NurseCard nurse={nurse} anonymousMode interactive dimmed={dimmed} />
      </div>

      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          See more of {nurse.first_name}
        </DialogTitle>
        <DialogDescription className="text-soft-black-light text-sm">
          Create a free account to open full profiles. No card needed to look
          around.
        </DialogDescription>

        <ul className="text-soft-black space-y-2 py-1 text-sm">
          <li className="flex items-start gap-2">
            <Check className="text-teal mt-0.5 size-4 shrink-0" />
            Full profiles, credentials, and photos
          </li>
          <li className="flex items-start gap-2">
            <Check className="text-teal mt-0.5 size-4 shrink-0" />
            Save the nurses you like
          </li>
          <li className="flex items-start gap-2">
            <Check className="text-teal mt-0.5 size-4 shrink-0" />
            Your survey filters come with you
          </li>
        </ul>

        <Link
          href={signupHref}
          className="bg-teal hover:bg-teal-dark inline-flex h-10 w-full items-center justify-center rounded-lg px-4 text-sm font-medium text-white transition-colors"
        >
          Create a free account
        </Link>

        <div className="text-soft-black-light flex items-center justify-center gap-3 text-xs">
          <DialogClose
            render={
              <Button
                variant="ghost"
                className="text-soft-black-light hover:text-soft-black h-auto px-1 py-0 text-xs font-normal"
              />
            }
          >
            Keep browsing
          </DialogClose>
          <span aria-hidden="true">·</span>
          <Link
            href="/login"
            className="hover:text-soft-black underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
