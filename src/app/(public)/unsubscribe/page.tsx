import type { Metadata } from "next";
import { UnsubscribeForm } from "@/components/blog/UnsubscribeForm";

export const metadata: Metadata = {
  title: "Unsubscribe | NurseDex",
  robots: { index: false, follow: true },
};

// The generic unsubscribe link in every email footer (no per-recipient
// token) lands here. The newsletter's own one-click link (with a token)
// lives at /newsletter/unsubscribe.
export default function UnsubscribePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-20">
      <h1 className="font-heading text-soft-black text-2xl font-semibold">
        Unsubscribe
      </h1>
      <p className="text-soft-black-light mt-2 mb-6 text-sm">
        Enter your email to stop receiving the NurseDex newsletter. This only
        affects marketing emails; you will still get essential account and
        service messages.
      </p>
      <UnsubscribeForm />
    </main>
  );
}
