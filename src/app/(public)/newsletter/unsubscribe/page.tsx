import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { unsubscribeNewsletter } from "@/lib/newsletter/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe | NurseDex",
  robots: { index: false, follow: false },
};

interface UnsubscribePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function UnsubscribePage({
  searchParams,
}: UnsubscribePageProps) {
  const { token } = await searchParams;
  const outcome = await unsubscribeNewsletter(token ?? "");
  const ok = outcome === "ok";
  // Three states, not two (#847). "This link is not valid" is a claim about
  // the token in their email footer, and a read that fell over cannot make it:
  // it sends somebody who wants out of the newsletter away with nothing to try.
  const unavailable = outcome === "unavailable";

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="max-w-md text-center">
        {ok ? (
          <CheckCircle2 className="text-teal mx-auto size-12" />
        ) : (
          <XCircle className="text-soft-black-light mx-auto size-12" />
        )}
        <h1 className="font-heading text-soft-black mt-4 text-2xl font-semibold">
          {ok
            ? "You are unsubscribed"
            : unavailable
              ? "We could not unsubscribe you just now"
              : "This link is not valid"}
        </h1>
        <p className="text-soft-black-light mt-2">
          {ok
            ? "You will not receive any more NurseDex newsletter emails. You can resubscribe any time from the blog."
            : unavailable
              ? "Something went wrong on our end. Open the link from your email again in a few minutes."
              : "This unsubscribe link is invalid or has expired."}
        </p>
        <Link
          href="/blog"
          className="text-teal-dark mt-6 inline-block text-sm font-medium hover:underline"
        >
          Back to the blog
        </Link>
      </div>
    </div>
  );
}
