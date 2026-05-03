"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { regenerateReviewLink } from "@/lib/reviews/external-actions";

interface ReviewLinkCardProps {
  initialToken: string;
}

export function ReviewLinkCard({ initialToken }: ReviewLinkCardProps) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const url =
    typeof window === "undefined"
      ? `https://nursedex.com/reviews/${token}`
      : `${window.location.origin}/reviews/${token}`;

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

  const handleRegenerate = () => {
    startTransition(async () => {
      const result = await regenerateReviewLink();
      if (result.error || !result.link) {
        toast.error(result.error ?? "Could not regenerate. Please try again.");
        return;
      }
      setToken(result.link.token);
      toast.success("New link generated. Old one no longer works.");
    });
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
            className="font-mono text-xs"
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

        <button
          type="button"
          onClick={handleRegenerate}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-2 hover:underline disabled:opacity-60"
        >
          <RefreshCw
            className={pending ? "size-3 animate-spin" : "size-3"}
            aria-hidden="true"
          />
          {pending ? "Regenerating..." : "Regenerate link"}
        </button>
        <p className="text-muted-foreground text-[11px]">
          Regenerating immediately invalidates the old link.
        </p>
      </CardContent>
    </Card>
  );
}
