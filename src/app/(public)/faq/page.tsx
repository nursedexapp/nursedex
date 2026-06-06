import type { Metadata } from "next";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "FAQ | NurseDex",
  description:
    "Common questions from families and nurses about NurseDex. License verification, pricing, reviews, cancellations, and more.",
  openGraph: {
    title: "Frequently asked questions | NurseDex",
    description:
      "Answers about license verification, pricing, reviews, and cancellations.",
    type: "website",
    url: "https://nursedex.com/faq",
  },
};

const FAMILY_FAQS = [
  {
    q: "How does NurseDex verify nurses?",
    a: "Every nurse on NurseDex has had their license number checked against the New York State database before their profile becomes visible to families. We re-verify if a nurse changes their name or credential. The verified badge on a profile means we've actually pulled their record.",
  },
  {
    q: "Why do I have to pay to see contact info?",
    a: "Browsing nurse profiles is always free. Family Access ($9.99/month, or $39.99 for your first year on the annual plan) is what unlocks contact info (email, phone, preferred method). It's how we stay in business without running ads or selling your data, and it deters scrapers and spam.",
  },
  {
    q: "What happens if I cancel Family Access?",
    a: "You'll keep access to nurses you already revealed for 60 more days, so you don't suddenly lose contact info for someone you're working with. After that you can resubscribe at any time. New reveals after cancellation require an active subscription.",
  },
  {
    q: "How are reviews verified?",
    a: "Reviews come from one of two flows: (1) families who revealed a nurse on NurseDex can leave one directly, or (2) past clients can use a unique share link the nurse generates. Either way, the reviewer's email is verified before the review is submitted to the moderation queue, and a moderator approves before it appears on the nurse's profile.",
  },
  {
    q: "Can I get a refund?",
    a: "We don't issue refunds. You can cancel anytime through the Stripe billing portal; access continues to the end of the period you've already paid for.",
  },
];

const NURSE_FAQS = [
  {
    q: "Is NurseDex free for nurses?",
    a: "Yes. Free profiles get one photo, a 150-character bio, up to two care types, and standard 72-hour license verification. Featured ($29/month) bumps you to top placement, three photos, 500-character bio, unlimited care types, 24-hour priority verification, and analytics.",
  },
  {
    q: "How long does verification take?",
    a: "Free profiles are verified within 72 hours. Featured nurses have a 24-hour SLA. We pull your license against the NY State database; if there's a mismatch we'll email you with a specific reason and you can resubmit.",
  },
  {
    q: "What if my license verification is rejected?",
    a: "You'll get an email with the exact reason (e.g., 'License number not found,' 'Name does not match license records'). Update your profile to correct the issue and resubmit; there's no limit on resubmissions, and Featured nurses keep their priority placement on resubmission.",
  },
  {
    q: "How do I get reviews?",
    a: "Verified nurses get a permanent share link on their dashboard. Send it to past clients by text or email; they fill out a short form, confirm their email, and the review goes to our moderation queue. About two weeks after verification we'll also email you a reminder with the link, just in case.",
  },
  {
    q: "How do hires get tracked?",
    a: "Either side can record a hire. Families can mark a nurse as hired from their revealed list; nurses can claim a hire by entering the family's NurseDex email, and the family confirms via email. Confirmed hires show up on your profile and contribute to your ranking.",
  },
  {
    q: "Can I take a break without deleting my profile?",
    a: "Yes. Toggle availability off from your dashboard; you can either hide your profile entirely or show it with an 'Unavailable' badge so families can still save you for later.",
  },
];

export default function FaqPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 sm:py-16">
        <header className="mb-8">
          <h1 className="font-heading text-soft-black text-3xl font-semibold sm:text-4xl">
            Frequently asked questions
          </h1>
          <p className="text-soft-black-light mt-2 text-base">
            Don&apos;t see your question? Email{" "}
            <a
              href="mailto:support@nursedex.com"
              className="text-teal underline underline-offset-2"
            >
              support@nursedex.com
            </a>{" "}
            or use{" "}
            <Link
              href="/contact"
              className="text-teal underline underline-offset-2"
            >
              the contact form
            </Link>
            .
          </p>
        </header>

        <FaqSection title="For families" items={FAMILY_FAQS} />
        <FaqSection title="For nurses" items={NURSE_FAQS} />
      </main>
    </div>
  );
}

function FaqSection({
  title,
  items,
}: {
  title: string;
  items: Array<{ q: string; a: string }>;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-heading text-soft-black mb-2 text-xl font-semibold">
        {title}
      </h2>
      <Accordion>
        {items.map((item, idx) => (
          <AccordionItem key={`${title}-${idx}`} value={`${title}-${idx}`}>
            <AccordionTrigger>{item.q}</AccordionTrigger>
            <AccordionContent>
              <p className="text-soft-black-light">{item.a}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
