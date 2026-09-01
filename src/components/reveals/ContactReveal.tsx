"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { COMMUNICATION_PREFERENCE_LABELS } from "@/types/enums";
import type { CommunicationPreference } from "@/types/enums";
import { RevealCTA } from "./RevealCTA";
import { ContactDetailsCard } from "./ContactDetailsCard";
import type { RevealedContact } from "./ContactDetailsCard";

interface ContactRevealProps {
  nurseUserId: string;
  nurseFirstName: string;
  /** Where to come back to after subscribing, usually the current profile. */
  returnTo: string;
  mode: "anon" | "no_sub" | "subscribed";
  /** The nurse's stated preference, shown before the reveal when it is known. */
  communicationPreference: string | null;
}

/**
 * The contact section for a family who has not revealed this nurse yet: the
 * CTA, and then the contact itself the moment the reveal succeeds.
 *
 * The swap is the fix for #831. Until it, the contact reached the screen ONLY
 * by way of router.refresh() bringing back a server render that had the reveal
 * in it, and that render can lose the race with the write it is reading: in CI
 * the row was written and the slot spent, the action returned 200, the refresh
 * fetched a fresh render 770ms later, and the page still rendered the button
 * for the full fifteen seconds the spec waited. The retry passed in 4.2s.
 *
 * revealNurse already returns the contact on success, so at the moment the
 * family was looking at a button, the browser was holding the email. This
 * renders what the action handed back, which removes the race by construction
 * rather than widening a timeout to win it.
 */
export function ContactReveal({
  nurseUserId,
  nurseFirstName,
  returnTo,
  mode,
  communicationPreference,
}: ContactRevealProps) {
  const [revealed, setRevealed] = useState<RevealedContact | null>(null);

  if (revealed) {
    return <ContactDetailsCard contact={revealed} />;
  }

  const prefLabel = communicationPreference
    ? COMMUNICATION_PREFERENCE_LABELS[
        communicationPreference as CommunicationPreference
      ]
    : null;

  return (
    <Card className="border-teal/20 bg-teal/5">
      <CardContent className="py-6 text-center">
        <Lock className="text-teal/60 mx-auto mb-3 size-8" />
        <h2 className="font-heading text-lg font-semibold">
          Contact {nurseFirstName}
        </h2>
        {prefLabel && (
          <p className="text-muted-foreground mt-1 text-xs">
            {nurseFirstName} prefers to be contacted by {prefLabel.toLowerCase()}
          </p>
        )}
        <div className="mt-4 flex justify-center">
          <RevealCTA
            nurseUserId={nurseUserId}
            nurseFirstName={nurseFirstName}
            returnTo={returnTo}
            mode={mode}
            onRevealed={setRevealed}
          />
        </div>
      </CardContent>
    </Card>
  );
}
