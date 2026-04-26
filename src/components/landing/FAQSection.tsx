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

  return (
    <section className="border-sage-light/40 border-t bg-white px-6 py-20">
      <div className="mx-auto max-w-2xl">
        <h2 className="font-heading text-soft-black text-3xl sm:text-4xl">
          Frequently asked questions
        </h2>

        <dl className="mt-12 space-y-8">
          {allFaqs.map((faq, i) => (
            <div key={`${role}-${i}`}>
              <dt className="font-body text-soft-black text-base font-medium">
                {faq.question}
              </dt>
              <dd className="border-teal/30 font-body text-soft-black-light mt-2 border-l-2 pl-4 text-base leading-relaxed">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
