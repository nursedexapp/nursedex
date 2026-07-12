/* eslint-disable local/require-pending-button -- copying a link to the clipboard. It writes nothing to a
   server, so there is no hung request to show and nothing to hand back: the
   Check icon already says it worked and a toast says when it did not. */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ReviewLinkCardProps {
  slug: string;
}

export function ReviewLinkCard({ slug }: ReviewLinkCardProps) {
  const [copied, setCopied] = useState(false);

  const url =
    typeof window === "undefined"
      ? `https://nursedex.com/reviews/${slug}`
      : `${window.location.origin}/reviews/${slug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy automatically. Select and copy the link.");
    }
  };

  return (
    <Card className="border-sage/20">
      <CardContent className="space-y-3 pt-5">
        <div>
          <h3 className="font-heading text-soft-black text-base font-semibold">
            Get reviews from past clients
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Share this link with families you&apos;ve worked with. They can
            leave a review with no NurseDex account needed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={url}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            className="text-sm"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={handleCopy}
            aria-label="Copy review link"
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
