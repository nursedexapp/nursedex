import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { verifyExternalReview } from "@/lib/reviews/external-actions";

export const metadata: Metadata = {
  title: "Confirm your review | NurseDex",
  robots: { index: false, follow: false },
};

interface VerifyPageProps {
  params: Promise<{ token: string }>;
}

export default async function VerifyReviewPage({ params }: VerifyPageProps) {
  const { token } = await params;
  const result = await verifyExternalReview(token);

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <Card className="border-sage/20">
          <CardContent className="space-y-3 py-8 text-center">
            {result.success ? (
              <>
                <CheckCircle2 className="text-teal mx-auto size-10" />
                <h1 className="font-heading text-soft-black text-xl font-semibold">
                  Review confirmed
                </h1>
                <p className="text-soft-black-light text-sm">
                  Thanks{result.reviewerName ? `, ${result.reviewerName}` : ""}.
                  Your {result.rating}-star review is now in our moderation
                  queue and will appear on the nurse&apos;s profile once
                  approved.
                </p>
                <p className="text-muted-foreground text-xs">
                  Looking for a nurse for your own family?{" "}
                  <Link href="/nurses" className="text-teal hover:underline">
                    Browse NurseDex
                  </Link>
                </p>
              </>
            ) : (
              <>
                <AlertTriangle className="mx-auto size-10 text-amber-500" />
                <h1 className="font-heading text-soft-black text-xl font-semibold">
                  Link not valid
                </h1>
                <p className="text-soft-black-light text-sm">
                  This confirmation link has expired or has already been used.
                  Ask the nurse for a new review link if you&apos;d still like
                  to leave a review.
                </p>
                <p className="text-muted-foreground text-xs">
                  <Link href="/" className="text-teal hover:underline">
                    Go to NurseDex
                  </Link>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
