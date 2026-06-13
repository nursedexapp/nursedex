import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About | NurseDex",
  description:
    "NurseDex is a hyper local directory of nurses and aides across New York, built to make finding (and being found by) trusted care simpler.",
  openGraph: {
    title: "About NurseDex",
    description: "Hyper local directory of nurses and aides across New York.",
    type: "website",
    url: "https://nursedex.com/about",
  },
};

export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <header className="mb-8">
          <h1 className="font-heading text-soft-black text-3xl font-semibold sm:text-4xl">
            About NurseDex
          </h1>
          <p className="text-soft-black-light mt-3 text-lg">
            A hyper local directory of nurses and aides across New York.
          </p>
        </header>

        <article className="text-soft-black space-y-6 text-base leading-relaxed">
          <p>
            Finding good nursing care for someone you love is hard. National
            care marketplaces give you thousands of profiles you can&apos;t
            verify, and word-of-mouth referrals only help if you happen to know
            the right people. We built NurseDex to fill the gap in New York
            specifically: a directory of nurses and aides whose credentials we
            review, with real reviews from real local families.
          </p>

          <h2 className="font-heading text-soft-black pt-2 text-xl font-semibold">
            What we do
          </h2>
          <p>
            We review each nurse&apos;s credentials, checking licenses and
            certifications against New York State records when applicable, before
            their profile becomes visible to families. We keep
            the directory limited to Suffolk, Nassau, and Queens so search
            results stay relevant. We make reviews come from email-verified
            families and run them through moderation, so what you read is
            something an actual person stood behind.
          </p>

          <h2 className="font-heading text-soft-black pt-2 text-xl font-semibold">
            How we make money
          </h2>
          <p>
            We charge families $9.99 a month for Family Access (or $39.99 for
            their first year on the annual plan), which lets them reveal nurse
            contact info and reach out directly. We charge nurses $29 a month
            for an optional Featured tier that includes top placement in search,
            longer bios, more photos, and analytics. Free profiles for nurses
            are always available; the only thing we don&apos;t do is run ads on
            the site.
          </p>

          <h2 className="font-heading text-soft-black pt-2 text-xl font-semibold">
            Who we are
          </h2>
          <p>
            NurseDex LLC is based in Ronkonkoma, NY. We&apos;re a small team and
            read every contact form submission. If something on the site
            doesn&apos;t sit right with you, or there&apos;s a feature you wish
            existed, we&apos;d genuinely like to know.
          </p>

          <h2 className="font-heading text-soft-black pt-2 text-xl font-semibold">
            Get in touch
          </h2>
          <p>
            Email us at{" "}
            <a
              href="mailto:support@nursedex.com"
              className="text-teal hover:underline"
            >
              support@nursedex.com
            </a>{" "}
            or use{" "}
            <Link href="/contact" className="text-teal hover:underline">
              the contact form
            </Link>
            .
          </p>
        </article>
      </main>
    </div>
  );
}
