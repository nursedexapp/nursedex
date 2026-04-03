"use client";

import { useState } from "react";

type FAQSectionProps = {
  role: "nurse" | "family";
};

const faqs = {
  shared: [
    {
      question: "What areas does NurseDex cover?",
      answer:
        "NurseDex is focused on Long Island, serving Nassau County, Suffolk County, and Queens. We are built specifically for this community.",
    },
    {
      question: "How is NurseDex different from an agency?",
      answer:
        "Agencies take a cut of caregiver pay and control the relationship. NurseDex lets families and caregivers connect directly. Caregivers set their own rates and keep 100% of what they earn.",
    },
    {
      question: "When does NurseDex launch?",
      answer:
        "We are in the final stages of building NurseDex. Join the waitlist and you will be the first to know when we go live.",
    },
  ],
  nurse: {
    question: "Is NurseDex free?",
    answer:
      "It is free for caregivers to create a profile and be discovered by families. Featured listings are available if you want top placement in search results. Families pay a separate monthly subscription to unlock your contact information.",
  },
  family: {
    question: "Is NurseDex free?",
    answer:
      "Families pay a monthly subscription to unlock caregiver contact information. Caregivers create profiles for free, so there is a wide selection of verified professionals to browse.",
  },
};

export function FAQSection({ role }: FAQSectionProps) {
  const roleFaq = faqs[role];
  const allFaqs = [roleFaq, ...faqs.shared];
  const [selected, setSelected] = useState(0);

  return (
    <section className="bg-white px-6 pt-20 pb-10 border-t border-sage-light/40">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-heading text-3xl text-soft-black sm:text-4xl">
          Frequently asked questions
        </h2>

        {/* Desktop: side by side */}
        <div className="mt-12 hidden md:grid md:grid-cols-2 md:gap-12">
          <div className="space-y-1">
            {allFaqs.map((faq, i) => (
              <button
                key={`${role}-${i}`}
                type="button"
                onClick={() => setSelected(i)}
                className={`w-full cursor-pointer rounded-lg px-4 py-3 text-left font-body text-base transition-colors ${
                  selected === i
                    ? "bg-sage-light/30 font-medium text-soft-black"
                    : "text-soft-black-light hover:bg-sage-light/15"
                }`}
              >
                {faq.question}
              </button>
            ))}
          </div>

          <div className="flex items-start pt-3">
            <p className="font-body text-base leading-relaxed text-soft-black-light">
              {allFaqs[selected].answer}
            </p>
          </div>
        </div>

        {/* Mobile: stacked accordion-style with click to reveal */}
        <div className="mt-12 space-y-3 md:hidden">
          {allFaqs.map((faq, i) => (
            <div key={`${role}-mobile-${i}`}>
              <button
                type="button"
                onClick={() => setSelected(selected === i ? -1 : i)}
                className="w-full cursor-pointer border-b border-sage-light/40 px-1 py-3 text-left font-body text-base font-medium text-soft-black"
              >
                {faq.question}
              </button>
              {selected === i && (
                <p className="px-1 pb-3 pt-2 font-body text-sm leading-relaxed text-soft-black-light">
                  {faq.answer}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
