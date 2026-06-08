import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getConfirmedSubscriberCount } from "@/lib/newsletter/queries";
import { NewsletterComposer } from "@/components/admin/NewsletterComposer";

export const metadata: Metadata = {
  title: "Newsletter | NurseDex Admin",
  robots: { index: false, follow: false },
};

export default async function NewsletterPage() {
  const count = await getConfirmedSubscriberCount();

  return (
    <div className="mx-auto w-full max-w-2xl p-6 sm:p-8">
      <Link
        href="/admin/blog"
        className="text-soft-black-light hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Back to posts
      </Link>
      <h1 className="font-heading text-soft-black text-2xl font-semibold">
        Newsletter
      </h1>
      <p className="text-soft-black-light mt-1 mb-6 text-sm">
        Compose and send to confirmed subscribers. Every email includes a
        one-click unsubscribe link.
      </p>

      <NewsletterComposer subscriberCount={count} />
    </div>
  );
}
