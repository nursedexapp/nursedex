import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { confirmNewsletter } from "@/lib/newsletter/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Newsletter | NurseDex",
  robots: { index: false, follow: false },
};

const COPY = {
  confirmed: {
    ok: true,
    heading: "You are subscribed",
    body: "Thanks for confirming. New posts will land in your inbox.",
  },
  already: {
    ok: true,
    heading: "Already confirmed",
    body: "Your subscription is already active. Nothing more to do.",
  },
  invalid: {
    ok: false,
    heading: "This link is not valid",
    body: "The confirmation link is invalid or has expired. Try subscribing again from the blog.",
  },
} as const;

interface ConfirmPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function NewsletterConfirmPage({
  searchParams,
}: ConfirmPageProps) {
  const { token } = await searchParams;
  const result = await confirmNewsletter(token ?? "");
  const copy = COPY[result];

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="max-w-md text-center">
        {copy.ok ? (
          <CheckCircle2 className="text-teal mx-auto size-12" />
        ) : (
          <XCircle className="text-soft-black-light mx-auto size-12" />
        )}
        <h1 className="font-heading text-soft-black mt-4 text-2xl font-semibold">
          {copy.heading}
        </h1>
        <p className="text-soft-black-light mt-2">{copy.body}</p>
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
